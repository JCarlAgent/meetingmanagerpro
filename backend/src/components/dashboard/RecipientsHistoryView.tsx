import React, { useEffect, useRef, useState } from 'react';
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
  times_mailed: number;
};

type SortKey = 'name' | 'city' | 'zip';
const ENRICH_BATCH = 200;
const PAGE_SIZE = 50;
const DEFAULT_VISIBLE = 10;

const RecipientsHistoryView: React.FC = () => {
  const { user } = useAuth();
  const { actingOrg } = useActingOrg();
  const orgId = user?.is_master_admin ? (actingOrg?.id ?? null) : (user?.org_id ?? null);

  const [rows, setRows] = useState<RecipientRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [displayLimit, setDisplayLimit] = useState(DEFAULT_VISIBLE);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [bestMailDate, setBestMailDate] = useState<{ date: string | null; label: string }>({ date: null, label: '' });
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch best available mail date (actual > planned — do not use uploaded_at as a mail date)
  useEffect(() => {
    if (!orgId) return;
    let active = true;
    (async () => {
      const { data: jobs } = await supabase.from('jobs').select('id').eq('org_id', orgId).limit(1000);
      const jobIds = (jobs || []).map((j: any) => j.id);
      if (!jobIds.length || !active) return;
      const [poRes, listRes] = await Promise.all([
        supabase.from('print_orders').select('mailed_at').in('job_id', jobIds as any[]).order('mailed_at', { ascending: false }).limit(1),
        supabase.from('job_mailing_lists').select('planned_mail_date').in('job_id', jobIds as any[]).order('planned_mail_date', { ascending: false }).limit(1),
      ]);
      if (!active) return;
      const actualDate: string | null = (poRes.data as any)?.[0]?.mailed_at ?? null;
      const plannedDate: string | null = (listRes.data as any)?.[0]?.planned_mail_date ?? null;
      if (actualDate) setBestMailDate({ date: actualDate, label: 'Actual Mail Date' });
      else if (plannedDate) setBestMailDate({ date: plannedDate, label: 'Planned Mail Date' });
      else setBestMailDate({ date: null, label: '' });
    })();
    return () => { active = false; };
  }, [orgId]);

  function applyFilter(q: any) {
    if (orgId) q = q.eq('org_id', orgId);
    if (appliedSearch.trim()) {
      const t = `%${appliedSearch.trim()}%`;
      q = q.or(`first_name.ilike.${t},last_name.ilike.${t},address1.ilike.${t},city.ilike.${t},state.ilike.${t},postal_code.ilike.${t}`);
    }
    return q;
  }

  function applySort(q: any) {
    const col = sortBy === 'zip' ? 'postal_code' : sortBy === 'city' ? 'city' : 'last_name';
    q = q.order(col, { ascending: sortDir === 'asc' });
    if (sortBy === 'name') q = q.order('first_name', { ascending: sortDir === 'asc' });
    return q;
  }

  async function enrichRows(recs: any[]): Promise<RecipientRow[]> {
    const ids = recs.map((r: any) => r.id);
    const counts: Record<string, number> = {};
    for (let i = 0; i < ids.length; i += ENRICH_BATCH) {
      const { data: mails } = await supabase.from('mailings').select('recipient_id')
        .in('recipient_id', ids.slice(i, i + ENRICH_BATCH) as any[]);
      for (const m of (mails || []) as any[]) {
        if (m.recipient_id) counts[m.recipient_id] = (counts[m.recipient_id] || 0) + 1;
      }
    }
    return recs.map((r: any) => ({ ...r, times_mailed: counts[r.id] || 0 }));
  }

  // Reload on search/sort/org change
  useEffect(() => {
    let active = true;
    const load = async () => {
      setIsLoading(true);
      setRows([]);
      setDisplayLimit(DEFAULT_VISIBLE);
      try {
        const countQ = applyFilter(supabase.from('recipients').select('id', { count: 'exact', head: true }));
        const dataQ = applySort(applyFilter(supabase.from('recipients')
          .select('id, first_name, last_name, address1, city, state, postal_code')))
          .range(0, PAGE_SIZE - 1);
        const [{ count }, { data }] = await Promise.all([countQ, dataQ]);
        if (!active) return;
        setTotalCount(Number(count ?? 0));
        const enriched = await enrichRows((data as any[]) || []);
        if (active) setRows(enriched);
      } catch { if (active) setRows([]); }
      finally { if (active) setIsLoading(false); }
    };
    load();
    return () => { active = false; };
  }, [appliedSearch, sortBy, sortDir, orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLoadMore = async () => {
    setIsLoadingMore(true);
    try {
      const { data } = await applySort(applyFilter(supabase.from('recipients')
        .select('id, first_name, last_name, address1, city, state, postal_code')))
        .range(rows.length, rows.length + PAGE_SIZE - 1);
      const enriched = await enrichRows((data as any[]) || []);
      setRows(prev => [...prev, ...enriched]);
      setDisplayLimit(prev => prev + PAGE_SIZE);
    } finally { setIsLoadingMore(false); }
  };

  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setAppliedSearch(val), 450);
  };

  const handleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(key); setSortDir('asc'); }
  };

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortBy !== col ? null : sortDir === 'desc'
      ? <ChevronDown className="inline w-3 h-3 ml-1" />
      : <ChevronUp className="inline w-3 h-3 ml-1" />;

  const visible = rows.slice(0, displayLimit);
  const hasMore = rows.length < totalCount;
  const canExpand = displayLimit < rows.length;

  if (isLoading) return <div className="text-sm text-slate-500">Loading…</div>;

  return (
    <div>
      <div className="mb-3 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input value={search} onChange={e => handleSearchChange(e.target.value)}
          placeholder="Search name, address, city, ZIP…"
          className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-sm" />
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-2 pr-4 font-medium cursor-pointer select-none hover:text-slate-700" onClick={() => handleSort('name')}>Name <SortIcon col="name" /></th>
              <th className="py-2 pr-4 font-medium cursor-pointer select-none hover:text-slate-700" onClick={() => handleSort('city')}>City <SortIcon col="city" /></th>
              <th className="py-2 pr-4 font-medium cursor-pointer select-none hover:text-slate-700" onClick={() => handleSort('zip')}>ZIP <SortIcon col="zip" /></th>
              <th className="py-2 pr-4 font-medium">Times Mailed</th>
              <th className="py-2 pr-4 font-medium">Last Mailed</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan={5} className="py-6 text-slate-400 text-center">No matching households.</td></tr>
            ) : visible.map(r => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="py-3 pr-4 text-slate-900">{(r.first_name || r.last_name) ? `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() : <span className="text-slate-500">(no name)</span>}</td>
                <td className="py-3 pr-4 text-slate-700">{[r.city, r.state].filter(Boolean).join(', ') || '—'}</td>
                <td className="py-3 pr-4 text-slate-700 font-mono text-xs">{r.postal_code || '—'}</td>
                <td className="py-3 pr-4 text-slate-900 font-semibold">{r.times_mailed}</td>
                <td className="py-3 pr-4 text-slate-700">{r.times_mailed > 0 ? (bestMailDate.date ? new Date(bestMailDate.date).toLocaleDateString() : <span className="text-slate-400 italic">Not confirmed</span>) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span>
          {appliedSearch.trim()
            ? `${totalCount.toLocaleString()} matching households`
            : `Showing ${Math.min(displayLimit, rows.length).toLocaleString()} of ${totalCount.toLocaleString()} households`}
        </span>
        <div className="flex gap-3 ml-4">
          {(hasMore || canExpand) && (
            <button type="button" onClick={handleLoadMore} disabled={isLoadingMore}
              className="text-red-600 hover:underline font-medium disabled:opacity-50">
              {isLoadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
          {displayLimit > DEFAULT_VISIBLE && (
            <button type="button" onClick={() => setDisplayLimit(DEFAULT_VISIBLE)}
              className="text-slate-500 hover:underline font-medium">
              Collapse
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default RecipientsHistoryView;
