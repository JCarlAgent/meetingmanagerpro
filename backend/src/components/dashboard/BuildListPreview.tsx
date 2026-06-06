import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useActingOrg } from '@/lib/actingOrg';

const BuildListPreview: React.FC = () => {
  const { user } = useAuth();
  const { actingOrg } = useActingOrg();
  const [totalEligible, setTotalEligible] = useState<number | null>(null);
  const [totalSuppressed, setTotalSuppressed] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const orgId = user?.is_master_admin ? (actingOrg?.id ?? null) : (user?.org_id ?? null);
        // Lightweight preview: count recipients and suppressions; do not build actual list.
        let rQ = supabase.from('recipients').select('id', { count: 'exact', head: true });
        let sQ = supabase.from('mailing_suppressions').select('id', { count: 'exact', head: true });
        if (orgId) { rQ = rQ.eq('org_id', orgId); sQ = sQ.eq('org_id', orgId); }
        const [rRes, sRes] = await Promise.all([rQ, sQ]);
        if (!isMounted) return;
        setTotalEligible(((rRes.count as number) || 0) - ((sRes.count as number) || 0));
        setTotalSuppressed((sRes.count as number) || 0);
      } catch (err) {
        // ignore
      }
    };
    load();
    return () => { isMounted = false; };
  }, [user?.is_master_admin, actingOrg?.id, user?.org_id]);

  return (
    <div>
      <p className="text-sm text-slate-600">Build future mailing lists while automatically excluding suppressed households and prior responders. This preview is non-destructive; no changes will be made.</p>
      <div className="mt-4 grid grid-cols-1 gap-2">
        <div className="text-sm text-slate-700">Eligible recipients: <span className="font-semibold">{totalEligible == null ? '—' : totalEligible}</span></div>
        <div className="text-sm text-slate-700">Suppressed recipients excluded: <span className="font-semibold">{totalSuppressed == null ? '—' : totalSuppressed}</span></div>
        <div className="text-sm text-slate-500 mt-2">Note: Future phases will add advanced filters, recent-mail exclusions, and high-value scoring.</div>
      </div>
    </div>
  );
};

export default BuildListPreview;
