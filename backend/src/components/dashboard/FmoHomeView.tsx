import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Building2, Users, Mail, Phone, Briefcase, MapPin, Calendar, ChevronDown, ChevronUp, Save } from 'lucide-react';

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
  photo_url: string | null;
  photo_enabled: boolean | null;
};

type OrgMember = {
  user_id: string;
  role: string;
  created_at: string;
};

type Job = {
  id: string;
  job_number: string;
  status: string;
  title: string | null;
  created_by_user_id: string | null;
  created_at: string;
};

type Meeting = {
  job_id: string;
  starts_at: string | null;
  location_name: string | null;
  city: string | null;
  state: string | null;
};

type UpcomingMeeting = {
  jobId: string;
  jobStatus: string;
  startsAt: string;
  advisorName: string;
  city: string | null;
  state: string | null;
  meetingType: string;
  jobNumber: string;
};

type AdvisorSummary = {
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  lastMeetingAt: string;
  lastMeetingCity: string | null;
  lastMeetingState: string | null;
  lastMeetingType: string;
  meetingsCount: number;
};

type PastCampaign = {
  jobId: string;
  jobNumber: string;
  title: string | null;
  advisorName: string;
  mailedAt: string;
};

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
  }
}

function formatPhone(raw: string | null | undefined): string {
  const v = (raw || '').trim();
  return v || '—';
}

function formatDateTimeShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

function startOfCurrentYearIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), 0, 1).toISOString();
}

export interface FmoHomeViewProps {
  orgId: string;
}

