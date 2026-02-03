import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useActingOrg } from '@/lib/actingOrg';
import { RefreshCw } from 'lucide-react';

type JobRow = {
  id: string;
  job_number: string;
  title: string | null;
  created_at: string;
};

type SignoffStage = 'locations' | 'template' | 'rsvp' | 'demographics' | 'finalize';

type SignoffRow = {
  id: string;
  job_id: string;
  stage: SignoffStage;
  initials: string;
  signed_by_email: string | null;
  signed_by_user_id: string;
  updated_at: string;
  summary: unknown;
};

const STAGES: Array<{ stage: SignoffStage; label: string }> = [
  { stage: 'locations', label: 'Locations' },
  { stage: 'template', label: 'Template' },
  { stage: 'rsvp', label: 'RSVP' },
  { stage: 'demographics', label: 'Demographics' },
  { stage: 'finalize', label: 'Finalize' },
];

function formatJobLabel(job: JobRow) {
  const title = (job.title || '').trim();
  return title ? `${job.job_number} — ${title}` : job.job_number;
}

const ApprovalsArchiveView: React.FC = () => {
  const { user } = useAuth();
  const { actingOrg } = useActingOrg();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [signoffs, setSignoffs] = useState<SignoffRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canSee = Boolean(user?.is_admin || user?.is_master_admin);
  const actingOrgId = user?.is_master_admin ? (actingOrg?.id ?? null) : null;

  const load = async () => {
    if (!canSee) return;

    setIsLoading(true);
    setError(null);

    try {
      let jobsQuery = supabase
        .from('jobs')
        .select('id, job_number, title, created_at')
        .order('created_at', { ascending: false })
        .limit(200);

      if (actingOrgId) {
        jobsQuery = jobsQuery.eq('org_id', actingOrgId);
      }

      const [{ data: jobsData, error: jobsErr }, { data: signData, error: signErr }] = await Promise.all([
        jobsQuery,
        supabase
          .from('job_stage_signoffs')
          .select('id, job_id, stage, initials, signed_by_email, signed_by_user_id, updated_at, summary')
          .order('updated_at', { ascending: false })
          .limit(2000),
      ]);

      if (jobsErr) throw jobsErr;
      if (signErr) throw signErr;

      const nextJobs = (((jobsData ?? []) as unknown as JobRow[]) || []);
      let nextSignoffs = (((signData ?? []) as unknown as SignoffRow[]) || []);

      if (actingOrgId) {
        const allowed = new Set(nextJobs.map((j) => j.id));
        nextSignoffs = nextSignoffs.filter((s) => allowed.has(s.job_id));
      }

      setJobs(nextJobs);
      setSignoffs(nextSignoffs);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load approvals');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSee]);

  const byJob = useMemo(() => {
    const map = new Map<string, Partial<Record<SignoffStage, SignoffRow>>>();
    for (const s of signoffs) {
      if (!map.has(s.job_id)) map.set(s.job_id, {});
      const bucket = map.get(s.job_id)!;
      // Keep the latest per stage
      const existing = bucket[s.stage];
      if (!existing || new Date(s.updated_at).getTime() > new Date(existing.updated_at).getTime()) {
        bucket[s.stage] = s;
      }
    }
    return map;
  }, [signoffs]);

  if (!canSee) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">Approvals archive</h1>
          <p className="text-slate-600 mt-1">This view is available to FMO admins and master admins.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Approvals archive</h1>
          <p className="text-slate-600 mt-1">Stage initials + saved summaries per job.</p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-900">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Jobs</h2>
          <p className="text-sm text-slate-600 mt-1">Latest initials per stage.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-3 px-5 font-medium">Job</th>
                {STAGES.map((s) => (
                  <th key={s.stage} className="py-3 px-4 font-medium">{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={1 + STAGES.length} className="py-8 px-5 text-slate-500">Loading…</td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={1 + STAGES.length} className="py-8 px-5 text-slate-500">No jobs found.</td>
                </tr>
              ) : (
                jobs.slice(0, 200).map((job) => {
                  const stages = byJob.get(job.id) || {};
                  return (
                    <tr key={job.id} className="border-b border-slate-100">
                      <td className="py-3 px-5 text-slate-900">
                        <div className="font-semibold">{formatJobLabel(job)}</div>
                        <div className="text-xs text-slate-500">{new Date(job.created_at).toLocaleDateString()}</div>
                      </td>
                      {STAGES.map((s) => {
                        const sign = stages[s.stage];
                        return (
                          <td key={s.stage} className="py-3 px-4">
                            {sign ? (
                              <div>
                                <div className="font-semibold text-slate-900">{sign.initials}</div>
                                <div className="text-xs text-slate-500">
                                  {sign.signed_by_email || sign.signed_by_user_id.slice(0, 8)} • {new Date(sign.updated_at).toLocaleDateString()}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ApprovalsArchiveView;
