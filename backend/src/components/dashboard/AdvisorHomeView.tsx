import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Calendar,
  Camera,
  Download,
  KeyRound,
  Mail,
  MapPin,
  Phone,
  Save,
  User,
  Building2,
  AlertTriangle,
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
}

const AdvisorHomeView: React.FC<AdvisorHomeViewProps> = ({ orgId, userId }) => {
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

  const [isLoading, setIsLoading] = useState(true);
  const [banner, setBanner] = useState<Banner | null>(null);

  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [savingExpenseMeetingId, setSavingExpenseMeetingId] = useState<string | null>(null);
  const [isSendingToFmo, setIsSendingToFmo] = useState(false);
  const [isSendingPasswordReset, setIsSendingPasswordReset] = useState(false);

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

      const pastMeetingIds = nextMeetings.filter((m) => !isUpcoming(m.starts_at)).map((m) => m.id);
      if (!pastMeetingIds.length) {
        setExpensesByMeeting(new Map());
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
    } catch (err: unknown) {
      setBanner({ type: 'error', text: toErrorMessage(err) });
      setOrg(null);
      setMeetings([]);
      setExpensesByMeeting(new Map());
    } finally {
      setIsLoading(false);
    }
  }, [orgId, userId]);

  useEffect(() => {
    load();
  }, [load]);

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
