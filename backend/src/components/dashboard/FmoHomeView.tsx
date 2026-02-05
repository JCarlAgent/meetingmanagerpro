import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Building2, Search, Users, Mail, Phone, Briefcase, MapPin, Calendar, ChevronDown, ChevronUp } from 'lucide-react';

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

function formatDateRange(starts: (string | null | undefined)[]): string {
  const dates = starts
    .filter(Boolean)
    .map((d) => new Date(String(d)).getTime())
    .filter((t) => Number.isFinite(t));
  if (!dates.length) return '—';
  const min = new Date(Math.min(...dates));
  const max = new Date(Math.max(...dates));
  const fmt = (d: Date) => d.toLocaleDateString();
  return min.getTime() === max.getTime() ? fmt(min) : `${fmt(min)} – ${fmt(max)}`;
}

function joinLocations(meetings: Meeting[]): string {
  const set = new Set<string>();
  for (const m of meetings) {
    const parts = [m.location_name, [m.city, m.state].filter(Boolean).join(', ')].filter(Boolean);
    if (parts.length) set.add(parts.join(' • '));
  }
  const list = Array.from(set);
  if (!list.length) return '—';
  if (list.length <= 2) return list.join(' / ');
  return `${list.slice(0, 2).join(' / ')} +${list.length - 2}`;
}

export interface FmoHomeViewProps {
  orgId: string;
}

