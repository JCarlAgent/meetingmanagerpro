import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useActingOrg } from '@/lib/actingOrg';
import { RefreshCw, Search } from 'lucide-react';

type JobRow = {
  id: string;
  job_number: string;
  title: string | null;
  created_at: string;
};

type MailingRow = {
  id: string;
  recipient_id: string;
  pieces: number;
  mailed_at: string;
  recipients?: {
    first_name: string | null;
    last_name: string | null;
    address1: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  } | null;
};

function formatJobLabel(job: JobRow) {
  const title = (job.title || '').trim();
  return title ? `${job.job_number} — ${title}` : job.job_number;
}

function formatAddress(r: NonNullable<MailingRow['recipients']>) {
  const parts = [r.address1, [r.city, r.state].filter(Boolean).join(', '), r.zip].filter(Boolean);
  return parts.join(' • ');
}

const MailingsReportView: React.FC = () => {
  const { user } = useAuth();
  const { actingOrg } = useActingOrg();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [jobId, setJobId] = useState<string>('');
  const [isLoadingJobs, setIsLoadingJobs] = useState(true);

  const [mailings, setMailings] = useState<MailingRow[]>([]);
  const [isLoadingMailings, setIsLoadingMailings] = useState(false);

  const [search, setSearch] = useState('');

  const effectiveOrgId = user?.is_master_admin ? (actingOrg?.id ?? null) : (user?.org_id ?? null);

  const loadJobs = async () => {
    setIsLoadingJobs(true);
    try {
      let query = supabase
        .from('jobs')
        .select('id, job_number, title, created_at')
        .order('created_at', { ascending: false })
        .limit(100);

      if (effectiveOrgId) {
        query = query.eq('org_id', effectiveOrgId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setJobs(((data ?? []) as unknown as JobRow[]) || []);
      if (!jobId && data && data.length) {
        setJobId(((data[0] as unknown as JobRow).id));
      }
    } finally {
      setIsLoadingJobs(false);
    }
  };

  const loadMailings = async (selectedJobId: string) => {
    if (!selectedJobId) {
      setMailings([]);
      return;
    }

    setIsLoadingMailings(true);
    try {
      // Pull raw mailings and aggregate client-side.
      // If this grows big, we can replace with a Postgres view/RPC for aggregation.
      const { data, error } = await supabase
        .from('mailings')
        .select('id, recipient_id, pieces, mailed_at, recipients(first_name,last_name,address1,city,state,zip)')
        .eq('job_id', selectedJobId)
        .order('mailed_at', { ascending: false })
        .limit(10000);

      if (error) throw error;
      setMailings(((data ?? []) as unknown as MailingRow[]) || []);
    } finally {
      setIsLoadingMailings(false);
    }
  };

  useEffect(() => {
    loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (jobId) loadMailings(jobId);
  }, [jobId]);

  const aggregates = useMemo(() => {
    const map = new Map<
      string,
      {
        recipient_id: string;
        first_name: string | null;
        last_name: string | null;
        address: string;
        times_mailed: number;
        pieces: number;
        last_mailed_at: string | null;
      }
    >();

    for (const m of mailings) {
      const existing = map.get(m.recipient_id);
      const r = m.recipients ?? null;
      const address = r ? formatAddress(r) : '';

      const times = (existing?.times_mailed ?? 0) + 1;
      const pieces = (existing?.pieces ?? 0) + (m.pieces || 0);
      const lastMailedAt = existing?.last_mailed_at
        ? existing.last_mailed_at
        : m.mailed_at;

      map.set(m.recipient_id, {
        recipient_id: m.recipient_id,
        first_name: existing?.first_name ?? r?.first_name ?? null,
        last_name: existing?.last_name ?? r?.last_name ?? null,
        address: existing?.address || address,
        times_mailed: times,
        pieces,
        last_mailed_at: lastMailedAt,
      });
    }

    const rows = Array.from(map.values());

    const q = search.trim().toLowerCase();
    const filtered = q
      ? rows.filter((row) => {
          const name = `${row.first_name ?? ''} ${row.last_name ?? ''}`.toLowerCase();
          return name.includes(q) || (row.address || '').toLowerCase().includes(q);
        })
      : rows;

    filtered.sort((a, b) => b.times_mailed - a.times_mailed);

    const totalPieces = rows.reduce((acc, r) => acc + (r.pieces || 0), 0);

    return {
      totalRecipients: rows.length,
      totalPieces,
      rows: filtered,
    };
  }, [mailings, search]);

  const selectedJob = useMemo(() => jobs.find((j) => j.id === jobId) || null, [jobs, jobId]);

  if (user?.is_master_admin && !actingOrg?.id) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">Mailings</h1>
          <p className="text-slate-600 mt-2">Select a client first (Sidebar → Master → Clients).</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Mailings</h1>
          <p className="text-slate-600 mt-1">See “times mailed” per recipient for a job.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            loadJobs();
            if (jobId) loadMailings(jobId);
          }}
          disabled={isLoadingJobs || isLoadingMailings}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${(isLoadingJobs || isLoadingMailings) ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700">Job</label>
            <select
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
            >
              <option value="">Select a job…</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {formatJobLabel(j)}
                </option>
              ))}
            </select>
            {selectedJob && (
              <p className="mt-2 text-xs text-slate-500">Mailing history for Job {formatJobLabel(selectedJob)}.</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Search</label>
            <div className="mt-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or address…"
                className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
              />
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2 text-sm text-slate-700">
          <span className="px-2 py-1 rounded-md bg-slate-100">Recipients: <span className="font-semibold">{aggregates.totalRecipients}</span></span>
          <span className="px-2 py-1 rounded-md bg-slate-100">Pieces: <span className="font-semibold">{aggregates.totalPieces}</span></span>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-4 font-medium">Recipient</th>
                <th className="py-2 pr-4 font-medium">Address</th>
                <th className="py-2 pr-4 font-medium">Times mailed</th>
                <th className="py-2 pr-4 font-medium">Pieces</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingMailings ? (
                <tr>
                  <td colSpan={4} className="py-6 text-slate-500">Loading…</td>
                </tr>
              ) : aggregates.rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-slate-500">No mailings found for this job.</td>
                </tr>
              ) : (
                aggregates.rows.slice(0, 500).map((r) => (
                  <tr key={r.recipient_id} className="border-b border-slate-100">
                    <td className="py-3 pr-4 text-slate-900">
                      {(r.first_name || r.last_name)
                        ? `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim()
                        : <span className="text-slate-500">(no name)</span>}
                    </td>
                    <td className="py-3 pr-4 text-slate-700">{r.address || <span className="text-slate-400">—</span>}</td>
                    <td className="py-3 pr-4 text-slate-900 font-semibold">{r.times_mailed}</td>
                    <td className="py-3 pr-4 text-slate-700">{r.pieces}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {aggregates.rows.length > 500 && (
            <p className="mt-3 text-xs text-slate-500">Showing first 500 results. Narrow the search to see more.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default MailingsReportView;
