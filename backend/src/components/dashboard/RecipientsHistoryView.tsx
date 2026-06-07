import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useActingOrg } from '@/lib/actingOrg';
import { Search, ChevronDown, ChevronUp } from 'lucide-react';

type RecipientRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  address1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  times_mailed?: number;
  last_mailed?: string | null;
};

type SortKey = 'name' | 'city' | 'times_mailed' | 'last_mailed';
const ENRICH_BATCH = 200;
const DEFAULT_VISIBLE = 10;

const RecipientsHistoryView: React.FC = () => {
  const { user } = useAuth();
  const { actingOrg } = useActingOrg();
  const [rows, setRows] = useState<RecipientRow[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('times_mailed');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setIsLoading(true);
      try {
        const orgId = user?.is_master_admin ? (actingOrg?.id ?? null) : (user?.org_id ?? null);
        let q = supabase.from('recipients').select('id, first_name, last_name, address1, city, state, postal_code').order('created_at', { ascending: false }).limit(1000);
        let countQ = supabase.from('recipients').select('id', { count: 'exact', head: true });
        if (orgId) {
          q = q.eq('org_id', orgId);
          countQ = countQ.eq('org_id', orgId);
        }
        const [{ data, error }, { count }] = await Promise.all([q, countQ]);
        if (error) throw error;
        if (!isMounted) return;
        const recs = (data as any[]) || [];
        setTotalCount(Number(count ?? 0));

        // Batch mailings enrichment to avoid truncation from large .in() calls
        const recipientIds = recs.map((r: any) => r.id).filter(Boolean);
        const counts: Record<string, number> = {};
        const lastBy: Record<string, string> = {};
        for (let i = 0; i < recipientIds.length; i += ENRICH_BATCH) {
          const batch = recipientIds.slice(i, i + ENRICH_BATCH);
          const { data: mails } = await supabase.from('mailings').select('recipient_id, mailed_at').in('recipient_id', batch as any[]);
          for (const m of (mails || []) as any[]) {
            const rid = m.recipient_id;
            if (!rid) continue;
            counts[rid] = (counts[rid] || 0) + 1;
            if (m.mailed_at && (!lastBy[rid] || new Date(m.mailed_at) > new Date(lastBy[rid]))) lastBy[rid] = m.mailed_at;
          }
        }
        const enriched = recs.map((r: any) => ({ ...r, times_mailed: counts[r.id] || 0, last_mailed: lastBy[r.id] || null }));
        if (isMounted) setRows(enriched);
      } catch (err) {
        if (isMounted) setRows([]);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    load();
    return () => { isMounted = false; };
  }, [user?.is_master_admin, actingOrg?.id, user?.org_id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q ? rows.filter(r => {
      const name = `${r.first_name ?? ''} ${r.last_name ?? ''}`.toLowerCase();
      const addr = `${r.address1 ?? ''} ${r.city ?? ''} ${r.state ?? ''} ${r.postal_code ?? ''}`.toLowerCase();
      return name.includes(q) || addr.includes(q);
    }) : rows;
    return [...base].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') {
        const na = `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim().toLowerCase();
        const nb = `${b.first_name ?? ''} ${b.last_name ?? ''}`.trim().toLowerCase();
        cmp = na.localeCompare(nb);
      } else if (sortBy === 'city') {
        cmp = (a.city ?? '').localeCompare(b.city ?? '');
      } else if (sortBy === 'times_mailed') {
        cmp = (a.times_mailed ?? 0) - (b.times_mailed ?? 0);
      } else if (sortBy === 'last_mailed') {
        const da = a.last_mailed ? new Date(a.last_mailed).getTime() : 0;
        const db = b.last_mailed ? new Date(b.last_mailed).getTime() : 0;
        cmp = da - db;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, search, sortBy, sortDir]);

  const visible = showAll ? filtered : filtered.slice(0, DEFAULT_VISIBLE);
  const isSearching = search.trim().length > 0;

  const handleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(key); setSortDir('desc'); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortBy !== col) return null;
    return sortDir === 'desc' ? <ChevronDown className="inline w-3 h-3 ml-1" /> : <ChevronUp className="inline w-3 h-3 ml-1" />;
  };

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
              <th className="py-2 pr-4 font-medium cursor-pointer hover:text-slate-700 select-none" onClick={() => handleSort('name')}>Name <SortIcon col="name" /></th>
              <th className="py-2 pr-4 font-medium cursor-pointer hover:text-slate-700 select-none" onClick={() => handleSort('city')}>City/ZIP <SortIcon col="city" /></th>
              <th className="py-2 pr-4 font-medium cursor-pointer hover:text-slate-700 select-none" onClick={() => handleSort('times_mailed')}>Times Mailed <SortIcon col="times_mailed" /></th>
              <th className="py-2 pr-4 font-medium cursor-pointer hover:text-slate-700 select-none" onClick={() => handleSort('last_mailed')}>Last Mailed <SortIcon col="last_mailed" /></th>
            </tr>
          </thead>
          <tbody>
            {visible.map(r => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="py-3 pr-4 text-slate-900">{(r.first_name || r.last_name) ? `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() : <span className="text-slate-500">(no name)</span>}</td>
                <td className="py-3 pr-4 text-slate-700">{[r.city, r.state].filter(Boolean).join(', ') || r.postal_code || '—'}</td>
                <td className="py-3 pr-4 text-slate-900 font-semibold">{r.times_mailed ?? 0}</td>
                <td className="py-3 pr-4 text-slate-700">{r.last_mailed ? new Date(r.last_mailed).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span>
          {isSearching
            ? `${filtered.length.toLocaleString()} matching households (of ${totalCount.toLocaleString()} total)`
            : `Showing ${Math.min(showAll ? filtered.length : DEFAULT_VISIBLE, filtered.length).toLocaleString()} of ${totalCount.toLocaleString()} households`}
        </span>
        {filtered.length > DEFAULT_VISIBLE && (
          <button type="button" onClick={() => setShowAll(v => !v)} className="ml-4 text-red-600 hover:underline font-medium">
            {showAll ? 'Collapse' : `Show all ${filtered.length.toLocaleString()}`}
          </button>
        )}
      </div>
    </div>
  );
};

export default RecipientsHistoryView;
