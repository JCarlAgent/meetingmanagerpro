import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useActingOrg } from '@/lib/actingOrg';

type JobRow = {
  id: string;
  job_number: string;
  title: string | null;
  status: string;
  org_id: string;
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

function formatWhen(startsAt: string | null) {
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

function isUpcoming(startsAt: string | null) {
  if (!startsAt) return true;
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return true;
  return d.getTime() >= Date.now();
}

interface OrgMeetingsViewProps {
  onNavigate?: (view: string) => void;
}

const OrgMeetingsView: React.FC<OrgMeetingsViewProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const { actingOrg } = useActingOrg();

  const [filter, setFilter] = useState<'all' | 'upcoming' | 'past'>('upcoming');
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [meetings, setMeetings] = useState<MeetingWithJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const effectiveOrgId = user?.is_master_admin ? (actingOrg?.id ?? null) : (user?.org_id ?? null);

  const load = useCallback(async () => {
    if (!user) return;
    if (user.is_master_admin && !actingOrg?.id) {
      setJobs([]);
      setMeetings([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let jobsQuery = supabase
        .from('jobs')
        .select('id, job_number, title, status, org_id')
        .order('created_at', { ascending: false })
        .limit(200);

      if (effectiveOrgId) {
        jobsQuery = jobsQuery.eq('org_id', effectiveOrgId);
      }

      const { data: jobsData, error: jobsError } = await jobsQuery;
      if (jobsError) throw jobsError;

      const jobRows = (jobsData ?? []) as unknown as JobRow[];
      setJobs(jobRows);

      if (jobRows.length === 0) {
        setMeetings([]);
        return;
      }

      const jobIds = jobRows.map((j) => j.id);
      const jobById = new Map(jobRows.map((j) => [j.id, j] as const));

      const { data: meetingsData, error: meetingsError } = await supabase
        .from('job_meetings')
        .select('id, job_id, starts_at, location_name, address1, address2, city, state, postal_code, created_at')
        .in('job_id', jobIds)
        .order('starts_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });

      if (meetingsError) throw meetingsError;

      const meetingRows = (meetingsData ?? []) as unknown as MeetingRow[];
      setMeetings(meetingRows.map((m) => ({ ...m, job: jobById.get(m.job_id) ?? null })));
    } catch (e: any) {
      setError(e?.message || 'Failed to load meetings');
      setJobs([]);
      setMeetings([]);
    } finally {
      setIsLoading(false);
    }
  }, [actingOrg?.id, effectiveOrgId, user]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredMeetings = useMemo(() => {
    return meetings.filter((m) => {
      const upcoming = isUpcoming(m.starts_at);
      if (filter === 'upcoming') return upcoming;
      if (filter === 'past') return !upcoming;
      return true;
    });
  }, [filter, meetings]);

  if (user?.is_master_admin && !actingOrg?.id) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">Meetings</h1>
          <p className="text-slate-600 mt-2">Select a client first to view meetings.</p>
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('master-clients')}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-sm font-semibold transition-colors"
            >
              Go to Clients
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Calendar className="w-6 h-6 text-red-500" />
          <h2 className="text-xl font-semibold text-slate-900">Meetings</h2>
        </div>

        <div className="flex items-center gap-2">
          {(['upcoming', 'past', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === f
                  ? 'bg-red-600 text-white'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}

          <button
            type="button"
            onClick={load}
            className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">Loading…</div>
      ) : filteredMeetings.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm text-center">
          <p className="text-slate-700 font-medium">No meetings found</p>
          <p className="text-slate-500 text-sm mt-1">
            Meetings are created in “Meeting Setup” and saved under Jobs.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredMeetings.map((m) => (
            <div key={m.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-600">{m.job?.job_number ?? 'JOB'}</span>
                    {m.job?.status && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        {m.job.status}
                      </span>
                    )}
                  </div>
                  <div className="text-lg font-semibold text-slate-900 mt-1">
                    {m.location_name || 'Meeting Location'}
                  </div>
                  {m.job?.title && <div className="text-sm text-slate-600">{m.job.title}</div>}
                </div>

                <div className="text-sm text-slate-700 sm:text-right">
                  <div className="font-medium">{formatWhen(m.starts_at)}</div>
                  <div className="text-slate-500">
                    {[m.city, m.state].filter(Boolean).join(', ') || '—'}
                  </div>
                </div>
              </div>

              <div className="mt-3 text-sm text-slate-600">
                {[m.address1, m.address2, [m.city, m.state, m.postal_code].filter(Boolean).join(' ')].filter(Boolean).join(' • ') || '—'}
              </div>
            </div>
          ))}
        </div>
      )}

      {!effectiveOrgId && !user?.is_master_admin && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-4 py-3 text-sm">
          This user is not associated with an organization yet, so there’s nothing to show here.
        </div>
      )}

      {jobs.length > 0 && meetings.length === 0 && !isLoading && !error && (
        <div className="bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-4 py-3 text-sm">
          Found {jobs.length} jobs, but no meetings saved yet.
        </div>
      )}
    </div>
  );
};

export default OrgMeetingsView;
