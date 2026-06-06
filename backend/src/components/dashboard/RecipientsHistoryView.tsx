import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useActingOrg } from '@/lib/actingOrg';
import { Search } from 'lucide-react';

type RecipientRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  address1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
};

const RecipientsHistoryView: React.FC = () => {
  const { user } = useAuth();
  const { actingOrg } = useActingOrg();
  const [rows, setRows] = useState<RecipientRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setIsLoading(true);
      try {
        const orgId = user?.is_master_admin ? (actingOrg?.id ?? null) : (user?.org_id ?? null);
        let q = supabase.from('recipients').select('id, first_name, last_name, address1, city, state, postal_code').order('created_at', { ascending: false }).limit(1000);
        if (orgId) q = q.eq('org_id', orgId);
        const { data, error } = await q;
        if (error) throw error;
        if (!isMounted) return;
        setRows((data as any) || []);
      } catch (err) {
        setRows([]);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    load();
    return () => { isMounted = false; };
  }, [user?.is_master_admin, actingOrg?.id, user?.org_id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => {
      const name = `${r.first_name ?? ''} ${r.last_name ?? ''}`.toLowerCase();
      const addr = `${r.address1 ?? ''} ${r.city ?? ''} ${r.state ?? ''} ${r.postal_code ?? ''}`.toLowerCase();
      return name.includes(q) || addr.includes(q);
    });
  }, [rows, search]);

  if (isLoading) return <div className="text-sm text-slate-500">Loading…</div>;
  if (rows.length === 0) return <div className="text-sm text-slate-500">No recipients found.</div>;

  return (
    <div>
      <div className="mb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or address…" className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-sm" />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Address</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 1000).map(r => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="py-3 pr-4 text-slate-900">{(r.first_name || r.last_name) ? `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() : <span className="text-slate-500">(no name)</span>}</td>
                <td className="py-3 pr-4 text-slate-700">{[r.address1, `${r.city ?? ''} ${r.state ?? ''}`.trim(), r.postal_code].filter(Boolean).join(' • ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length > 1000 && <p className="mt-2 text-xs text-slate-500">Showing first 1000 recipients. Narrow your search to see more.</p>}
    </div>
  );
};

export default RecipientsHistoryView;
