import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useActingOrg } from '@/lib/actingOrg';
import { supabase } from '@/lib/supabase';
import FmoHomeView from '@/components/dashboard/FmoHomeView';
import AdvisorHomeView from '@/components/dashboard/AdvisorHomeView';
import WeatherAlertWidget from '@/components/dashboard/WeatherAlertWidget';
import CampaignCard from './CampaignCard';
import StatsOverview from './StatsOverview';
import AiCampaignQuery from './AiCampaignQuery';
import { Campaign, Event } from '@/types';

export interface HomeViewProps {
  onNavigate?: (view: string) => void;
  onOpenNewCampaign?: () => void;
  // Optional: allow Dashboard to pass data for lightweight previews
  campaigns?: Campaign[];
  events?: Event[];
}

const HomeView: React.FC<HomeViewProps> = ({ onNavigate, onOpenNewCampaign, campaigns = [], events = [] }) => {
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
  // Render a three-section admin home: Campaigns | Campaign Builder | Meeting Numbers
  const activeCampaigns = campaigns.filter(c => c.status === 'active' || c.status === 'pending');
  const completedCampaigns = campaigns.filter(c => c.status === 'closed');

  const getCampaignEvents = (id: string) => events.filter(e => e.campaign_id === id);

  const [showAiBuilder, setShowAiBuilder] = useState(false);

  return (
    <div className="space-y-6">
      <WeatherAlertWidget />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 1. Campaigns */}
        <section className="col-span-1 bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Campaigns</h3>
          <p className="text-sm text-slate-500 mt-1">Active and completed campaigns (canonical jobs preferred).</p>

          <div className="mt-4 space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-slate-700">Active Campaigns</h4>
              {activeCampaigns.length === 0 ? (
                <div className="text-sm text-slate-500 mt-2">No active campaigns. <button onClick={onOpenNewCampaign} className="text-indigo-600 hover:underline">Create one</button></div>
              ) : (
                <div className="mt-3 space-y-3">
                  {activeCampaigns.slice(0, 3).map(c => (
                    <CampaignCard key={c.id} campaign={c} events={getCampaignEvents(c.id)} responders={[]} onUpdateCampaign={() => {}} onUpdateResponder={() => {}} />
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4">
              <h4 className="text-sm font-semibold text-slate-700">Completed Campaigns</h4>
              {completedCampaigns.length === 0 ? (
                <div className="text-sm text-slate-500 mt-2">No completed campaigns yet. <button onClick={onNavigate ? () => onNavigate('campaigns') : undefined} className="text-indigo-600 hover:underline">View all</button></div>
              ) : (
                <div className="mt-3 space-y-3">
                  {completedCampaigns.slice(0, 3).map(c => (
                    <CampaignCard key={c.id} campaign={c} events={getCampaignEvents(c.id)} responders={[]} onUpdateCampaign={() => {}} onUpdateResponder={() => {}} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 2. Campaign Builder */}
        <section className="col-span-1 bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Campaign Builder</h3>
          <p className="text-sm text-slate-500 mt-1">Create campaigns manually or use the AI-assisted builder.</p>

          <div className="mt-4 flex flex-col gap-3">
            <button onClick={onOpenNewCampaign} className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-lg">New Campaign (Manual)</button>

            <button onClick={() => setShowAiBuilder(s => !s)} className="w-full border border-slate-200 rounded-lg px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">{showAiBuilder ? 'Hide AI Builder' : 'Open AI Builder'}</button>

            {showAiBuilder && (
              <div className="mt-3 w-full bg-slate-50 p-4 rounded-lg">
                <AiCampaignQuery />
              </div>
            )}

            <div className="text-xs text-slate-500 mt-2">AI builder will later expose filters for age, income, SPA, drive-time, and POI types.</div>
          </div>
        </section>

        {/* 3. Meeting Numbers */}
        <aside className="col-span-1 bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Meeting Numbers</h3>
          <p className="text-sm text-slate-500 mt-1">High-level placeholders for recent results, attendance, and top performers.</p>
          <div className="mt-4">
            <StatsOverview campaigns={campaigns} events={events} responders={[]} />
          </div>
        </aside>
      </div>
    </div>
  );
};

export default HomeView;
