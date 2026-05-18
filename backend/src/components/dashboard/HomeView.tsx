import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useActingOrg } from '@/lib/actingOrg';
import { supabase } from '@/lib/supabase';
import FmoHomeView from '@/components/dashboard/FmoHomeView';
import AdvisorHomeView from '@/components/dashboard/AdvisorHomeView';
import ClientDashboard from '@/components/dashboard/ClientDashboard';
import WeatherAlertWidget from '@/components/dashboard/WeatherAlertWidget';

export interface HomeViewProps {
  onNavigate?: (view: string) => void;
  campaigns?: any[];
  events?: any[];
  onUpdateCampaignStatus?: (id: string, newStatus: boolean[]) => Promise<void> | void;
  debugInfo?: any;
}

const HomeView: React.FC<HomeViewProps> = ({ onNavigate, campaigns, events, onUpdateCampaignStatus, debugInfo }) => {
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

  // ── TEMPORARY DIAGNOSTIC PANEL — remove after meetings confirmed working ──
  const diagBlock = debugInfo ? (
    <details style={{marginBottom:'12px'}} className="rounded border border-amber-300 bg-amber-50 text-[10px] font-mono" open>
      <summary style={{padding:'4px 10px',cursor:'pointer',fontWeight:600,color:'#92400e',userSelect:'none'}}>🔍 DIAG (HomeView): job/meeting load trace — click to collapse</summary>
      <div style={{padding:'4px 10px 10px',maxHeight:'380px',overflow:'auto',color:'#78350f',lineHeight:'1.6'}}>
        <div><b>userId:</b> {debugInfo.userId ?? '—'}</div>
        <div><b>orgId:</b> {debugInfo.orgId ?? '—'}</div>
        <div><b>orgRole:</b> {debugInfo.orgRole ?? '—'}</div>
        <div><b>isMaster:</b> {String(debugInfo.isMaster)}</div>
        <div><b>jobs count:</b> {debugInfo.jobsCount} | rows: {JSON.stringify(debugInfo.jobs)}</div>
        <div><b>job_meetings count:</b> {debugInfo.jobMeetingsCount}</div>
        <div><b>job_meetings RLS error:</b> {debugInfo.jobMeetingsError ? JSON.stringify(debugInfo.jobMeetingsError) : 'none'}</div>
        <div><b>job_meetings rows:</b> {JSON.stringify(debugInfo.jobMeetingsRaw)}</div>
        <div><b>events mapped:</b> {debugInfo.eventsCount} | {JSON.stringify(debugInfo.events)}</div>
        <div><b>campaigns prop (this component):</b> {(campaigns ?? []).length} | {JSON.stringify((campaigns ?? []).map((c:any)=>({id:c.id,job_number:c.job_number,status:c.status})))}</div>
        <div><b>events prop (this component):</b> {(events ?? []).length} | {JSON.stringify((events ?? []).map((e:any)=>({id:e.id,campaign_id:e.campaign_id,venue_name:e.venue_name,event_date:e.event_date})))}</div>
        <div><b>note:</b> {debugInfo.note ?? '—'}</div>
      </div>
    </details>
  ) : null;
  // ── END DIAGNOSTIC PANEL ──

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
    return (
      <div className="space-y-6">
        {diagBlock}
        <WeatherAlertWidget />
        <ClientDashboard orgId={orgId} isFmo={isFmo} onNavigate={onNavigate} campaigns={campaigns} events={events} onUpdateCampaignStatus={onUpdateCampaignStatus} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {diagBlock}
      <WeatherAlertWidget />
      <ClientDashboard orgId={orgId} isFmo={isFmo} onNavigate={onNavigate} campaigns={campaigns} events={events} onUpdateCampaignStatus={onUpdateCampaignStatus} />
    </div>
  );
};

export default HomeView;