const FmoHomeView: React.FC<FmoHomeViewProps> = ({ orgId }) => {
  const [org, setOrg] = useState<Org | null>(null);
  const [advisors, setAdvisors] = useState<(OrgMember & { profile: Profile | null })[]>([]);
  const [campaigns, setCampaigns] = useState<
    (Job & { meetings: Meeting[]; advisorName: string })[]
  >([]);

  const [activeCampaignsCount, setActiveCampaignsCount] = useState<number>(0);
  const [respondentsTotal, setRespondentsTotal] = useState<number>(0);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [advisorsOpen, setAdvisorsOpen] = useState(false);
  const [campaignsOpen, setCampaignsOpen] = useState(false);
  const [advisorQuery, setAdvisorQuery] = useState('');

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
            .limit(1000),
          supabase
            .from('jobs')
            .select('id, job_number, status, title, created_by_user_id, created_at')
            .eq('org_id', orgId)
            .in('status', ['active'])
            .order('created_at', { ascending: false })
            .limit(500),
        ]);

      if (orgErr) throw orgErr;
      if (memErr) throw memErr;
      if (jobsErr) throw jobsErr;

      setOrg((orgRow as any) || null);

      const members = ((membersRows ?? []) as unknown as OrgMember[]) || [];
      const jobs = ((jobsRows ?? []) as unknown as Job[]) || [];

      setActiveCampaignsCount(jobs.length);

      const jobIds = jobs.map((j) => j.id);

      const [{ data: meetingsRows, error: meetingsErr }, responsesCountResult] = await Promise.all([
        jobIds.length
          ? supabase
              .from('job_meetings')
              .select('job_id, starts_at, location_name, city, state')
              .in('job_id', jobIds)
              .order('starts_at', { ascending: true })
              .limit(5000)
          : Promise.resolve({ data: [], error: null } as any),
        jobIds.length
          ? supabase
              .from('responses')
              .select('id', { count: 'exact', head: true })
              .in('job_id', jobIds)
          : Promise.resolve({ count: 0 } as any),
      ]);

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
          .select('user_id, full_name, email, phone, city_served, photo_url, photo_enabled')
          .in('user_id', profileIds)
          .limit(2000);
        if (!profileErr) {
          profiles = ((profileRows ?? []) as unknown as Profile[]) || [];
        }
      }

      const profileById = new Map(profiles.map((p) => [p.user_id, p] as const));

      setAdvisors(
        members.map((m) => ({
          ...m,
          profile: profileById.get(m.user_id) || null,
        }))
      );

      const meetingsByJob = new Map<string, Meeting[]>();
      for (const mtg of meetings) {
        const list = meetingsByJob.get(mtg.job_id) || [];
        list.push(mtg);
        meetingsByJob.set(mtg.job_id, list);
      }

      const nextCampaigns = jobs.map((j) => {
        const creator = j.created_by_user_id ? profileById.get(String(j.created_by_user_id)) : null;
        const advisorName = creator?.full_name || creator?.email || (j.created_by_user_id ? String(j.created_by_user_id) : '—');
        return {
          ...j,
          advisorName,
          meetings: meetingsByJob.get(j.id) || [],
        };
      });

      setCampaigns(nextCampaigns);
      setRespondentsTotal(Number((responsesCountResult as any)?.count ?? 0));
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

  const filteredAdvisors = useMemo(() => {
    const q = advisorQuery.trim().toLowerCase();
    if (!q) return advisors;
    return advisors.filter((a) => {
      const p = a.profile;
      const text = [p?.full_name, p?.email, p?.phone, p?.city_served, a.user_id].filter(Boolean).join(' ').toLowerCase();
      return text.includes(q);
    });
  }, [advisors, advisorQuery]);

  return (
    <div className="max-w-6xl mx-auto">
      {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <section className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-red-400" />
                <h1 className="text-xl font-semibold text-slate-900">{org?.name || 'Organization'}</h1>
              </div>
              <div className="mt-1 text-sm text-slate-600">Company profile</div>
            </div>
          </div>

          {isLoading ? (
            <div className="mt-4 text-slate-500">Loading…</div>
          ) : (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Contact</div>
                <div className="mt-2 text-slate-900 font-semibold">{org?.contact_name || '—'}</div>
                <div className="mt-1 inline-flex items-center gap-2 text-sm text-slate-700">
                  <Briefcase className="w-4 h-4 text-slate-400" />
                  <span>{org?.contact_job_title || '—'}</span>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-4">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Contact details</div>
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
            </div>
          )}
        </section>

        <section className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active campaigns</div>
          <div className="mt-2 text-4xl font-extrabold text-slate-900">{isLoading ? '—' : activeCampaignsCount}</div>
          <div className="mt-1 text-sm text-slate-600">Currently running</div>
        </section>

        <section className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Respondents</div>
          <div className="mt-2 text-4xl font-extrabold text-slate-900">{isLoading ? '—' : respondentsTotal}</div>
          <div className="mt-1 text-sm text-slate-600">Across active campaigns</div>
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
              <div className="flex items-center gap-2 mb-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    value={advisorQuery}
                    onChange={(e) => setAdvisorQuery(e.target.value)}
                    placeholder="Search advisors…"
                    className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                  />
                </div>
              </div>

              {isLoading ? (
                <div className="text-slate-500">Loading…</div>
              ) : filteredAdvisors.length === 0 ? (
                <div className="text-slate-500">No advisors found.</div>
              ) : (
                <div className="space-y-2">
                  {filteredAdvisors.map((a) => {
                    const p = a.profile;
                    const name = p?.full_name || p?.email || a.user_id;
                    return (
                      <details key={a.user_id} className="rounded-lg border border-slate-200">
                        <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-slate-900 truncate">{name}</div>
                            <div className="mt-1 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-slate-600">
                              <span className="inline-flex items-center gap-1">
                                <Phone className="w-3.5 h-3.5 text-slate-400" />
                                {p?.phone || '—'}
                              </span>
                              <span className="inline-flex items-center gap-1 truncate">
                                <Mail className="w-3.5 h-3.5 text-slate-400" />
                                {p?.email || '—'}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                {p?.city_served || '—'}
                              </span>
                            </div>
                          </div>
                          <ChevronDown className="w-4 h-4 text-slate-500" />
                        </summary>
                        <div className="px-4 pb-4 text-sm text-slate-700">
                          <div className="mt-2 text-xs text-slate-500">Advisor ID: <span className="font-mono">{a.user_id}</span></div>
                          <div className="mt-1 text-xs text-slate-500">Added: {new Date(a.created_at).toLocaleDateString()}</div>
                        </div>
                      </details>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setCampaignsOpen((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50"
          >
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-red-400" />
              <div className="text-left">
                <div className="text-sm font-semibold text-slate-900">Active campaigns</div>
                <div className="text-xs text-slate-600">{campaignsOpen ? 'Click to hide campaigns' : 'Click to see campaigns'}</div>
              </div>
            </div>
            {campaignsOpen ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
          </button>

          {campaignsOpen && (
            <div className="border-t border-slate-200 p-5">
              {isLoading ? (
                <div className="text-slate-500">Loading…</div>
              ) : campaigns.length === 0 ? (
                <div className="text-slate-500">No active campaigns.</div>
              ) : (
                <div className="space-y-2">
                  {campaigns.map((c) => (
                    <details key={c.id} className="rounded-lg border border-slate-200">
                      <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-900">{c.job_number}</span>
                            <span className="text-xs text-slate-500">{c.title || ''}</span>
                          </div>
                          <div className="mt-1 grid grid-cols-1 md:grid-cols-4 gap-2 text-xs text-slate-600">
                            <span className="truncate">Advisor: <span className="font-semibold text-slate-700">{c.advisorName}</span></span>
                            <span># of meetings: <span className="font-semibold text-slate-700">{c.meetings.length}</span></span>
                            <span>Dates: <span className="font-semibold text-slate-700">{formatDateRange(c.meetings.map((m) => m.starts_at))}</span></span>
                            <span className="truncate">Locations: <span className="font-semibold text-slate-700">{joinLocations(c.meetings)}</span></span>
                          </div>
                        </div>
                        <ChevronDown className="w-4 h-4 text-slate-500" />
                      </summary>

                      <div className="px-4 pb-4">
                        {c.meetings.length === 0 ? (
                          <div className="text-sm text-slate-600">No meetings scheduled yet.</div>
                        ) : (
                          <div className="mt-2 space-y-2">
                            {c.meetings.map((m, idx) => (
                              <div key={idx} className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm text-slate-800">
                                <div className="font-semibold">{m.location_name || 'Meeting'}</div>
                                <div className="mt-1 text-xs text-slate-600">
                                  {m.starts_at ? new Date(m.starts_at).toLocaleString() : 'TBD'}
                                  {m.city || m.state ? ` • ${(m.city || '')}${m.city && m.state ? ', ' : ''}${m.state || ''}` : ''}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default FmoHomeView;
