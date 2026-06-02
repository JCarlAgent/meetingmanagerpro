import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  Calendar,
  Camera,
  Download,
  KeyRound,
  LayoutDashboard,
  Mail,
  MapPin,
  Phone,
  Save,
  User,
  Building2,
  AlertTriangle,
  Plus,
  Trash2,
} from 'lucide-react';

type Org = {
  id: string;
  name: string;
  slug: string;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  contact_job_title?: string | null;
};

type Profile = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  city_served: string | null;
  photo_url: string | null;
  photo_enabled: boolean | null;
};

type JobRow = {
  id: string;
  job_number: string;
  title: string | null;
  status: string;
  created_at: string;
};

type MeetingRow = {
  id: string;
  job_id: string;
  starts_at: string | null;
  location_name: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  created_at: string;
};

type MeetingWithJob = MeetingRow & {
  job: JobRow | null;
};

type MeetingExpense = {
  meeting_id: string;
  user_id: string;
  dinner_cost: number | null;
  office_expenses: number | null;
  gas: number | null;
  other: number | null;
  notes: string | null;
};

type MeetingResultRow = {
  id: string;
  job_id: string;
  meeting_id: string;
  attendees_actual: number | null;
  no_shows: number | null;
  walk_ins: number | null;
  appointments_booked: number | null;
  appointments_attended: number | null;
  products_sold_count: number | null;
  notes: string | null;
  reported_by: string | null;
  reported_at: string | null;
};

type MeetingSaleRow = {
  id: string;
  job_id: string;
  meeting_id: string;
  meeting_result_id: string | null;
  product_type: string | null;
  carrier_or_company: string | null;
  premium_or_asset_amount: number | null;
  gross_revenue: number | null;
  commission_amount: number | null;
  status: string | null;
  notes: string | null;
  created_at?: string;
};

type JobStatsRow = {
  job_id: string;
  mailed_count: number | null;
  responses_total: number | null;
  responses_confirmed: number | null;
  responses_scheduled: number | null;
};

type ResponseRow = {
  id: string;
  job_id: string;
  status: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  address1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  scheduled_appointment: boolean;
};

type Banner = { type: 'success' | 'error'; text: string };

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
  }
}

