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
        const suppressQ = supabase.from('mailing_suppressions').select('id', { count: 'exact', head: true });

        // Apply org scoping where available
        if (orgId) {
          recipientsQ.eq('org_id', orgId);
          mailingsQ.eq('org_id', orgId);
          suppressQ.eq('org_id', orgId);
          // job_mailing_lists does not have org_id; scope by jobs belonging to org
          const jobsRes = await supabase.from('jobs').select('id').eq('org_id', orgId).limit(1000);
          const jobIds = (jobsRes.data || []).map((j: any) => j.id);
          if (jobIds.length === 0) {
            if (!isMounted) return;
            setTotals({ recipients: 0, mailings: 0, purchasedLists: 0, suppressed: 0, lastMailedAt: null });
            return;
          }
          // Count distinct jobs with any list rows (not raw row count)
          const listsQ = supabase.from('job_mailing_lists').select('job_id').in('job_id', jobIds as any[]);
          // Last activity = latest uploaded_at from job_mailing_lists (not backfill timestamp)
          const lastQ = supabase.from('job_mailing_lists').select('uploaded_at').in('job_id', jobIds as any[]).order('uploaded_at', { ascending: false }).limit(1);

          const [rRes, mRes, lRes, sRes, lastRes] = await Promise.all([recipientsQ, mailingsQ, listsQ, suppressQ, lastQ]);
          if (!isMounted) return;
          setTotals({
            recipients: (rRes.count as number) || 0,
            mailings: (mRes.count as number) || 0,
            purchasedLists: new Set((lRes.data || []).map((l: any) => l.job_id)).size,
            suppressed: (sRes.count as number) || 0,
            lastMailedAt: (lastRes.data && lastRes.data[0] && lastRes.data[0].uploaded_at) || null,
          });
        } else {
          const listsQ = supabase.from('job_mailing_lists').select('job_id');
          const lastQ = supabase.from('job_mailing_lists').select('uploaded_at').order('uploaded_at', { ascending: false }).limit(1);
          const [rRes, mRes, lRes, sRes, lastRes] = await Promise.all([recipientsQ, mailingsQ, listsQ, suppressQ, lastQ]);
          if (!isMounted) return;
          setTotals({
            recipients: (rRes.count as number) || 0,
            mailings: (mRes.count as number) || 0,
            purchasedLists: new Set((lRes.data || []).map((l: any) => l.job_id)).size,
            suppressed: (sRes.count as number) || 0,
            lastMailedAt: (lastRes.data && lastRes.data[0] && lastRes.data[0].uploaded_at) || null,
          });
        }
      } catch (err) {
        // ignore — show zeros
      }
    };
    load();
    return () => { isMounted = false; };
  }, [user?.is_master_admin, actingOrg?.id, user?.org_id]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      <Card title="Households in Database" value={String(totals.recipients)} />
      <Card title="Mail Pieces Tracked" value={String(totals.mailings)} />
      <Card title="Imported Mailing Lists" value={String(totals.purchasedLists)} />
      <Card title="Suppressed Households" value={String(totals.suppressed)} />
      <Card title="Last Mailing Activity" value={totals.lastMailedAt ? new Date(totals.lastMailedAt).toLocaleDateString() : '—'} />
    </div>
  );
};

export default MailingsOverview;
