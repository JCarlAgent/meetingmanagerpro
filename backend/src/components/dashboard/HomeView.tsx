import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useActingOrg } from '@/lib/actingOrg';
import { supabase } from '@/lib/supabase';
import FmoHomeView from '@/components/dashboard/FmoHomeView';
import AdvisorHomeView from '@/components/dashboard/AdvisorHomeView';

export interface HomeViewProps {
  onNavigate?: (view: string) => void;
}

const HomeView: React.FC<HomeViewProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const { actingOrgId } = useActingOrg();

  const [actingOrgIsFmo, setActingOrgIsFmo] = useState<boolean | null>(null);
  const [isDetectingActingOrgType, setIsDetectingActingOrgType] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const detect = async () => {
      if (!user?.is_master_admin || !actingOrgId) {
        if (!isMounted) return;
        setActingOrgIsFmo(null);
        setIsDetectingActingOrgType(false);
        return;
      }

      setIsDetectingActingOrgType(true);
      try {
        const { data, error } = await supabase
          .from('org_members')
          .select('role')
          .eq('org_id', actingOrgId)
          .in('role', ['fmo_admin', 'org_admin'])
          .limit(1);

        if (error) throw error;
        if (!isMounted) return;
        setActingOrgIsFmo((data ?? []).length > 0);
      } catch {
        if (!isMounted) return;
        // If detection fails, default to advisor view (safer/least privileged UI).
        setActingOrgIsFmo(false);
      } finally {
        if (!isMounted) return;
        setIsDetectingActingOrgType(false);
      }
    };

    detect();
    return () => {
      isMounted = false;
    };
  }, [user?.is_master_admin, actingOrgId]);

  // Master admins stay in the master workflow unless they are acting as a client org.
  if (user?.is_master_admin && !actingOrgId) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">Home</h1>
          <p className="mt-2 text-slate-600">Use the Clients page to select a client org.</p>
        </div>
      </div>
    );
  }

  const orgId = actingOrgId || user?.org_id || null;

  if (!user?.id) return null;
  if (!orgId) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">Home</h1>
          <p className="mt-2 text-slate-600">You are not assigned to an organization yet.</p>
        </div>
      </div>
    );
  }

  const isFmo = user?.is_master_admin && actingOrgId ? actingOrgIsFmo === true : user?.org_role === 'fmo_admin' || user?.org_role === 'org_admin';

  if (user?.is_master_admin && actingOrgId && isDetectingActingOrgType) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">Home</h1>
          <p className="mt-2 text-slate-600">Loading client dashboard…</p>
        </div>
      </div>
    );
  }

  if (isFmo) {
    return <FmoHomeView orgId={orgId} />;
  }

  return <AdvisorHomeView orgId={orgId} userId={user.id} onNavigate={onNavigate} />;
};

export default HomeView;
