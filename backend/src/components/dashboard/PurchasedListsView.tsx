import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useActingOrg } from '@/lib/actingOrg';
import { calcPlannedMailDate } from '@/lib/plannedMailDate';

type Row = {
  id: string;
  job_id: string;
  row_count: number | null;
  uploaded_at: string | null;
  planned_mail_date: string | null;
  planned_mail_date_is_override: boolean;
};

type JobMap = Record<string, { job_number?: string | null; title?: string | null }>;

// ISO date string (YYYY-MM-DD) from a Date
function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const PurchasedListsView: React.FC = () => {
  const { user } = useAuth();
  const { actingOrg } = useActingOrg();
  const isMasterAdmin = !!user?.is_master_admin;
  const [rows, setRows] = useState<Row[]>([]);
  const [jobMap, setJobMap] = useState<JobMap>({});
  const [mailCounts, setMailCounts] = useState<Record<string, number>>({});
  const [printOrderDates, setPrintOrderDates] = useState<Record<string, string | null>>({});
  // job_id → earliest starts_at ISO string
  const [firstEventDates, setFirstEventDates] = useState<Record<string, string | null>>({});
  // row.id → editing state
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const orgId = user?.is_master_admin ? (actingOrg?.id ?? null) : (user?.org_id ?? null);
        let q = supabase.from('job_mailing_lists').select('id, job_id, row_count, uploaded_at, planned_mail_date, planned_mail_date_is_override').order('uploaded_at', { ascending: false }).limit(200);
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

        // Fetch latest print_orders.mailed_at per job (actual mail date)
        const poMap: Record<string, string | null> = {};
        if (jobIds.length > 0) {
          const poRes = await supabase.from('print_orders').select('job_id, mailed_at').in('job_id', jobIds).order('mailed_at', { ascending: false });
          for (const po of ((poRes.data || []) as any[])) {
            if (po.job_id && po.mailed_at && !poMap[po.job_id]) poMap[po.job_id] = po.mailed_at;
          }
        }

        // Fetch earliest starts_at per job from job_meetings (for auto-recommend)
        const feMap: Record<string, string | null> = {};
        if (jobIds.length > 0) {
          const jmRes = await supabase.from('job_meetings').select('job_id, starts_at').in('job_id', jobIds).order('starts_at', { ascending: true });
          for (const jm of ((jmRes.data || []) as any[])) {
            if (jm.job_id && jm.starts_at && !feMap[jm.job_id]) feMap[jm.job_id] = jm.starts_at;
          }
        }

        setRows(dedupedLists || []);
        setMailCounts(mailCountMap);
        setPrintOrderDates(poMap);
        setFirstEventDates(feMap);
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

  const startEdit = (rowId: string, currentDate: string | null) => {
    setEditing(prev => ({ ...prev, [rowId]: currentDate ?? '' }));
  };

  const cancelEdit = (rowId: string) => {
    setEditing(prev => { const n = { ...prev }; delete n[rowId]; return n; });
  };

  const saveEdit = async (row: Row) => {
    const val = editing[row.id];
    if (!val) return;
    setSaving(prev => ({ ...prev, [row.id]: true }));
    try {
      const { error } = await supabase
        .from('job_mailing_lists')
        .update({ planned_mail_date: val, planned_mail_date_is_override: true })
        .eq('id', row.id);
      if (error) throw error;
      setRows(prev => prev.map(r => r.id === row.id
        ? { ...r, planned_mail_date: val, planned_mail_date_is_override: true }
        : r));
      cancelEdit(row.id);
    } catch (err: any) {
      alert('Failed to save: ' + (err?.message ?? String(err)));
    } finally {
      setSaving(prev => { const n = { ...prev }; delete n[row.id]; return n; });
    }
  };

  if (loading) return <div className="text-sm text-slate-500">Loading…</div>;
  if (rows.length === 0) return <div className="text-sm text-slate-500">No purchased lists found.</div>;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b border-slate-200">
            <th className="py-2 pr-4 font-medium">Campaign</th>
            <th className="py-2 pr-4 font-medium">List Imported</th>
            <th className="py-2 pr-4 font-medium">Planned Mail Date</th>
            <th className="py-2 pr-4 font-medium">Actual Mail Date</th>
            <th className="py-2 pr-4 font-medium">Households Purchased</th>
            <th className="py-2 pr-4 font-medium">Actual Mailed</th>
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
              <td className="py-3 pr-4 text-slate-700">{r.uploaded_at ? new Date(r.uploaded_at).toLocaleDateString() : '—'}</td>
              <td className="py-3 pr-4 text-slate-700">
                {editing[r.id] !== undefined ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={editing[r.id]}
                      onChange={e => setEditing(prev => ({ ...prev, [r.id]: e.target.value }))}
                      className="border border-slate-300 rounded px-2 py-1 text-sm"
                    />
                    <button
                      onClick={() => saveEdit(r)}
                      disabled={saving[r.id]}
                      className="text-xs text-white bg-red-600 hover:bg-red-700 px-2 py-1 rounded disabled:opacity-50"
                    >{saving[r.id] ? 'Saving…' : 'Save'}</button>
                    <button
                      onClick={() => cancelEdit(r.id)}
                      className="text-xs text-slate-500 hover:underline"
                    >Cancel</button>
                  </div>
                ) : (() => {
                  const feStr = firstEventDates[r.job_id];
                  const suggested = !r.planned_mail_date && feStr
                    ? toIsoDate(calcPlannedMailDate(new Date(feStr)))
                    : null;
                  const displayDate = r.planned_mail_date ?? suggested;
                  const label = r.planned_mail_date
                    ? (r.planned_mail_date_is_override
                      ? <span className="ml-1 text-xs text-amber-600 font-medium">Manually overridden</span>
                      : <span className="ml-1 text-xs text-slate-400">Auto recommended</span>)
                    : suggested
                      ? <span className="ml-1 text-xs text-blue-500">Suggested</span>
                      : null;
                  return (
                    <div className="flex items-center gap-1">
                      {displayDate
                        ? <span>{new Date(displayDate + 'T00:00:00').toLocaleDateString()}</span>
                        : <span className="text-slate-400 italic">Not scheduled</span>}
                      {label}
                      {isMasterAdmin && (
                        <button
                          onClick={() => startEdit(r.id, r.planned_mail_date ?? suggested)}
                          className="ml-2 text-xs text-red-600 hover:underline"
                        >Edit</button>
                      )}
                    </div>
                  );
                })()}
              </td>
              <td className="py-3 pr-4 text-slate-700">{printOrderDates[r.job_id] ? new Date(printOrderDates[r.job_id]!).toLocaleDateString() : <span className="text-slate-400 italic">Not confirmed</span>}</td>
              <td className="py-3 pr-4 text-slate-700">{r.row_count != null ? r.row_count.toLocaleString() : '—'}</td>
              <td className="py-3 pr-4 text-slate-900 font-semibold">{mailCounts[r.id] > 0 ? mailCounts[r.id].toLocaleString() : '—'}</td>
              
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default PurchasedListsView;
