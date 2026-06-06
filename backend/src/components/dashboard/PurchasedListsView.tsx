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

const PurchasedListsView: React.FC = () => {
  const { user } = useAuth();
  const { actingOrg } = useActingOrg();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const orgId = user?.is_master_admin ? (actingOrg?.id ?? null) : (user?.org_id ?? null);
        let q = supabase.from('job_mailing_lists').select('id, job_id, row_count, uploaded_at').order('uploaded_at', { ascending: false }).limit(200);
        if (orgId) q = q.eq('org_id', orgId);
        const { data, error } = await q;
        if (error) throw error;
        if (!isMounted) return;
        setRows((data as any) || []);
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
            <th className="py-2 pr-4 font-medium">Uploaded</th>
            <th className="py-2 pr-4 font-medium">Row count</th>
            <th className="py-2 pr-4 font-medium">Job</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-b border-slate-100">
              <td className="py-3 pr-4 text-slate-700">{r.uploaded_at ? new Date(r.uploaded_at).toLocaleString() : '—'}</td>
              <td className="py-3 pr-4 text-slate-900 font-semibold">{r.row_count ?? '—'}</td>
              <td className="py-3 pr-4 text-slate-700">{r.job_id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default PurchasedListsView;