function formatWhen(startsAt: string | null): string {
  if (!startsAt) return 'TBD';
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return startsAt;
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function isUpcoming(startsAt: string | null): boolean {
  if (!startsAt) return true;
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return true;
  return d.getTime() >= Date.now();
}

function formatLocation(m: MeetingRow): string {
  const parts = [
    m.location_name,
    m.address1,
    m.address2,
    [m.city, m.state].filter(Boolean).join(', '),
    m.postal_code,
  ].filter(Boolean);
  return parts.length ? parts.join(' • ') : '—';
}

function parseMoney(v: string): number | null {
  const cleaned = v.trim();
  if (!cleaned) return null;
  const num = Number(cleaned.replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(num)) return null;
  return num;
}

function parseInteger(v: string): number | null {
  const cleaned = v.trim();
  if (!cleaned) return null;
  const num = Number.parseInt(cleaned.replace(/[^0-9-]/g, ''), 10);
  if (!Number.isFinite(num)) return null;
  return num;
}

function formatMoney(v: number | null | undefined): string {
  if (v === null || v === undefined) return '';
  if (!Number.isFinite(v)) return '';
  return String(v);
}

function csvEscape(v: unknown): string {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export interface AdvisorHomeViewProps {
  orgId: string;
  userId: string;
  onNavigate?: (view: string) => void;
}

const AdvisorHomeView: React.FC<AdvisorHomeViewProps> = ({ orgId, userId, onNavigate }) => {
  const { user } = useAuth();
  const [org, setOrg] = useState<Org | null>(null);
  const [isIndependent, setIsIndependent] = useState<boolean>(true);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [cityServed, setCityServed] = useState('');
  const [photoEnabled, setPhotoEnabled] = useState(false);

  const [meetings, setMeetings] = useState<MeetingWithJob[]>([]);
  const [expensesByMeeting, setExpensesByMeeting] = useState<Map<string, MeetingExpense>>(new Map());
  const [meetingResultsByMeeting, setMeetingResultsByMeeting] = useState<Map<string, MeetingResultRow>>(new Map());
  const [meetingSalesByMeeting, setMeetingSalesByMeeting] = useState<Map<string, MeetingSaleRow[]>>(new Map());
  const [deletedMeetingSalesByMeeting, setDeletedMeetingSalesByMeeting] = useState<Map<string, string[]>>(new Map());

  const [isLoading, setIsLoading] = useState(true);
  const [banner, setBanner] = useState<Banner | null>(null);

  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [savingExpenseMeetingId, setSavingExpenseMeetingId] = useState<string | null>(null);
  const [savingMeetingResultId, setSavingMeetingResultId] = useState<string | null>(null);
  const [savingMeetingSalesMeetingId, setSavingMeetingSalesMeetingId] = useState<string | null>(null);
  const [isSendingToFmo, setIsSendingToFmo] = useState(false);
  const [isSendingPasswordReset, setIsSendingPasswordReset] = useState(false);

  const [jobStatsByJobId, setJobStatsByJobId] = useState<Map<string, JobStatsRow>>(new Map());
  const [responsesByJobId, setResponsesByJobId] = useState<Map<string, ResponseRow[]>>(new Map());
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [savingResponseId, setSavingResponseId] = useState<string | null>(null);

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function formatAddress(r: ResponseRow): string {
  const parts = [r.address1, [r.city, r.state].filter(Boolean).join(', '), r.postal_code].filter(Boolean);
  return parts.length ? parts.join(' • ') : '—';
}

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 5000);
    return () => clearTimeout(t);
  }, [banner]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setBanner(null);

    try {
      const [{ data: orgRow, error: orgErr }, { data: memberRows, error: memErr }] = await Promise.all([
        supabase
          .from('orgs')
          .select('id, name, slug, contact_name, contact_email, contact_phone, contact_job_title')
          .eq('id', orgId)
          .maybeSingle(),
        supabase.from('org_members').select('user_id, role').eq('org_id', orgId).limit(2000),
      ]);
      if (orgErr) throw orgErr;
      if (memErr) throw memErr;

      setOrg((orgRow as any) || null);

      const members = ((memberRows ?? []) as any[]) || [];
      // Independent advisor orgs typically have no FMO/org admins.
      const hasFmoAdmin = members.some((m) => m.role === 'fmo_admin' || m.role === 'org_admin');
      setIsIndependent(!hasFmoAdmin);

      // Best-effort: profiles might not exist yet.
      try {
        const { data: profileRow, error: profileErr } = await supabase
          .from('profiles')
          .select('user_id, full_name, email, phone, city_served, photo_url, photo_enabled')
          .eq('user_id', userId)
          .maybeSingle();

        if (profileErr) {
          const msg = (profileErr as any)?.message || '';
          if (!/relation .*profiles.* does not exist/i.test(msg)) throw profileErr;
        }

        const p = (profileRow as any) as Profile | null;
        setProfile(p);
        setFullName(p?.full_name || '');
        setEmail(p?.email || '');
        setPhone(p?.phone || '');
        setCityServed(p?.city_served || '');
        setPhotoEnabled(Boolean(p?.photo_enabled));
      } catch {
        // ignore
      }

      const { data: jobsRows, error: jobsErr } = await supabase
        .from('jobs')
        .select('id, job_number, title, status, created_at')
        .eq('org_id', orgId)
        .eq('created_by_user_id', userId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (jobsErr) throw jobsErr;

      const jobs = ((jobsRows ?? []) as unknown as JobRow[]) || [];
      const jobIds = jobs.map((j) => j.id);
      const jobById = new Map(jobs.map((j) => [j.id, j] as const));

      if (!jobIds.length) {
        setMeetings([]);
        setExpensesByMeeting(new Map());
        return;
      }

      const { data: mtgRows, error: mtgErr } = await supabase
        .from('job_meetings')
        .select('id, job_id, starts_at, location_name, address1, address2, city, state, postal_code, created_at')
        .in('job_id', jobIds)
        .order('starts_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });
      if (mtgErr) throw mtgErr;

      const meetingRows = ((mtgRows ?? []) as unknown as MeetingRow[]) || [];
      const nextMeetings: MeetingWithJob[] = meetingRows.map((m) => ({ ...m, job: jobById.get(m.job_id) ?? null }));
      setMeetings(nextMeetings);

      // If this advisor is under an FMO/org admin, also load mailer results for their jobs.
      if (!isIndependent && jobIds.length) {
        try {
          const [{ data: statsRows, error: statsErr }, { data: respRows, error: respErr }] = await Promise.all([
            supabase
              .from('job_stats')
              .select('job_id, mailed_count, responses_total, responses_confirmed, responses_scheduled')
              .in('job_id', jobIds)
              .limit(5000),
            supabase
              .from('responses')
              .select(
                'id, job_id, status, full_name, phone, email, address1, city, state, postal_code, scheduled_appointment'
              )
              .in('job_id', jobIds)
              .order('created_at', { ascending: false })
              .limit(5000),
          ]);

          if (!statsErr) {
            const m = new Map<string, JobStatsRow>();
            const rows = ((statsRows ?? []) as unknown as JobStatsRow[]) || [];
            for (const row of rows) m.set(String(row.job_id), row);
            setJobStatsByJobId(m);
          } else {
            setJobStatsByJobId(new Map());
          }

          if (!respErr) {
            const byJob = new Map<string, ResponseRow[]>();
            const rows = ((respRows ?? []) as unknown as ResponseRow[]) || [];
            for (const r of rows) {
              const key = String(r.job_id);
              const list = byJob.get(key) || [];
              list.push({
                ...r,
                scheduled_appointment: Boolean((r as any).scheduled_appointment),
              });
              byJob.set(key, list);
            }
            setResponsesByJobId(byJob);
          } else {
            setResponsesByJobId(new Map());
          }
        } catch {
          setJobStatsByJobId(new Map());
          setResponsesByJobId(new Map());
        }
      } else {
        setJobStatsByJobId(new Map());
        setResponsesByJobId(new Map());
      }

      const pastMeetingIds = nextMeetings.filter((m) => !isUpcoming(m.starts_at)).map((m) => m.id);
      if (!pastMeetingIds.length) {
        setExpensesByMeeting(new Map());
        setMeetingResultsByMeeting(new Map());
        setMeetingSalesByMeeting(new Map());
        setDeletedMeetingSalesByMeeting(new Map());
        return;
      }

      // Best-effort: expenses table might not exist yet.
      try {
        const { data: expRows, error: expErr } = await supabase
          .from('meeting_expenses')
          .select('meeting_id, user_id, dinner_cost, office_expenses, gas, other, notes')
          .eq('user_id', userId)
          .in('meeting_id', pastMeetingIds)
          .limit(5000);

        if (expErr) {
          const msg = (expErr as any)?.message || '';
          if (!/relation .*meeting_expenses.* does not exist/i.test(msg)) throw expErr;
        }

        const map = new Map<string, MeetingExpense>();
        for (const row of (expRows ?? []) as any[]) {
          map.set(String(row.meeting_id), {
            meeting_id: String(row.meeting_id),
            user_id: String(row.user_id),
            dinner_cost: row.dinner_cost === null ? null : Number(row.dinner_cost),
            office_expenses: row.office_expenses === null ? null : Number(row.office_expenses),
            gas: row.gas === null ? null : Number(row.gas),
            other: row.other === null ? null : Number(row.other),
            notes: row.notes ?? null,
          });
        }
        setExpensesByMeeting(map);
      } catch {
        // ignore
      }

      try {
        const [{ data: resultRows, error: resultErr }, { data: salesRows, error: salesErr }] = await Promise.all([
          supabase
            .from('meeting_results')
            .select(
              'id, job_id, meeting_id, attendees_actual, no_shows, walk_ins, appointments_booked, appointments_attended, products_sold_count, notes, reported_by, reported_at'
            )
            .in('meeting_id', pastMeetingIds)
            .limit(5000),
          supabase
            .from('meeting_sales')
            .select(
              'id, job_id, meeting_id, meeting_result_id, product_type, carrier_or_company, premium_or_asset_amount, gross_revenue, commission_amount, status, notes, created_at'
            )
            .in('meeting_id', pastMeetingIds)
            .order('created_at', { ascending: true })
            .limit(5000),
        ]);

        if (!resultErr) {
          const nextResults = new Map<string, MeetingResultRow>();
          for (const row of (resultRows ?? []) as any[]) {
            const meetingId = String(row.meeting_id || '');
            if (!meetingId) continue;
            nextResults.set(meetingId, {
              id: String(row.id),
              job_id: String(row.job_id),
              meeting_id: meetingId,
              attendees_actual: row.attendees_actual === null ? null : Number(row.attendees_actual),
              no_shows: row.no_shows === null ? null : Number(row.no_shows),
              walk_ins: row.walk_ins === null ? null : Number(row.walk_ins),
              appointments_booked: row.appointments_booked === null ? null : Number(row.appointments_booked),
              appointments_attended: row.appointments_attended === null ? null : Number(row.appointments_attended),
              products_sold_count: row.products_sold_count === null ? null : Number(row.products_sold_count),
              notes: row.notes ?? null,
              reported_by: row.reported_by ?? null,
              reported_at: row.reported_at ?? null,
            });
          }
          setMeetingResultsByMeeting(nextResults);
        } else {
          setMeetingResultsByMeeting(new Map());
        }

        if (!salesErr) {
          const nextSales = new Map<string, MeetingSaleRow[]>();
          for (const row of (salesRows ?? []) as any[]) {
            const meetingId = String(row.meeting_id || '');
            if (!meetingId) continue;
            const list = nextSales.get(meetingId) || [];
            list.push({
              id: String(row.id),
              job_id: String(row.job_id),
              meeting_id: meetingId,
              meeting_result_id: row.meeting_result_id ?? null,
              product_type: row.product_type ?? null,
              carrier_or_company: row.carrier_or_company ?? null,
              premium_or_asset_amount: row.premium_or_asset_amount === null ? null : Number(row.premium_or_asset_amount),
              gross_revenue: row.gross_revenue === null ? null : Number(row.gross_revenue),
              commission_amount: row.commission_amount === null ? null : Number(row.commission_amount),
              status: row.status ?? null,
              notes: row.notes ?? null,
              created_at: row.created_at ?? undefined,
            });
            nextSales.set(meetingId, list);
          }
          setMeetingSalesByMeeting(nextSales);
          setDeletedMeetingSalesByMeeting(new Map());
        } else {
          setMeetingSalesByMeeting(new Map());
          setDeletedMeetingSalesByMeeting(new Map());
        }
      } catch {
        setMeetingResultsByMeeting(new Map());
        setMeetingSalesByMeeting(new Map());
        setDeletedMeetingSalesByMeeting(new Map());
      }
    } catch (err: unknown) {
      setBanner({ type: 'error', text: toErrorMessage(err) });
      setOrg(null);
      setMeetings([]);
      setExpensesByMeeting(new Map());
      setMeetingResultsByMeeting(new Map());
      setMeetingSalesByMeeting(new Map());
      setDeletedMeetingSalesByMeeting(new Map());
    } finally {
      setIsLoading(false);
    }
  }, [orgId, userId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleExpanded = (jobId: string) => {
    setExpandedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  };

  const updateResponse = async (responseId: string, updates: Partial<{ status: string; scheduled_appointment: boolean; scheduled_at: string | null }>) => {
    setSavingResponseId(responseId);
    setBanner(null);
    try {
      const { data, error } = await supabase
        .from('responses')
        .update(updates as any)
        .eq('id', responseId)
        .select('id, job_id, status, full_name, phone, email, address1, city, state, postal_code, scheduled_appointment')
        .maybeSingle();
      if (error) throw error;

      const updated = (data as any) as ResponseRow | null;
      if (!updated) return;

      setResponsesByJobId((prev) => {
        const next = new Map(prev);
        const jobId = String(updated.job_id);
        const list = (next.get(jobId) || []).map((r) => (r.id === updated.id ? { ...r, ...updated } : r));
        next.set(jobId, list);
        return next;
      });
    } catch (err: unknown) {
      setBanner({ type: 'error', text: toErrorMessage(err) });
    } finally {
      setSavingResponseId(null);
    }
  };

  const resultsCards = useMemo(() => {
    if (isIndependent) return [] as Array<{ job: JobRow; meeting: MeetingWithJob | null }>;
    const byJob = new Map<string, MeetingWithJob[]>();
    for (const m of meetings) {
      const key = m.job?.id ? String(m.job.id) : String(m.job_id);
      const list = byJob.get(key) || [];
      list.push(m);
      byJob.set(key, list);
    }

    const rows: Array<{ job: JobRow; meeting: MeetingWithJob | null }> = [];
    for (const m of meetings) {
      const job = m.job;
      if (!job) continue;
      const key = String(job.id);
      if (rows.some((r) => r.job.id === key)) continue;
      const list = byJob.get(key) || [];
      list.sort((a, b) => new Date(String(a.starts_at ?? '')).getTime() - new Date(String(b.starts_at ?? '')).getTime());
      rows.push({ job, meeting: list[0] || null });
    }

    rows.sort((a, b) => {
      const at = a.meeting?.starts_at ? new Date(String(a.meeting.starts_at)).getTime() : 0;
      const bt = b.meeting?.starts_at ? new Date(String(b.meeting.starts_at)).getTime() : 0;
      return bt - at;
    });
    return rows;
  }, [isIndependent, meetings]);

  const upcomingMeetings = useMemo(() => meetings.filter((m) => isUpcoming(m.starts_at)), [meetings]);
  const pastMeetings = useMemo(
    () => meetings.filter((m) => !isUpcoming(m.starts_at)).slice().reverse(),
    [meetings]
  );

  const buildCsvString = useCallback(() => {
    const header = [
      'Job #',
      'Campaign Title',
      'Meeting Date/Time',
      'Location',
      'Dinner',
      'Office',
      'Gas',
      'Other',
      'Notes',
    ];

    const lines = [header.map(csvEscape).join(',')];
    for (const m of pastMeetings) {
      const exp = expensesByMeeting.get(m.id);
      lines.push(
        [
          m.job?.job_number || '',
          m.job?.title || '',
          formatWhen(m.starts_at),
          formatLocation(m),
          exp?.dinner_cost ?? '',
          exp?.office_expenses ?? '',
          exp?.gas ?? '',
          exp?.other ?? '',
          exp?.notes ?? '',
        ]
          .map(csvEscape)
          .join(',')
      );
    }

    return lines.join('\n');
  }, [expensesByMeeting, pastMeetings]);

  const saveProfile = async () => {
    setBanner(null);

    const name = fullName.trim();
    if (!name) {
      setBanner({ type: 'error', text: 'Please enter your full name.' });
      return;
    }

    try {
      setIsSavingProfile(true);
      const payload = {
        user_id: userId,
        full_name: name,
        email: email.trim() || null,
        phone: phone.trim() || null,
        city_served: cityServed.trim() || null,
        photo_enabled: photoEnabled,
      };

      const { data, error } = await supabase
        .from('profiles')
        .upsert(payload as any, { onConflict: 'user_id' })
        .select('user_id, full_name, email, phone, city_served, photo_url, photo_enabled')
        .single();
      if (error) throw error;

      setProfile((data as any) || null);
      setBanner({ type: 'success', text: 'Saved profile.' });
    } catch (err: unknown) {
      setBanner({ type: 'error', text: toErrorMessage(err) });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const uploadPhoto = async (file: File) => {
    setBanner(null);

    try {
      setIsUploadingPhoto(true);
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${userId}/avatar.${ext}`;

      const { error: uploadErr } = await supabase.storage.from('advisor-photos').upload(path, file, {
        upsert: true,
        contentType: file.type || undefined,
      });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from('advisor-photos').getPublicUrl(path);
      const photoUrl = urlData?.publicUrl || null;

      const { data, error } = await supabase
        .from('profiles')
        .upsert({ user_id: userId, photo_url: photoUrl, photo_enabled: true } as any, { onConflict: 'user_id' })
        .select('user_id, full_name, email, phone, city_served, photo_url, photo_enabled')
        .single();
      if (error) throw error;

      setProfile((data as any) || null);
      setPhotoEnabled(true);
      setBanner({ type: 'success', text: 'Uploaded photo.' });
    } catch (err: unknown) {
      setBanner({ type: 'error', text: toErrorMessage(err) });
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const patchExpense = (meetingId: string, patch: Partial<MeetingExpense>) => {
    setExpensesByMeeting((prev) => {
      const next = new Map(prev);
      const existing = next.get(meetingId) || {
        meeting_id: meetingId,
        user_id: userId,
        dinner_cost: null,
        office_expenses: null,
        gas: null,
        other: null,
        notes: null,
      };
      next.set(meetingId, { ...existing, ...patch });
      return next;
    });
  };

  const saveExpense = async (meetingId: string) => {
    setBanner(null);

    try {
      setSavingExpenseMeetingId(meetingId);
      const row = expensesByMeeting.get(meetingId) || {
        meeting_id: meetingId,
        user_id: userId,
        dinner_cost: null,
        office_expenses: null,
        gas: null,
        other: null,
        notes: null,
      };

      const payload = {
        meeting_id: meetingId,
        user_id: userId,
        dinner_cost: row.dinner_cost,
        office_expenses: row.office_expenses,
        gas: row.gas,
        other: row.other,
        notes: row.notes,
      };

      const { data, error } = await supabase
        .from('meeting_expenses')
        .upsert(payload as any, { onConflict: 'meeting_id,user_id' })
        .select('meeting_id, user_id, dinner_cost, office_expenses, gas, other, notes')
        .single();
      if (error) throw error;

      const saved = data as any;
      patchExpense(meetingId, {
        dinner_cost: saved?.dinner_cost === null ? null : Number(saved?.dinner_cost),
        office_expenses: saved?.office_expenses === null ? null : Number(saved?.office_expenses),
        gas: saved?.gas === null ? null : Number(saved?.gas),
        other: saved?.other === null ? null : Number(saved?.other),
        notes: saved?.notes ?? null,
      });

      setBanner({ type: 'success', text: 'Saved expenses.' });
    } catch (err: unknown) {
      setBanner({ type: 'error', text: toErrorMessage(err) });
    } finally {
      setSavingExpenseMeetingId(null);
    }
  };

  const isTempSaleId = (id: string) => id.startsWith('tmp-');

  const patchMeetingResult = (meeting: MeetingWithJob, patch: Partial<MeetingResultRow>) => {
    setMeetingResultsByMeeting((prev) => {
      const next = new Map(prev);
      const existing = next.get(meeting.id) || {
        id: '',
        job_id: meeting.job_id,
        meeting_id: meeting.id,
        attendees_actual: null,
        no_shows: null,
        walk_ins: null,
        appointments_booked: null,
        appointments_attended: null,
        products_sold_count: null,
        notes: null,
        reported_by: null,
        reported_at: null,
      };
      next.set(meeting.id, { ...existing, ...patch, meeting_id: meeting.id, job_id: meeting.job_id });
      return next;
    });
  };

  const patchMeetingSale = (meeting: MeetingWithJob, saleId: string, patch: Partial<MeetingSaleRow>) => {
    setMeetingSalesByMeeting((prev) => {
      const next = new Map(prev);
      const list = [...(next.get(meeting.id) || [])];
      const idx = list.findIndex((row) => row.id === saleId);
      if (idx === -1) return prev;
      list[idx] = { ...list[idx], ...patch, meeting_id: meeting.id, job_id: meeting.job_id };
      next.set(meeting.id, list);
      return next;
    });
  };

  const addMeetingSale = (meeting: MeetingWithJob) => {
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setMeetingSalesByMeeting((prev) => {
      const next = new Map(prev);
      const list = [...(next.get(meeting.id) || [])];
      list.push({
        id: tempId,
        job_id: meeting.job_id,
        meeting_id: meeting.id,
        meeting_result_id: meetingResultsByMeeting.get(meeting.id)?.id || null,
        product_type: null,
        carrier_or_company: null,
        premium_or_asset_amount: null,
        gross_revenue: null,
        commission_amount: null,
        status: null,
        notes: null,
      });
      next.set(meeting.id, list);
      return next;
    });
  };

  const removeMeetingSale = (meetingId: string, saleId: string) => {
    setMeetingSalesByMeeting((prev) => {
      const next = new Map(prev);
      const current = next.get(meetingId) || [];
      next.set(meetingId, current.filter((row) => row.id !== saleId));
      return next;
    });

    if (!isTempSaleId(saleId)) {
      setDeletedMeetingSalesByMeeting((prev) => {
        const next = new Map(prev);
        const existing = next.get(meetingId) || [];
        next.set(meetingId, [...existing, saleId]);
        return next;
      });
    }
  };

  const saveMeetingResult = async (meeting: MeetingWithJob) => {
    setBanner(null);
    try {
      setSavingMeetingResultId(meeting.id);
      const row = meetingResultsByMeeting.get(meeting.id) || {
        id: '',
        job_id: meeting.job_id,
        meeting_id: meeting.id,
        attendees_actual: null,
        no_shows: null,
        walk_ins: null,
        appointments_booked: null,
        appointments_attended: null,
        products_sold_count: null,
        notes: null,
        reported_by: null,
        reported_at: null,
      };

      const payload = {
        job_id: meeting.job_id,
        meeting_id: meeting.id,
        attendees_actual: row.attendees_actual,
        no_shows: row.no_shows,
        walk_ins: row.walk_ins,
        appointments_booked: row.appointments_booked,
        appointments_attended: row.appointments_attended,
        products_sold_count: row.products_sold_count,
        notes: row.notes,
        reported_by: userId,
        reported_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('meeting_results')
        .upsert(payload as any, { onConflict: 'job_id,meeting_id' })
        .select(
          'id, job_id, meeting_id, attendees_actual, no_shows, walk_ins, appointments_booked, appointments_attended, products_sold_count, notes, reported_by, reported_at'
        )
        .single();
      if (error) throw error;

      const saved = data as any;
      setMeetingResultsByMeeting((prev) => {
        const next = new Map(prev);
        next.set(meeting.id, {
          id: String(saved.id),
          job_id: String(saved.job_id),
          meeting_id: String(saved.meeting_id),
          attendees_actual: saved.attendees_actual === null ? null : Number(saved.attendees_actual),
          no_shows: saved.no_shows === null ? null : Number(saved.no_shows),
          walk_ins: saved.walk_ins === null ? null : Number(saved.walk_ins),
          appointments_booked: saved.appointments_booked === null ? null : Number(saved.appointments_booked),
          appointments_attended: saved.appointments_attended === null ? null : Number(saved.appointments_attended),
          products_sold_count: saved.products_sold_count === null ? null : Number(saved.products_sold_count),
          notes: saved.notes ?? null,
          reported_by: saved.reported_by ?? null,
          reported_at: saved.reported_at ?? null,
        });
        return next;
      });

      setBanner({ type: 'success', text: 'Saved meeting results.' });
    } catch (err: unknown) {
      setBanner({ type: 'error', text: toErrorMessage(err) });
    } finally {
      setSavingMeetingResultId(null);
    }
  };

  const saveMeetingSales = async (meeting: MeetingWithJob) => {
    setBanner(null);
    try {
      setSavingMeetingSalesMeetingId(meeting.id);
      const meetingResultId = meetingResultsByMeeting.get(meeting.id)?.id || null;
      const rows = meetingSalesByMeeting.get(meeting.id) || [];
      const deletedIds = deletedMeetingSalesByMeeting.get(meeting.id) || [];

      if (deletedIds.length) {
        const { error: delErr } = await supabase.from('meeting_sales').delete().in('id', deletedIds);
        if (delErr) throw delErr;
      }

      const updateRows = rows.filter((r) => !isTempSaleId(r.id));
      for (const row of updateRows) {
        const { error: updErr } = await supabase
          .from('meeting_sales')
          .update({
            meeting_result_id: meetingResultId,
            product_type: row.product_type,
            carrier_or_company: row.carrier_or_company,
            premium_or_asset_amount: row.premium_or_asset_amount,
            gross_revenue: row.gross_revenue,
            commission_amount: row.commission_amount,
            status: row.status,
            notes: row.notes,
          } as any)
          .eq('id', row.id);
        if (updErr) throw updErr;
      }

      const insertRows = rows
        .filter((r) => isTempSaleId(r.id))
        .filter((r) => {
          return Boolean(
            (r.product_type && r.product_type.trim()) ||
              (r.carrier_or_company && r.carrier_or_company.trim()) ||
              r.premium_or_asset_amount !== null ||
              r.gross_revenue !== null ||
              r.commission_amount !== null ||
              (r.status && r.status.trim()) ||
              (r.notes && r.notes.trim())
          );
        })
        .map((r) => ({
          job_id: meeting.job_id,
          meeting_id: meeting.id,
          meeting_result_id: meetingResultId,
          product_type: r.product_type,
          carrier_or_company: r.carrier_or_company,
          premium_or_asset_amount: r.premium_or_asset_amount,
          gross_revenue: r.gross_revenue,
          commission_amount: r.commission_amount,
          status: r.status,
          notes: r.notes,
        }));

      if (insertRows.length) {
        const { error: insErr } = await supabase.from('meeting_sales').insert(insertRows as any);
        if (insErr) throw insErr;
      }

      const { data: refreshed, error: refreshErr } = await supabase
        .from('meeting_sales')
        .select(
          'id, job_id, meeting_id, meeting_result_id, product_type, carrier_or_company, premium_or_asset_amount, gross_revenue, commission_amount, status, notes, created_at'
        )
        .eq('meeting_id', meeting.id)
        .order('created_at', { ascending: true });
      if (refreshErr) throw refreshErr;

      const nextRows: MeetingSaleRow[] = ((refreshed ?? []) as any[]).map((row) => ({
        id: String(row.id),
        job_id: String(row.job_id),
        meeting_id: String(row.meeting_id),
        meeting_result_id: row.meeting_result_id ?? null,
        product_type: row.product_type ?? null,
        carrier_or_company: row.carrier_or_company ?? null,
        premium_or_asset_amount: row.premium_or_asset_amount === null ? null : Number(row.premium_or_asset_amount),
        gross_revenue: row.gross_revenue === null ? null : Number(row.gross_revenue),
        commission_amount: row.commission_amount === null ? null : Number(row.commission_amount),
        status: row.status ?? null,
        notes: row.notes ?? null,
        created_at: row.created_at ?? undefined,
      }));

      setMeetingSalesByMeeting((prev) => {
        const next = new Map(prev);
        next.set(meeting.id, nextRows);
        return next;
      });

      setDeletedMeetingSalesByMeeting((prev) => {
        const next = new Map(prev);
        next.delete(meeting.id);
        return next;
      });

      setBanner({ type: 'success', text: 'Saved meeting sales.' });
    } catch (err: unknown) {
      setBanner({ type: 'error', text: toErrorMessage(err) });
    } finally {
      setSavingMeetingSalesMeetingId(null);
    }
  };

  const exportCsv = () => {
    const csv = buildCsvString();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    const date = new Date();
    const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    a.download = `meeting-expenses-${stamp}.csv`;

    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const sendToFmo = async () => {
    setBanner(null);

    if (isIndependent) {
      setBanner({ type: 'error', text: 'Independent advisor accounts have no FMO to send to.' });
      return;
    }
    if (!org?.contact_email) {
      setBanner({ type: 'error', text: 'Your organization has no contact email configured.' });
      return;
    }
    if (pastMeetings.length === 0) {
      setBanner({ type: 'error', text: 'No past meetings to export yet.' });
      return;
    }

    try {
      setIsSendingToFmo(true);
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const csv = buildCsvString();
      const date = new Date();
      const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const filename = `meeting-expenses-${stamp}.csv`;

      const resp = await fetch('/api/notifications/expensesExport', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orgId, filename, csv }),
      });

      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error((json as any)?.error || 'Failed to send');
      }

      if ((json as any)?.ok === false && (json as any)?.skipped) {
        setBanner({ type: 'error', text: `Email skipped: ${(json as any)?.reason || 'missing configuration'}` });
        return;
      }

      setBanner({ type: 'success', text: 'Sent to FMO.' });
    } catch (err: unknown) {
      setBanner({ type: 'error', text: toErrorMessage(err) });
    } finally {
      setIsSendingToFmo(false);
    }
  };

  const sendPasswordResetEmail = async () => {
    setIsSendingPasswordReset(true);
    setBanner(null);
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      const authEmail = data.user?.email;
      if (!authEmail) throw new Error('No email found for this account.');

      const redirectTo = `${window.location.origin}/reset-password`;
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(authEmail, { redirectTo });
      if (resetErr) throw resetErr;

      setBanner({
        type: 'success',
        text: `Password reset email sent to ${authEmail}.`,
      });
    } catch (err: unknown) {
      setBanner({ type: 'error', text: toErrorMessage(err) });
    } finally {
      setIsSendingPasswordReset(false);
    }
  };

  const canSendToFmo = !isIndependent && Boolean(org?.contact_email) && pastMeetings.length > 0;

  const photoUrl = profile?.photo_enabled ? profile?.photo_url : null;
  const displayName = profile?.full_name || fullName.trim() || 'Advisor';

  return (
    <div className="max-w-6xl mx-auto">
      {banner && (
        <div
          className={`mb-5 rounded-xl border p-4 text-sm ${
            banner.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          <div className="flex items-start gap-2">
            {banner.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 mt-0.5" />
            ) : (
              <Save className="w-4 h-4 mt-0.5" />
            )}
            <div>{banner.text}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <section className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center">
                {photoUrl ? (
                  <img src={photoUrl} alt={displayName} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-8 h-8 text-slate-400" />
                )}
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Your profile</div>
                <h1 className="mt-1 text-xl font-semibold text-slate-900">{displayName}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-700">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    {cityServed.trim() || profile?.city_served || 'City not set'}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Phone className="w-4 h-4 text-slate-400" />
                    {phone.trim() || profile?.phone || 'Phone not set'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={sendPasswordResetEmail}
                disabled={isSendingPasswordReset}
                className="inline-flex items-center gap-2 rounded-lg bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-60"
                title="Send a password reset email"
              >
                <KeyRound className="w-4 h-4" />
                {isSendingPasswordReset ? 'Sending…' : 'Reset password'}
              </button>

              {!((user as any)?.org_role === 'member') && (
                <button
                  type="button"
                  onClick={() => onNavigate?.('setup')}
                  disabled={!onNavigate}
                  className="inline-flex items-center gap-2 rounded-lg bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-60"
                  title={!onNavigate ? 'Navigation unavailable' : 'Open meeting input'}
                >
                  <LayoutDashboard className="w-4 h-4" />
                  Meeting input
                </button>
              )}

              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center gap-2 rounded-lg bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 px-3 py-2 text-sm font-semibold transition-colors"
                disabled={pastMeetings.length === 0}
                title={pastMeetings.length === 0 ? 'No past meetings to export' : 'Download CSV'}
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>

              {!isIndependent && (
                <button
                  type="button"
                  onClick={sendToFmo}
                  disabled={!canSendToFmo || isSendingToFmo}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 text-white px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-60"
                  title={!org?.contact_email ? 'No organization contact email configured' : undefined}
                >
                  <Mail className="w-4 h-4" />
                  {isSendingToFmo ? 'Sending…' : 'Send to FMO'}
                </button>
              )}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Update info</div>
              <div className="mt-3 grid grid-cols-1 gap-3">
                <label className="text-sm">
                  <div className="text-xs font-semibold text-slate-600 mb-1">Full name</div>
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                    placeholder="Your full name"
                  />
                </label>

                <label className="text-sm">
                  <div className="text-xs font-semibold text-slate-600 mb-1">Email</div>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                    placeholder="you@example.com"
                  />
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-sm">
                    <div className="text-xs font-semibold text-slate-600 mb-1">Phone</div>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                      placeholder="(555) 123-4567"
                    />
                  </label>

                  <label className="text-sm">
                    <div className="text-xs font-semibold text-slate-600 mb-1">City served</div>
                    <input
                      value={cityServed}
                      onChange={(e) => setCityServed(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                      placeholder="Austin, TX"
                    />
                  </label>
                </div>

                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={photoEnabled}
                    onChange={(e) => setPhotoEnabled(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Show my photo
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={saveProfile}
                    disabled={isSavingProfile}
                    className="inline-flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60"
                  >
                    <Save className="w-4 h-4" />
                    {isSavingProfile ? 'Saving…' : 'Save'}
                  </button>

                  <label className="inline-flex items-center gap-2 rounded-lg bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 px-4 py-2 text-sm font-semibold transition-colors cursor-pointer">
                    <Camera className="w-4 h-4" />
                    {isUploadingPhoto ? 'Uploading…' : 'Upload photo'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={isUploadingPhoto}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadPhoto(f);
                        e.currentTarget.value = '';
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-4">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Organization</div>
              <div className="mt-2 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-400" />
                <div className="font-semibold text-slate-900">{org?.name || '—'}</div>
              </div>
              <div className="mt-2 text-sm text-slate-700">
                {isIndependent ? (
                  <div>Independent advisor account.</div>
                ) : (
                  <div>
                    Your FMO contact: <span className="font-semibold">{org?.contact_name || '—'}</span>
                    {org?.contact_job_title ? <span className="text-slate-600"> ({org.contact_job_title})</span> : null}
                    <div className="mt-2 text-slate-600">
                      Email: <span className="text-slate-900">{org?.contact_email || '—'}</span>
                      <br />
                      Phone: <span className="text-slate-900">{org?.contact_phone || '—'}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {!isIndependent && (
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Mailer results</div>
                <div className="mt-2 text-sm text-slate-600">Expand a meeting to review responders and mark attendance/appointments.</div>

                <div className="mt-4 space-y-2">
                  {resultsCards.length === 0 ? (
                    <div className="text-sm text-slate-500">No meetings found yet.</div>
                  ) : (
                    resultsCards.map(({ job, meeting }) => {
                      const jobId = String(job.id);
                      const isOpen = expandedJobs.has(jobId);
                      const responses = responsesByJobId.get(jobId) || [];
                      const mailed = jobStatsByJobId.get(jobId)?.mailed_count ?? null;
                      const responders = responses.length;
                      const attendees = responses.filter((r) => String(r.status) === 'confirmed').length;
                      const rate = mailed && mailed > 0 ? responders / mailed : null;
                      const meetingType = (job.title || '').trim() || job.job_number;

                      return (
                        <div key={jobId} className="rounded-lg border border-slate-200 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => toggleExpanded(jobId)}
                            className="w-full px-3 py-3 bg-white hover:bg-slate-50 text-left transition-colors"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-slate-900 truncate">{meetingType}</div>
                                <div className="mt-1 text-xs text-slate-600">
                                  {formatWhen(meeting?.starts_at ?? null)} • {meeting?.city || '—'}{meeting?.state ? `, ${meeting.state}` : ''}
                                </div>
                                <div className="mt-1 text-xs text-slate-500 truncate">{meeting ? formatLocation(meeting) : '—'}</div>
                              </div>

                              <div className="flex items-center gap-3 text-xs text-slate-700">
                                <div className="text-right">
                                  <div><span className="font-semibold">{responders}</span> responders</div>
                                  <div><span className="font-semibold">{attendees}</span> attendees</div>
                                  <div>Rate: <span className="font-semibold">{formatPercent(rate)}</span></div>
                                </div>
                                <div className="text-slate-400">{isOpen ? '−' : '+'}</div>
                              </div>
                            </div>
                          </button>

                          {isOpen && (
                            <div className="px-3 pb-3">
                              <div className="pt-2 text-xs text-slate-600">
                                Mail pieces sent: <span className="font-semibold">{mailed ?? '—'}</span>
                              </div>

                              <div className="mt-3 space-y-2">
                                {responses.length === 0 ? (
                                  <div className="text-sm text-slate-500">No responders yet.</div>
                                ) : (
                                  responses.map((r) => {
                                    const attended = String(r.status) === 'confirmed';
                                    const saving = savingResponseId === r.id;
                                    return (
                                      <div key={r.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                                          <div className="min-w-0">
                                            <div className="text-sm font-semibold text-slate-900 truncate">{r.full_name || 'Responder'}</div>
                                            <div className="mt-1 text-xs text-slate-700">
                                              {r.phone || '—'} • {r.email || '—'}
                                            </div>
                                            <div className="mt-1 text-xs text-slate-600 truncate">{formatAddress(r)}</div>
                                          </div>

                                          <div className="flex flex-wrap items-center gap-4 text-sm">
                                            <label className="inline-flex items-center gap-2 text-slate-800">
                                              <input
                                                type="checkbox"
                                                checked={attended}
                                                disabled={saving}
                                                onChange={(e) => {
                                                  const next = e.target.checked;
                                                  updateResponse(r.id, { status: next ? 'confirmed' : 'no_show' });
                                                }}
                                              />
                                              Attended
                                            </label>

                                            <label className="inline-flex items-center gap-2 text-slate-800">
                                              <input
                                                type="checkbox"
                                                checked={Boolean(r.scheduled_appointment)}
                                                disabled={saving}
                                                onChange={(e) => {
                                                  const next = e.target.checked;
                                                  updateResponse(r.id, {
                                                    scheduled_appointment: next,
                                                    scheduled_at: next ? new Date().toISOString() : null,
                                                  });
                                                }}
                                              />
                                              Appointment set
                                            </label>

                                            {saving && <span className="text-xs text-slate-500">Saving…</span>}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-red-400" />
                <h2 className="text-lg font-semibold text-slate-900">Upcoming meetings</h2>
              </div>
              <div className="mt-1 text-sm text-slate-600">Your scheduled meetings</div>
            </div>
            <button
              type="button"
              onClick={load}
              className="rounded-lg bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 px-3 py-2 text-sm font-semibold transition-colors"
            >
              Refresh
            </button>
          </div>

          {isLoading ? (
            <div className="mt-4 text-slate-500">Loading…</div>
          ) : upcomingMeetings.length === 0 ? (
            <div className="mt-4 text-slate-500">No upcoming meetings.</div>
          ) : (
            <div className="mt-4 space-y-2">
              {upcomingMeetings.map((m) => (
                <div key={m.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="text-sm font-semibold text-slate-900">{formatWhen(m.starts_at)}</div>
                  <div className="mt-1 text-xs text-slate-600">Campaign: {m.job?.job_number || '—'}</div>
                  <div className="mt-1 text-xs text-slate-700">{formatLocation(m)}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="mt-6 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">Past meetings & expenses</div>
            <div className="text-xs text-slate-600">Enter expenses after each meeting</div>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-lg bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-60"
            disabled={pastMeetings.length === 0}
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>

        <div className="border-t border-slate-200">
          {isLoading ? (
            <div className="p-5 text-slate-500">Loading…</div>
          ) : pastMeetings.length === 0 ? (
            <div className="p-5 text-slate-500">No past meetings yet.</div>
          ) : (
            <div className="divide-y divide-slate-200">
              {pastMeetings.map((m) => {
                const exp = expensesByMeeting.get(m.id);
                const resultRow = meetingResultsByMeeting.get(m.id);
                const salesRows = meetingSalesByMeeting.get(m.id) || [];
                return (
                  <details key={m.id} className="group">
                    <summary className="cursor-pointer list-none px-5 py-4 hover:bg-slate-50 flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{formatWhen(m.starts_at)}</div>
                        <div className="mt-1 text-xs text-slate-600">
                          Campaign: {m.job?.job_number || '—'} {m.job?.title ? `• ${m.job.title}` : ''}
                        </div>
                        <div className="mt-1 text-xs text-slate-700 inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          {formatLocation(m)}
                        </div>
                      </div>
                      <div className="text-xs text-slate-600 mt-1">Click to edit</div>
                    </summary>

                    <div className="px-5 pb-5">
                      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">Meeting Results</div>
                            <div className="text-xs text-slate-600">One row per meeting</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => saveMeetingResult(m)}
                            disabled={savingMeetingResultId === m.id}
                            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-60"
                          >
                            <Save className="w-3.5 h-3.5" />
                            {savingMeetingResultId === m.id ? 'Saving…' : 'Save results'}
                          </button>
                        </div>

                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          <label className="text-sm">
                            <div className="text-xs font-semibold text-slate-600 mb-1">Attendees (actual)</div>
                            <input
                              inputMode="numeric"
                              value={formatMoney(resultRow?.attendees_actual)}
                              onChange={(e) => patchMeetingResult(m, { attendees_actual: parseInteger(e.target.value) })}
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                              placeholder="0"
                            />
                          </label>
                          <label className="text-sm">
                            <div className="text-xs font-semibold text-slate-600 mb-1">No-shows</div>
                            <input
                              inputMode="numeric"
                              value={formatMoney(resultRow?.no_shows)}
                              onChange={(e) => patchMeetingResult(m, { no_shows: parseInteger(e.target.value) })}
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                              placeholder="0"
                            />
                          </label>
                          <label className="text-sm">
                            <div className="text-xs font-semibold text-slate-600 mb-1">Walk-ins</div>
                            <input
                              inputMode="numeric"
                              value={formatMoney(resultRow?.walk_ins)}
                              onChange={(e) => patchMeetingResult(m, { walk_ins: parseInteger(e.target.value) })}
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                              placeholder="0"
                            />
                          </label>
                          <label className="text-sm">
                            <div className="text-xs font-semibold text-slate-600 mb-1">Appointments booked</div>
                            <input
                              inputMode="numeric"
                              value={formatMoney(resultRow?.appointments_booked)}
                              onChange={(e) => patchMeetingResult(m, { appointments_booked: parseInteger(e.target.value) })}
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                              placeholder="0"
                            />
                          </label>
                          <label className="text-sm">
                            <div className="text-xs font-semibold text-slate-600 mb-1">Appointments attended</div>
                            <input
                              inputMode="numeric"
                              value={formatMoney(resultRow?.appointments_attended)}
                              onChange={(e) => patchMeetingResult(m, { appointments_attended: parseInteger(e.target.value) })}
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                              placeholder="0"
                            />
                          </label>
                          <label className="text-sm">
                            <div className="text-xs font-semibold text-slate-600 mb-1">Products sold (count)</div>
                            <input
                              inputMode="numeric"
                              value={formatMoney(resultRow?.products_sold_count)}
                              onChange={(e) => patchMeetingResult(m, { products_sold_count: parseInteger(e.target.value) })}
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                              placeholder="0"
                            />
                          </label>
                        </div>

                        <label className="block mt-3 text-sm">
                          <div className="text-xs font-semibold text-slate-600 mb-1">Results notes</div>
                          <textarea
                            rows={2}
                            value={resultRow?.notes || ''}
                            onChange={(e) => patchMeetingResult(m, { notes: e.target.value || null })}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                            placeholder="Optional summary notes"
                          />
                        </label>
                      </div>

                      <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">Meeting Sales</div>
                            <div className="text-xs text-slate-600">Multiple rows per meeting</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => addMeetingSale(m)}
                              className="inline-flex items-center gap-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1.5 text-xs font-semibold"
                            >
                              <Plus className="w-3.5 h-3.5" /> Add sale
                            </button>
                            <button
                              type="button"
                              onClick={() => saveMeetingSales(m)}
                              disabled={savingMeetingSalesMeetingId === m.id}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60"
                            >
                              <Save className="w-3.5 h-3.5" />
                              {savingMeetingSalesMeetingId === m.id ? 'Saving…' : 'Save sales'}
                            </button>
                          </div>
                        </div>

                        {salesRows.length === 0 ? (
                          <div className="mt-3 text-sm text-slate-500">No sales rows yet. Click Add sale.</div>
                        ) : (
                          <div className="mt-3 space-y-3">
                            {salesRows.map((sale) => (
                              <div key={sale.id} className="rounded-lg border border-slate-200 p-3 bg-slate-50">
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                  <label className="text-sm">
                                    <div className="text-xs font-semibold text-slate-600 mb-1">Product type</div>
                                    <input
                                      value={sale.product_type || ''}
                                      onChange={(e) => patchMeetingSale(m, sale.id, { product_type: e.target.value || null })}
                                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                                      placeholder="Annuity, Life, AUM, etc."
                                    />
                                  </label>
                                  <label className="text-sm">
                                    <div className="text-xs font-semibold text-slate-600 mb-1">Carrier / company</div>
                                    <input
                                      value={sale.carrier_or_company || ''}
                                      onChange={(e) => patchMeetingSale(m, sale.id, { carrier_or_company: e.target.value || null })}
                                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                                      placeholder="Carrier or firm"
                                    />
                                  </label>
                                  <label className="text-sm">
                                    <div className="text-xs font-semibold text-slate-600 mb-1">Status</div>
                                    <input
                                      value={sale.status || ''}
                                      onChange={(e) => patchMeetingSale(m, sale.id, { status: e.target.value || null })}
                                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                                      placeholder="submitted, issued, pending"
                                    />
                                  </label>
                                  <label className="text-sm">
                                    <div className="text-xs font-semibold text-slate-600 mb-1">Premium / asset amount</div>
                                    <input
                                      inputMode="decimal"
                                      value={formatMoney(sale.premium_or_asset_amount)}
                                      onChange={(e) => patchMeetingSale(m, sale.id, { premium_or_asset_amount: parseMoney(e.target.value) })}
                                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                                      placeholder="0.00"
                                    />
                                  </label>
                                  <label className="text-sm">
                                    <div className="text-xs font-semibold text-slate-600 mb-1">Gross revenue</div>
                                    <input
                                      inputMode="decimal"
                                      value={formatMoney(sale.gross_revenue)}
                                      onChange={(e) => patchMeetingSale(m, sale.id, { gross_revenue: parseMoney(e.target.value) })}
                                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                                      placeholder="0.00"
                                    />
                                  </label>
                                  <label className="text-sm">
                                    <div className="text-xs font-semibold text-slate-600 mb-1">Commission amount</div>
                                    <input
                                      inputMode="decimal"
                                      value={formatMoney(sale.commission_amount)}
                                      onChange={(e) => patchMeetingSale(m, sale.id, { commission_amount: parseMoney(e.target.value) })}
                                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                                      placeholder="0.00"
                                    />
                                  </label>
                                </div>

                                <div className="mt-3 flex items-start justify-between gap-3">
                                  <label className="text-sm flex-1">
                                    <div className="text-xs font-semibold text-slate-600 mb-1">Sale notes</div>
                                    <textarea
                                      rows={2}
                                      value={sale.notes || ''}
                                      onChange={(e) => patchMeetingSale(m, sale.id, { notes: e.target.value || null })}
                                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                                      placeholder="Optional notes"
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => removeMeetingSale(m.id, sale.id)}
                                    className="mt-6 inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 px-2 py-1.5 text-xs font-semibold"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" /> Remove
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <label className="text-sm">
                          <div className="text-xs font-semibold text-slate-600 mb-1">Dinner</div>
                          <input
                            inputMode="decimal"
                            value={formatMoney(exp?.dinner_cost)}
                            onChange={(e) => patchExpense(m.id, { dinner_cost: parseMoney(e.target.value) })}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                            placeholder="0.00"
                          />
                        </label>

                        <label className="text-sm">
                          <div className="text-xs font-semibold text-slate-600 mb-1">Office</div>
                          <input
                            inputMode="decimal"
                            value={formatMoney(exp?.office_expenses)}
                            onChange={(e) => patchExpense(m.id, { office_expenses: parseMoney(e.target.value) })}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                            placeholder="0.00"
                          />
                        </label>

                        <label className="text-sm">
                          <div className="text-xs font-semibold text-slate-600 mb-1">Gas</div>
                          <input
                            inputMode="decimal"
                            value={formatMoney(exp?.gas)}
                            onChange={(e) => patchExpense(m.id, { gas: parseMoney(e.target.value) })}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                            placeholder="0.00"
                          />
                        </label>

                        <label className="text-sm">
                          <div className="text-xs font-semibold text-slate-600 mb-1">Other</div>
                          <input
                            inputMode="decimal"
                            value={formatMoney(exp?.other)}
                            onChange={(e) => patchExpense(m.id, { other: parseMoney(e.target.value) })}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                            placeholder="0.00"
                          />
                        </label>
                      </div>

                      <label className="block mt-3 text-sm">
                        <div className="text-xs font-semibold text-slate-600 mb-1">Notes</div>
                        <textarea
                          value={exp?.notes || ''}
                          onChange={(e) => patchExpense(m.id, { notes: e.target.value || null })}
                          rows={3}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                          placeholder="Optional notes (who attended, purpose, etc.)"
                        />
                      </label>

                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => saveExpense(m.id)}
                          disabled={savingExpenseMeetingId === m.id}
                          className="inline-flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60"
                        >
                          <Save className="w-4 h-4" />
                          {savingExpenseMeetingId === m.id ? 'Saving…' : 'Save expenses'}
                        </button>
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdvisorHomeView;