const FmoHomeView: React.FC<FmoHomeViewProps> = ({ orgId }) => {
  const { user } = useAuth();
  const [org, setOrg] = useState<Org | null>(null);
  const [companyDraft, setCompanyDraft] = useState<{
    contact_name: string;
    contact_job_title: string;
    contact_email: string;
    contact_phone: string;
  }>({
    contact_name: '',
    contact_job_title: '',
    contact_email: '',
    contact_phone: '',
  });
  const [isSavingCompany, setIsSavingCompany] = useState(false);

  const [upcomingMeetings, setUpcomingMeetings] = useState<UpcomingMeeting[]>([]);
  const [advisorSummaries, setAdvisorSummaries] = useState<AdvisorSummary[]>([]);
  const [pastCampaigns, setPastCampaigns] = useState<PastCampaign[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [advisorsOpen, setAdvisorsOpen] = useState(false);
  const [pastExpanded, setPastExpanded] = useState(false);

  const load = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [{ data: orgRow, error: orgErr }, { data: membersRows, error: memErr }, { data: jobsRows, error: jobsErr }] =
        await Promise.all([
          supabase
            .from('orgs')
            .select('id, name, slug, contact_name, contact_email, contact_phone, contact_job_title')
            .eq('id', orgId)
            .maybeSingle(),
          supabase
            .from('org_members')
            .select('user_id, role, created_at')
            .eq('org_id', orgId)
            .in('role', ['advisor', 'member'])
            .order('created_at', { ascending: false })
            .limit(2000),
          supabase
            .from('jobs')
            .select('id, job_number, status, title, created_by_user_id, created_at')
            .eq('org_id', orgId)
            .in('status', ['active', 'closed'])
            .order('created_at', { ascending: false })
            .limit(2000),
        ]);

      if (orgErr) throw orgErr;
      if (memErr) throw memErr;
      if (jobsErr) throw jobsErr;

      const nextOrg = (orgRow as any) || null;
      setOrg(nextOrg);
      setCompanyDraft({
        contact_name: String(nextOrg?.contact_name ?? ''),
        contact_job_title: String(nextOrg?.contact_job_title ?? ''),
        contact_email: String(nextOrg?.contact_email ?? ''),
        contact_phone: String(nextOrg?.contact_phone ?? ''),
      });

      const members = ((membersRows ?? []) as unknown as OrgMember[]) || [];
      const jobs = ((jobsRows ?? []) as unknown as Job[]) || [];
      const jobIds = jobs.map((j) => j.id);

      const { data: meetingsRows, error: meetingsErr } = jobIds.length
        ? await supabase
            .from('job_meetings')
            .select('job_id, starts_at, location_name, city, state')
            .in('job_id', jobIds)
            .order('starts_at', { ascending: true })
            .limit(5000)
        : ({ data: [], error: null } as any);

      if (meetingsErr) throw meetingsErr;

      const meetings = ((meetingsRows ?? []) as unknown as Meeting[]) || [];

      // Best effort: profiles table might not exist yet.
      const profileIds = Array.from(
        new Set([
          ...members.map((m) => m.user_id),
          ...jobs.map((j) => j.created_by_user_id).filter(Boolean).map((x) => String(x)),
        ])
      );

      let profiles: Profile[] = [];
      if (profileIds.length) {
        const { data: profileRows, error: profileErr } = await supabase
          .from('profiles')
          .select('user_id, full_name, email, phone, photo_url, photo_enabled')
          .in('user_id', profileIds)
          .limit(2000);
        if (!profileErr) {
          profiles = ((profileRows ?? []) as unknown as Profile[]) || [];
        }
      }

      const profileById = new Map(profiles.map((p) => [p.user_id, p] as const));

      const jobById = new Map(jobs.map((j) => [j.id, j] as const));
      const now = new Date();

      const nextUpcoming: UpcomingMeeting[] = meetings
        .filter((m) => !!m.starts_at)
        .map((m) => {
          const startsAt = String(m.starts_at);
          const job = jobById.get(m.job_id);
          const creator = job?.created_by_user_id ? profileById.get(String(job.created_by_user_id)) : null;
          const advisorName = creator?.full_name || creator?.email || (job?.created_by_user_id ? String(job.created_by_user_id) : '—');
          const meetingType = (job?.title || '').trim() || job?.job_number || 'Meeting';
          return {
            jobId: m.job_id,
            jobStatus: job?.status || 'unknown',
            startsAt,
            advisorName,
            city: m.city || null,
            state: m.state || null,
            meetingType,
            jobNumber: job?.job_number || '—',
          };
        })
        .filter((m) => {
          const d = new Date(m.startsAt);
          if (Number.isNaN(d.getTime())) return false;
          // “Going on” = upcoming meetings for active jobs.
          if (m.jobStatus !== 'active') return false;
          return d.getTime() >= now.getTime();
        })
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

      setUpcomingMeetings(nextUpcoming);

      const meetingsByAdvisor = new Map<string, { meeting: Meeting; job: Job | null }[]>();
      for (const m of meetings) {
        const job = jobById.get(m.job_id) || null;
        const advisorId = job?.created_by_user_id ? String(job.created_by_user_id) : null;
        if (!advisorId || !m.starts_at) continue;
        const list = meetingsByAdvisor.get(advisorId) || [];
        list.push({ meeting: m, job });
        meetingsByAdvisor.set(advisorId, list);
      }

      const summaries: AdvisorSummary[] = Array.from(meetingsByAdvisor.entries()).map(([advisorId, rows]) => {
        rows.sort((a, b) => new Date(String(b.meeting.starts_at)).getTime() - new Date(String(a.meeting.starts_at)).getTime());
        const latest = rows[0];
        const profile = profileById.get(advisorId) || null;
        const name = profile?.full_name || profile?.email || advisorId;
        const email = profile?.email || null;
        const phone = profile?.phone || null;
        const lastMeetingAt = String(latest?.meeting?.starts_at ?? '');
        const lastMeetingCity = latest?.meeting?.city || null;
        const lastMeetingState = latest?.meeting?.state || null;
        const lastMeetingType = (latest?.job?.title || '').trim() || latest?.job?.job_number || 'Meeting';

        return {
          userId: advisorId,
          name,
          email,
          phone,
          lastMeetingAt,
          lastMeetingCity,
          lastMeetingState,
          lastMeetingType,
          meetingsCount: rows.length,
        };
      });

      summaries.sort((a, b) => new Date(b.lastMeetingAt).getTime() - new Date(a.lastMeetingAt).getTime());
      setAdvisorSummaries(summaries);

      // Past campaigns (best effort): derive mailing date from print_orders.mailed_at.
      try {
        const yearStartIso = startOfCurrentYearIso();
        const { data: printRows, error: printErr } = jobIds.length
          ? await supabase
              .from('print_orders')
              .select('job_id, mailed_at')
              .in('job_id', jobIds)
              .not('mailed_at', 'is', null)
              .gte('mailed_at', yearStartIso)
              .order('mailed_at', { ascending: false })
              .limit(5000)
          : ({ data: [], error: null } as any);

        if (printErr) {
          // If the table isn't present yet in a given environment, don't block the whole Home view.
          setPastCampaigns([]);
        } else {
          const mailedAtByJob = new Map<string, string>();
          for (const row of (printRows ?? []) as any[]) {
            const jobId = String(row.job_id);
            const mailedAt = String(row.mailed_at);
            const prev = mailedAtByJob.get(jobId);
            if (!prev || new Date(mailedAt).getTime() > new Date(prev).getTime()) {
              mailedAtByJob.set(jobId, mailedAt);
            }
          }

          const past: PastCampaign[] = Array.from(mailedAtByJob.entries())
            .map(([jobId, mailedAt]) => {
              const job = jobById.get(jobId);
              const creator = job?.created_by_user_id ? profileById.get(String(job.created_by_user_id)) : null;
              const advisorName = creator?.full_name || creator?.email || (job?.created_by_user_id ? String(job.created_by_user_id) : '—');
              return {
                jobId,
                jobNumber: job?.job_number || '—',
                title: job?.title || null,
                advisorName,
                mailedAt,
              };
            })
            .sort((a, b) => new Date(b.mailedAt).getTime() - new Date(a.mailedAt).getTime());

          setPastCampaigns(past);
        }
      } catch {
        setPastCampaigns([]);
      }
    } catch (err: unknown) {
      setError(toErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const upcomingToShow = useMemo(() => {
    // Always show at least the next 5 by date, but if there are more than 5, let the box grow and show all.
    if (upcomingMeetings.length > 5) return upcomingMeetings;
    return upcomingMeetings.slice(0, 5);
  }, [upcomingMeetings]);

  const pastToShow = useMemo(() => {
    if (pastExpanded) return pastCampaigns;
    return pastCampaigns.slice(0, 5);
  }, [pastCampaigns, pastExpanded]);

  const repName = useMemo(() => {
    const fromOrg = (org?.contact_name || '').trim();
    const fromUser = (user as any)?.user_metadata?.full_name ? String((user as any).user_metadata.full_name) : '';
    return fromOrg || fromUser || '—';
  }, [org?.contact_name, user]);

  const saveCompanyProfile = async () => {
    setIsSavingCompany(true);
    setError(null);
    try {
      const payload = {
        contact_name: companyDraft.contact_name.trim() || null,
        contact_job_title: companyDraft.contact_job_title.trim() || null,
        contact_email: companyDraft.contact_email.trim() || null,
        contact_phone: companyDraft.contact_phone.trim() || null,
      } as any;

      const { data, error: saveErr } = await supabase
        .from('orgs')
        .update(payload)
        .eq('id', orgId)
        .select('id, name, slug, contact_name, contact_email, contact_phone, contact_job_title')
        .maybeSingle();
      if (saveErr) throw saveErr;
      const nextOrg = (data as any) || null;
      setOrg(nextOrg);
      setCompanyDraft({
        contact_name: String(nextOrg?.contact_name ?? ''),
        contact_job_title: String(nextOrg?.contact_job_title ?? ''),
        contact_email: String(nextOrg?.contact_email ?? ''),
        contact_phone: String(nextOrg?.contact_phone ?? ''),
      });
    } catch (err: unknown) {
      setError(toErrorMessage(err));
    } finally {
      setIsSavingCompany(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <section className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-red-400" />
                <h1 className="text-xl font-semibold text-slate-900">Company Profile</h1>
              </div>
              <div className="mt-1 text-sm text-slate-600">FMO: <span className="font-semibold text-slate-800">{org?.name || '—'}</span></div>
            </div>

            <button
              type="button"
              onClick={saveCompanyProfile}
              disabled={isLoading || isSavingCompany}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-3 py-2 text-sm font-semibold transition-colors"
            >
              <Save className="w-4 h-4" />
              {isSavingCompany ? 'Saving…' : 'Update info'}
            </button>
          </div>

          {isLoading ? (
            <div className="mt-4 text-slate-500">Loading…</div>
          ) : (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Representative</div>
                <div className="mt-2 text-slate-900 font-semibold">{repName}</div>
                <div className="mt-1 inline-flex items-center gap-2 text-sm text-slate-700">
                  <Briefcase className="w-4 h-4 text-slate-400" />
                  <span>{org?.contact_job_title || '—'}</span>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-4">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Contact info</div>
                <div className="mt-2 flex flex-col gap-2 text-sm text-slate-700">
                  <div className="inline-flex items-center gap-2">
                    <Phone className="w-4 h-4 text-slate-400" />
                    <span>{formatPhone(org?.contact_phone)}</span>
                  </div>
                  <div className="inline-flex items-center gap-2">
                    <Mail className="w-4 h-4 text-slate-400" />
                    <span>{org?.contact_email || '—'}</span>
                  </div>
                </div>
              </div>

              <div className="md:col-span-2 rounded-lg border border-slate-200 p-4">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Update info</div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</label>
                    <input
                      value={companyDraft.contact_name}
                      onChange={(e) => setCompanyDraft((p) => ({ ...p, contact_name: e.target.value }))}
                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      placeholder="Representative name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Job title</label>
                    <input
                      value={companyDraft.contact_job_title}
                      onChange={(e) => setCompanyDraft((p) => ({ ...p, contact_job_title: e.target.value }))}
                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      placeholder="Title"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</label>
                    <input
                      value={companyDraft.contact_email}
                      onChange={(e) => setCompanyDraft((p) => ({ ...p, contact_email: e.target.value }))}
                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      placeholder="Email"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Phone</label>
                    <input
                      value={companyDraft.contact_phone}
                      onChange={(e) => setCompanyDraft((p) => ({ ...p, contact_phone: e.target.value }))}
                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      placeholder="Phone"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-red-400" />
              <div>
                <div className="text-sm font-semibold text-slate-900">Meetings</div>
                <div className="text-xs text-slate-600">Upcoming across all advisors</div>
              </div>
            </div>
            <div className="text-3xl font-extrabold text-slate-900">{isLoading ? '—' : upcomingMeetings.length}</div>
          </div>

          <div className="mt-4">
            {isLoading ? (
              <div className="text-slate-500">Loading…</div>
            ) : upcomingToShow.length === 0 ? (
              <div className="text-slate-500">No upcoming meetings scheduled.</div>
            ) : (
              <div className="space-y-2">
                {upcomingToShow.map((m, idx) => (
                  <div key={`${m.startsAt}:${idx}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="text-sm font-semibold text-slate-900 truncate">{m.advisorName}</div>
                    <div className="mt-1 text-xs text-slate-700 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {formatDateTimeShort(m.startsAt)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        {[m.city, m.state].filter(Boolean).join(', ') || '—'}
                      </span>
                      <span className="truncate">Type: <span className="font-semibold">{m.meetingType}</span></span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">Campaign: {m.jobNumber}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="mt-6 space-y-4">
        <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setAdvisorsOpen((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50"
          >
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-red-400" />
              <div className="text-left">
                <div className="text-sm font-semibold text-slate-900">Advisors</div>
                <div className="text-xs text-slate-600">{advisorsOpen ? 'Click to hide advisors' : 'Click to see advisors'}</div>
              </div>
            </div>
            {advisorsOpen ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
          </button>

          {advisorsOpen && (
            <div className="border-t border-slate-200 p-5">
              {isLoading ? (
                <div className="text-slate-500">Loading…</div>
              ) : advisorSummaries.length === 0 ? (
                <div className="text-slate-500">No advisors have meetings yet.</div>
              ) : (
                <div className="space-y-2">
                  {advisorSummaries.map((a) => (
                    <div
                      key={a.userId}
                      className="h-12 w-full rounded-lg border border-slate-200 bg-white px-4 flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">{a.name}</div>
                        <div className="text-[11px] text-slate-500 truncate">{[a.email, a.phone].filter(Boolean).join(' • ') || '—'}</div>
                      </div>

                      <div className="text-xs text-slate-700 flex items-center gap-3 shrink-0">
                        <span className="hidden sm:inline-flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {formatDateShort(a.lastMeetingAt)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          {[a.lastMeetingCity, a.lastMeetingState].filter(Boolean).join(', ') || '—'}
                        </span>
                        <span className="hidden md:inline">{a.lastMeetingType}</span>
                        <span className="text-slate-500">({a.meetingsCount})</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-red-400" />
              <div>
                <div className="text-sm font-semibold text-slate-900">Past campaigns</div>
                <div className="text-xs text-slate-600">Newest to oldest by mailing date (current year)</div>
              </div>
            </div>

            {pastCampaigns.length > 5 && (
              <button
                type="button"
                onClick={() => setPastExpanded((v) => !v)}
                className="text-sm font-semibold text-red-700 hover:text-red-800"
              >
                {pastExpanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>

          <div className="border-t border-slate-200 p-5">
            {isLoading ? (
              <div className="text-slate-500">Loading…</div>
            ) : pastToShow.length === 0 ? (
              <div className="text-slate-500">No mailed campaigns found for this year yet.</div>
            ) : (
              <div className="space-y-2">
                {pastToShow.map((c) => (
                  <div key={c.jobId} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-900">{c.jobNumber}</span>
                          <span className="text-xs text-slate-500 truncate">{c.title || ''}</span>
                        </div>
                        <div className="mt-1 text-xs text-slate-700">
                          Advisor: <span className="font-semibold">{c.advisorName}</span>
                        </div>
                      </div>
                      <div className="shrink-0 text-xs text-slate-600 inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {formatDateShort(c.mailedAt)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default FmoHomeView;
