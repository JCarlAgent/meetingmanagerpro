import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useActingOrg } from '@/lib/actingOrg';

const Card: React.FC<{ title: string; value: string }> = ({ title, value }) => (
  <div className="bg-white rounded-md border border-slate-100 p-4">
    <div className="text-xs text-slate-500">{title}</div>
    <div className="text-2xl font-semibold text-slate-900 mt-1">{value}</div>
  </div>
);

const MailingsOverview: React.FC = () => {
  const { user } = useAuth();
  const { actingOrg } = useActingOrg();
  const [totals, setTotals] = useState({ recipients: 0, mailings: 0, purchasedLists: 0, suppressed: 0, lastMailedAt: null as string | null });

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const orgId = user?.is_master_admin ? (actingOrg?.id ?? null) : (user?.org_id ?? null);

        const recipientsQ = supabase.from('recipients').select('id', { count: 'exact', head: true });
        const mailingsQ = supabase.from('mailings').select('id', { count: 'exact', head: true });
        const listsQ = supabase.from('job_mailing_lists').select('id', { count: 'exact', head: true });
        const suppressQ = supabase.from('mailing_suppressions').select('id', { count: 'exact', head: true });
        const lastQ = supabase.from('mailings').select('mailed_at').order('mailed_at', { ascending: false }).limit(1);

        // Apply org scoping where available
        if (orgId) {
          recipientsQ.eq('org_id', orgId);
          mailingsQ.eq('org_id', orgId);
          listsQ.eq('org_id', orgId);
          suppressQ.eq('org_id', orgId);
          lastQ.eq('org_id', orgId);
        }

        const [rRes, mRes, lRes, sRes, lastRes] = await Promise.all([recipientsQ, mailingsQ, listsQ, suppressQ, lastQ]);

        if (!isMounted) return;
        setTotals({
          recipients: (rRes.count as number) || 0,
          mailings: (mRes.count as number) || 0,
          purchasedLists: (lRes.count as number) || 0,
          suppressed: (sRes.count as number) || 0,
          lastMailedAt: (lastRes.data && lastRes.data[0] && lastRes.data[0].mailed_at) || null,
        });
      } catch (err) {
        // ignore — show zeros
      }
    };
    load();
    return () => { isMounted = false; };
  }, [user?.is_master_admin, actingOrg?.id, user?.org_id]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      <Card title="Total unique recipients" value={String(totals.recipients)} />
      <Card title="Total mailing records" value={String(totals.mailings)} />
      <Card title="Total purchased lists" value={String(totals.purchasedLists)} />
      <Card title="Suppressed recipients" value={String(totals.suppressed)} />
      <Card title="Last mailing date" value={totals.lastMailedAt ? new Date(totals.lastMailedAt).toLocaleDateString() : '—'} />
    </div>
  );
};

export default MailingsOverview;
