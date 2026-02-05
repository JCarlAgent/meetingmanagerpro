import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useActingOrg } from '@/lib/actingOrg';
import FmoHomeView from './FmoHomeView';
import AdvisorHomeView from './AdvisorHomeView';

const HomeView: React.FC = () => {
  const { user } = useAuth();
  const { actingOrgId } = useActingOrg();

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

  const isFmo = user?.org_role === 'fmo_admin' || user?.org_role === 'org_admin';

  if (isFmo) {
    return <FmoHomeView orgId={orgId} />;
  }

  return <AdvisorHomeView orgId={orgId} userId={user.id} />;
};

export default HomeView;
