import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useActingOrg } from '@/lib/actingOrg';

type SuppressionRow = {
  id: string;
  recipient_id: string | null;
  reason: string | null;
  scope: string | null;
  created_at: string | null;
  notes: string | null;
};

const SuppressionsView: React.FC = () => {
  const { user } = useAuth();
  const { actingOrg } = useActingOrg();
  const [rows, setRows] = useState<SuppressionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const orgId = user?.is_master_admin ? (actingOrg?.id ?? null) : (user?.org_id ?? null);
        let q = supabase.from('mailing_suppressions').select('id, recipient_id, reason, scope, created_at, notes').order('created_at', { ascending: false }).limit(200);
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
  if (rows.length === 0) return <div className="text-sm text-slate-500">No suppressions found.</div>;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b border-slate-200">
            <th className="py-2 pr-4 font-medium">Recipient</th>
            <th className="py-2 pr-4 font-medium">Reason</th>
            <th className="py-2 pr-4 font-medium">Scope</th>
            <th className="py-2 pr-4 font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-b border-slate-100">
              <td className="py-3 pr-4 text-slate-700">{r.recipient_id ?? '—'}</td>
              <td className="py-3 pr-4 text-slate-900">{r.reason ?? '—'}</td>
              <td className="py-3 pr-4 text-slate-700">{r.scope ?? '—'}</td>
              <td className="py-3 pr-4 text-slate-700">{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default SuppressionsView;
