import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdmin, requireUserFromAuthHeader } from '../_lib/supabaseAdmin.js';

type Summary = Record<string, unknown>;

function parseEmailList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\n]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function canAccessJob(args: { userId: string; email: string | null; jobId: string }) {
  const supabaseAdmin = getSupabaseAdmin();

  const { data: ma } = await supabaseAdmin
    .from('master_admins')
    .select('user_id')
    .eq('user_id', args.userId)
    .maybeSingle();

  if (ma?.user_id) return { ok: true as const, reason: 'master_admins' };

  if (args.email) {
    const { data: adminEmail } = await supabaseAdmin
      .from('admins')
      .select('email')
      .ilike('email', args.email)
      .maybeSingle();
    if (adminEmail?.email) return { ok: true as const, reason: 'admins_email' };
  }

  const { data: job, error: jobErr } = await supabaseAdmin
    .from('jobs')
    .select('id, org_id, created_by_user_id, job_number, title, status')
    .eq('id', args.jobId)
    .maybeSingle();

  if (jobErr || !job?.id) {
    return { ok: false as const, reason: 'job_not_found' };
  }

  const { data: member } = await supabaseAdmin
    .from('org_members')
    .select('role')
    .eq('org_id', job.org_id)
    .eq('user_id', args.userId)
    .maybeSingle();

  if (!member?.role) return { ok: false as const, reason: 'not_org_member' };
  if (member.role === 'fmo_admin') return { ok: true as const, reason: 'fmo_admin' };
  if (job.created_by_user_id === args.userId) return { ok: true as const, reason: 'job_owner' };

  return { ok: false as const, reason: 'advisor_not_owner' };
}

function formatSummaryHtml(summary: Summary): string {
  const safe = (v: unknown) => {
    const s = String(v ?? '').trim();
    return s.replace(/[&<>"']/g, (ch) => {
      switch (ch) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '"':
          return '&quot;';
        case "'":
          return '&#39;';
        default:
          return ch;
      }
    });
  };

  const meetings = Array.isArray((summary as any).meetings) ? ((summary as any).meetings as any[]) : [];
  const template = (summary as any).template as any;
  const rsvp = (summary as any).rsvpMethods as any;
  const demographics = (summary as any).demographics as any;
  const campaign = (summary as any).campaign as any;
  const job = (summary as any).job as any;

  const meetingItems = meetings
    .slice(0, 6)
    .map((m, idx) => {
      const when = [m?.date, m?.time].filter(Boolean).join(' ');
      const where = [m?.location_name, m?.address1, [m?.city, m?.state].filter(Boolean).join(', ')].filter(Boolean).join(' • ');
      return `<li><strong>Meeting ${idx + 1}:</strong> ${safe(where)}${when ? ` — ${safe(when)}` : ''}</li>`;
    })
    .join('');

  const rsvpBits = [
    rsvp?.call_center ? 'Call center' : null,
    rsvp?.qr_code ? 'QR code' : null,
  ].filter(Boolean);

  const demoLine = demographics?.mode === 'upload'
    ? `Upload list${demographics?.listName ? ` (${safe(demographics.listName)})` : ''}`
    : demographics?.mode === 'printer'
      ? 'Printer-provided demographics'
      : '';

  return `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.5; color: #0f172a;">
      <h2 style="margin: 0 0 12px;">Campaign setup complete</h2>
      <p style="margin: 0 0 16px; color: #334155;">${safe(job?.job_number || '')}${job?.title ? ` — ${safe(job.title)}` : ''}</p>

      <h3 style="margin: 20px 0 8px;">Summary</h3>
      <ul style="margin: 0 0 12px; padding-left: 18px;">
        <li><strong>Mail quantity:</strong> ${safe(campaign?.mailQuantity ?? '')}</li>
        <li><strong>Template:</strong> ${safe(template?.name ?? '')}</li>
        <li><strong>Confirmation method(s):</strong> ${safe(rsvpBits.join(', '))}</li>
        <li><strong>Mailing list:</strong> ${demoLine || '—'}</li>
      </ul>

      ${meetingItems ? `
        <h3 style="margin: 20px 0 8px;">Meetings</h3>
        <ul style="margin: 0; padding-left: 18px;">${meetingItems}</ul>
      ` : ''}

      <p style="margin: 22px 0 0; color: #475569; font-size: 12px;">Job ID: ${safe(job?.id || '')} • Status: ${safe(job?.status || '')}</p>
    </div>
  `;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const user = await requireUserFromAuthHeader(req);
    const { jobId, summary } = (req.body || {}) as { jobId?: string; summary?: Summary };

    if (!jobId) {
      res.status(400).json({ error: 'Missing jobId' });
      return;
    }

    const access = await canAccessJob({ userId: user.id, email: user.email, jobId });
    if (!access.ok) {
      res.status(403).json({ error: 'Not authorized for this job', reason: access.reason });
      return;
    }

    if (!process.env.RESEND_API_KEY) {
      res.status(200).json({ ok: false, skipped: true, reason: 'Missing RESEND_API_KEY' });
      return;
    }

    if (!user.email) {
      res.status(200).json({ ok: false, skipped: true, reason: 'Missing user email' });
      return;
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: job } = await supabaseAdmin
      .from('jobs')
      .select('id, job_number, title')
      .eq('id', jobId)
      .maybeSingle();

    const subject = `Setup complete: ${job?.job_number || 'Campaign'}${job?.title ? ` — ${job.title}` : ''}`;

    const from = process.env.RESEND_FROM || 'Meeting Manager Pro <no-reply@meetingmanagerpro.com>';
    const to = [user.email];
    const cc = parseEmailList(process.env.MMP_SETUP_COMPLETE_CC);
    const bcc = parseEmailList(process.env.MMP_SETUP_COMPLETE_BCC);

    const html = formatSummaryHtml({ ...(summary || {}), job: { ...(summary as any)?.job, ...(job || {}) } });

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        cc: cc.length ? cc : undefined,
        bcc: bcc.length ? bcc : undefined,
        subject,
        html,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      res.status(200).json({ ok: false, error: 'Email send failed', status: resp.status, details: text.slice(0, 500) });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
}
