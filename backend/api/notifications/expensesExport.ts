// Removed @vercel/node types to avoid build-time dependency on Vercel typings
import { getSupabaseAdmin, requireUserFromAuthHeader } from '../_lib/supabaseAdmin.js';

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
  }
}

function safeHtml(v: unknown): string {
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
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const user = await requireUserFromAuthHeader(req);
    const body = (req.body || {}) as { orgId?: string; filename?: string; csv?: string };

    if (!body.orgId) {
      res.status(400).json({ error: 'Missing orgId' });
      return;
    }
    if (!body.csv || typeof body.csv !== 'string') {
      res.status(400).json({ error: 'Missing csv' });
      return;
    }

    const filename = (body.filename && String(body.filename).trim()) || 'meeting-expenses.csv';

    const supabaseAdmin = getSupabaseAdmin();

    // Authorization: must be a member of this org OR master admin.
    const { data: ma } = await supabaseAdmin
      .from('master_admins')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let isOrgMember = false;
    if (!ma?.user_id) {
      const { data: member } = await supabaseAdmin
        .from('org_members')
        .select('role')
        .eq('org_id', body.orgId)
        .eq('user_id', user.id)
        .maybeSingle();
      isOrgMember = Boolean(member?.role);
    }

    if (!ma?.user_id && !isOrgMember) {
      res.status(403).json({ error: 'Not authorized for this organization' });
      return;
    }

    const { data: org, error: orgErr } = await supabaseAdmin
      .from('orgs')
      .select('id, name, contact_email, contact_name')
      .eq('id', body.orgId)
      .maybeSingle();

    if (orgErr || !org?.id) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }

    const toEmail = (org as any).contact_email as string | null;
    if (!toEmail) {
      res.status(400).json({ error: 'Organization has no contact_email configured' });
      return;
    }

    // Upload CSV to Storage (service role bypasses RLS)
    const bucket = process.env.MMP_EXPORTS_BUCKET || 'expense-exports';
    const safeOrgName = String((org as any).name || 'org')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 40);

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const path = `org-${(org as any).id}/${safeOrgName}/${user.id}/${stamp}-${filename}`;

    const bytes = new TextEncoder().encode(body.csv);
    const { error: uploadErr } = await supabaseAdmin.storage.from(bucket).upload(path, bytes, {
      contentType: 'text/csv',
      upsert: false,
    });

    if (uploadErr) {
      res.status(500).json({ error: `Failed to upload export: ${uploadErr.message}` });
      return;
    }

    const { data: signed, error: signedErr } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 60 * 24 * 7);

    if (signedErr || !signed?.signedUrl) {
      res.status(500).json({ error: `Failed to create signed URL: ${signedErr?.message || 'unknown'}` });
      return;
    }

    // Email (best-effort)
    if (!process.env.RESEND_API_KEY) {
      res.status(200).json({ ok: false, skipped: true, reason: 'Missing RESEND_API_KEY', signedUrl: signed.signedUrl });
      return;
    }

    const from = process.env.RESEND_FROM || 'Meeting Manager Pro <no-reply@meetingmanagerpro.com>';
    const subject = `Meeting expenses export — ${(org as any).name || 'Organization'}`;

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.5; color: #0f172a;">
        <h2 style="margin: 0 0 10px;">Meeting expenses export</h2>
        <p style="margin: 0 0 14px; color: #334155;">An advisor has sent an expenses export for <strong>${safeHtml((org as any).name || '')}</strong>.</p>
        <p style="margin: 0 0 14px;"><a href="${safeHtml(signed.signedUrl)}">Download CSV</a> (link valid for 7 days)</p>
        <p style="margin: 18px 0 0; color: #64748b; font-size: 12px;">File: ${safeHtml(filename)}<br/>Org ID: ${safeHtml((org as any).id)}</p>
      </div>
    `;

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [toEmail],
        subject,
        html,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      res.status(200).json({ ok: false, error: 'Email send failed', status: resp.status, details: text.slice(0, 500), signedUrl: signed.signedUrl });
      return;
    }

    res.status(200).json({ ok: true, signedUrl: signed.signedUrl });
  } catch (err: unknown) {
    res.status(500).json({ error: toErrorMessage(err) });
  }
}
