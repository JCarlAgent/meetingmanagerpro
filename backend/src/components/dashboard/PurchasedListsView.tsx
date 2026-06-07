import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useActingOrg } from '@/lib/actingOrg';

type Row = {
  id: string;
  job_id: string;
  row_count: number | null;
  uploaded_at: string | null;
};

type JobMap = Record<string, { job_number?: string | null; title?: string | null }>;

const PurchasedListsView: React.FC = () => {
  const { user } = useAuth();
  const { actingOrg } = useActingOrg();
  const [rows, setRows] = useState<Row[]>([]);
  const [jobMap, setJobMap] = useState<JobMap>({});
  const [mailCounts, setMailCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const orgId = user?.is_master_admin ? (actingOrg?.id ?? null) : (user?.org_id ?? null);
        let q = supabase.from('job_mailing_lists').select('id, job_id, row_count, uploaded_at').order('uploaded_at', { ascending: false }).limit(200);
        if (orgId) {
          // job_mailing_lists does not have org_id — scope by jobs for the org
          const jobsRes = await supabase.from('jobs').select('id').eq('org_id', orgId).limit(1000);
          const jobIds = (jobsRes.data || []).map((j: any) => j.id);
          if (!jobIds || jobIds.length === 0) {
            // nothing for this org
            if (!isMounted) return;
            setRows([]);
            setLoading(false);
            return;
          }
          q = q.in('job_id', jobIds as any[]);
        }
        const { data, error } = await q;
        if (error) throw error;
        if (!isMounted) return;
        const lists = (data as any) || [];

        // Deduplicate by job_id — show only the most recent import per campaign
        const latestByJob = new Map<string, any>();
        for (const l of lists) {
          const existing = latestByJob.get(l.job_id);
          if (!existing || new Date(l.uploaded_at ?? 0) > new Date(existing.uploaded_at ?? 0)) {
            latestByJob.set(l.job_id, l);
          }
        }
        const dedupedLists = Array.from(latestByJob.values());

        // Fetch job metadata for displayed lists
        const jobIds = Array.from(new Set(dedupedLists.map((l: any) => l.job_id)));
        let jobMap: JobMap = {};
        if (jobIds.length > 0) {
          const jobsRes = await supabase.from('jobs').select('id, job_number, title').in('id', jobIds).limit(200);
          const jobs = jobsRes.data || [];
          jobs.forEach((j: any) => { jobMap[j.id] = { job_number: j.job_number, title: j.title }; });
        }

        // Fetch actual tracked mailings count per list_id (prefer over row_count)
        const mailCountMap: Record<string, number> = {};
        for (const l of dedupedLists) {
          const { count } = await supabase.from('mailings').select('id', { count: 'exact', head: true }).eq('mailing_list_id', l.id);
          mailCountMap[l.id] = Number(count ?? 0);
        }

        // attach job metadata to rows via map lookup (render-time will use map)
        setRows(dedupedLists || []);
        setMailCounts(mailCountMap);
        // store jobMap in state for render
        setJobMap(jobMap);
      } catch (err) {
        setRows([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    load();
    return () => { isMounted = false; };
  }, [user?.is_master_admin, actingOrg?.id, user?.org_id]);

  if (loading) return <div className="text-sm text-slate-500">Loading…</div>;
  if (rows.length === 0) return <div className="text-sm text-slate-500">No purchased lists found.</div>;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b border-slate-200">
            <th className="py-2 pr-4 font-medium">Campaign</th>
            <th className="py-2 pr-4 font-medium">Imported Date</th>
            <th className="py-2 pr-4 font-medium">Households</th>
            <th className="py-2 pr-4 font-medium">Responders</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-b border-slate-100">
              <td className="py-3 pr-4 text-slate-700">
                {(() => {
                  const j = jobMap[r.job_id];
                  if (j && (j.title || j.job_number)) return `${j.title ?? ''}${j.title && j.job_number ? ' — ' : ''}${j.job_number ?? ''}`.trim();
                  return r.job_id;
                })()}
              </td>
              <td className="py-3 pr-4 text-slate-700">{r.uploaded_at ? new Date(r.uploaded_at).toLocaleString() : '—'}</td>
              <td className="py-3 pr-4 text-slate-900 font-semibold">{mailCounts[r.id] > 0 ? mailCounts[r.id].toLocaleString() : (r.row_count != null ? r.row_count.toLocaleString() : '—')}</td>
              <td className="py-3 pr-4 text-slate-700">—</td>
              
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default PurchasedListsView;
