import React, { useEffect, useMemo, useState } from 'react';
import { Campaign, Event, Responder } from '@/types';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useActingOrg } from '@/lib/actingOrg';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Target,
  Calendar,
  PieChart
} from 'lucide-react';

interface ReportsViewProps {
  campaigns: Campaign[];
  events: Event[];
  responders: Responder[];
}

const ReportsView: React.FC<ReportsViewProps> = ({ campaigns, events, responders }) => {
  const { user } = useAuth();
  const { actingOrgId } = useActingOrg();

  const effectiveOrgId = useMemo(() => {
    if (user?.is_master_admin) return actingOrgId ?? null;
    return (user as any)?.org_id ? String((user as any).org_id) : null;
  }, [actingOrgId, user]);

  const isOrgAdmin = (user as any)?.org_role === 'fmo_admin' || (user as any)?.org_role === 'org_admin';
  const isMasterViewingAs = Boolean(user?.is_master_admin && actingOrgId);
  const canSeeOrgWide = Boolean(isOrgAdmin || isMasterViewingAs);

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [orgUserIds, setOrgUserIds] = useState<string[] | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadOrgMembers = async () => {
      if (!user?.id) {
        if (!isMounted) return;
        setOrgUserIds(null);
        return;
      }

      if (!canSeeOrgWide || !effectiveOrgId) {
        if (!isMounted) return;
        setOrgUserIds([user.id]);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('org_members')
          .select('user_id')
          .eq('org_id', effectiveOrgId);

        if (error) throw error;
        const ids = (data ?? []).map((r: any) => String(r.user_id)).filter(Boolean);
        if (!isMounted) return;
        setOrgUserIds(ids.length ? ids : [user.id]);
      } catch {
        if (!isMounted) return;
        // If we can't load members (RLS/missing table/etc), fall back to the logged-in user's data.
        setOrgUserIds([user.id]);
      }
    };

    loadOrgMembers();
    return () => {
      isMounted = false;
    };
  }, [canSeeOrgWide, effectiveOrgId, user?.id]);

  const orgScopedCampaigns = useMemo(() => {
    if (!user?.id) return [] as Campaign[];
    const ids = orgUserIds ?? [user.id];
    return campaigns.filter((c) => ids.includes(String(c.user_id)));
  }, [campaigns, orgUserIds, user?.id]);

  const orgScopedCampaignIds = useMemo(() => new Set(orgScopedCampaigns.map((c) => c.id)), [orgScopedCampaigns]);

  const orgScopedEvents = useMemo(() => events.filter((e) => orgScopedCampaignIds.has(e.campaign_id)), [events, orgScopedCampaignIds]);
  const orgScopedResponders = useMemo(
    () => responders.filter((r) => orgScopedCampaignIds.has(r.campaign_id)),
    [responders, orgScopedCampaignIds]
  );

  const yearOptions = useMemo(() => {
    const years = new Set<number>();

    const addYear = (value: string | null | undefined) => {
      if (!value) return;
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) years.add(d.getFullYear());
    };

    orgScopedCampaigns.forEach((c) => addYear(c.created_at));
    orgScopedResponders.forEach((r) => addYear(r.created_at));
    orgScopedEvents.forEach((e) => addYear(e.event_date || e.created_at));

    years.add(currentYear);
    return Array.from(years).sort((a, b) => b - a);
  }, [currentYear, orgScopedCampaigns, orgScopedEvents, orgScopedResponders]);

  useEffect(() => {
    // If there's no data for the current selected year, keep selection but ensure it's still in the dropdown.
    if (!yearOptions.includes(selectedYear)) {
      setSelectedYear(currentYear);
    }
  }, [currentYear, selectedYear, yearOptions]);

  const { yearCampaigns, yearEvents, yearResponders } = useMemo(() => {
    const start = new Date(selectedYear, 0, 1);
    const end = new Date(selectedYear + 1, 0, 1);

    const inRange = (value: string | null | undefined) => {
      if (!value) return false;
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return false;
      return d >= start && d < end;
    };

    const yc = orgScopedCampaigns.filter((c) => inRange(c.created_at));
    const ye = orgScopedEvents.filter((e) => inRange(e.event_date || e.created_at));
    const yr = orgScopedResponders.filter((r) => inRange(r.created_at));

    return { yearCampaigns: yc, yearEvents: ye, yearResponders: yr };
  }, [orgScopedCampaigns, orgScopedEvents, orgScopedResponders, selectedYear]);

  // Calculate metrics (selected calendar year, org-cumulative when applicable)
  const totalMailed = yearCampaigns.reduce((sum, c) => sum + c.mail_quantity, 0);
  const totalResponders = yearResponders.length;
  const overallResponseRate = totalMailed > 0 ? (totalResponders / totalMailed) * 100 : 0;
  
  const campaignsByStatus = {
    active: yearCampaigns.filter(c => c.status === 'active').length,
    pending: yearCampaigns.filter(c => c.status === 'pending').length,
    closed: yearCampaigns.filter(c => c.status === 'closed').length,
  };

  const responsesBySource = {
    qr_code: yearResponders.filter(r => r.response_source === 'qr_code').length,
    call_center: yearResponders.filter(r => r.response_source === 'call_center').length,
    manual: yearResponders.filter(r => r.response_source === 'manual').length,
  };

  const confirmedRate = totalResponders > 0 
    ? (yearResponders.filter(r => r.confirmed).length / totalResponders) * 100 
    : 0;

  const attendedRate = totalResponders > 0 
    ? (yearResponders.filter(r => r.attended).length / totalResponders) * 100 
    : 0;

  // Campaign performance data
  const campaignPerformance = yearCampaigns.map(campaign => {
    const campaignResponders = yearResponders.filter(r => r.campaign_id === campaign.id);
    const responseRate = (campaignResponders.length / campaign.mail_quantity) * 100;
    return {
      projectId: campaign.project_id,
      mailed: campaign.mail_quantity,
      responders: campaignResponders.length,
      responseRate,
      status: campaign.status,
    };
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-red-400" />
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Reports & Analytics</h2>
              <p className="text-xs text-slate-600">Calendar year: {selectedYear}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600" htmlFor="reportsYear">Year</label>
          <select
            id="reportsYear"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y} className="bg-white text-slate-900">
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <Target className="w-5 h-5 text-red-400" />
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              overallResponseRate >= 1 ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'
            }`}>
              {overallResponseRate >= 1 ? 'On Target' : 'Below Target'}
            </span>
          </div>
          <div className="text-3xl font-bold text-slate-900">{overallResponseRate.toFixed(2)}%</div>
          <div className="text-sm text-slate-600">Overall Response Rate</div>
          <div className="mt-2 text-xs text-slate-500">Goal: 1.00%</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <Users className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="text-3xl font-bold text-slate-900">{confirmedRate.toFixed(0)}%</div>
          <div className="text-sm text-slate-600">Confirmation Rate</div>
          <div className="mt-2 text-xs text-slate-500">{yearResponders.filter(r => r.confirmed).length} confirmed</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <Calendar className="w-5 h-5 text-purple-400" />
          </div>
          <div className="text-3xl font-bold text-slate-900">{attendedRate.toFixed(0)}%</div>
          <div className="text-sm text-slate-600">Attendance Rate</div>
          <div className="mt-2 text-xs text-slate-500">{yearResponders.filter(r => r.attended).length} attended</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <TrendingUp className="w-5 h-5 text-green-400" />
          </div>
          <div className="text-3xl font-bold text-slate-900">{totalMailed.toLocaleString()}</div>
          <div className="text-sm text-slate-600">Total Mail Pieces</div>
          <div className="mt-2 text-xs text-slate-500">{yearCampaigns.length} campaigns</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Campaign Status Distribution */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <PieChart className="w-5 h-5 text-slate-400" />
            Campaign Status
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-slate-700">Active</span>
              </div>
              <span className="text-slate-900 font-semibold">{campaignsByStatus.active}</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div 
                className="bg-green-500 h-2 rounded-full" 
                style={{ width: `${(campaignsByStatus.active / yearCampaigns.length) * 100 || 0}%` }}
              ></div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                <span className="text-slate-700">Pending</span>
              </div>
              <span className="text-slate-900 font-semibold">{campaignsByStatus.pending}</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div 
                className="bg-amber-500 h-2 rounded-full" 
                style={{ width: `${(campaignsByStatus.pending / yearCampaigns.length) * 100 || 0}%` }}
              ></div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-slate-500"></div>
                <span className="text-slate-700">Closed</span>
              </div>
              <span className="text-slate-900 font-semibold">{campaignsByStatus.closed}</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div 
                className="bg-slate-500 h-2 rounded-full" 
                style={{ width: `${(campaignsByStatus.closed / yearCampaigns.length) * 100 || 0}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Response Source Distribution */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-slate-400" />
            Response Sources
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                <span className="text-slate-700">QR Code</span>
              </div>
              <span className="text-slate-900 font-semibold">{responsesBySource.qr_code}</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div 
                className="bg-purple-500 h-2 rounded-full" 
                style={{ width: `${(responsesBySource.qr_code / totalResponders) * 100 || 0}%` }}
              ></div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                <span className="text-slate-700">Call Center</span>
              </div>
              <span className="text-slate-900 font-semibold">{responsesBySource.call_center}</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div 
                className="bg-blue-500 h-2 rounded-full" 
                style={{ width: `${(responsesBySource.call_center / totalResponders) * 100 || 0}%` }}
              ></div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-slate-700">Manual Entry</span>
              </div>
              <span className="text-slate-900 font-semibold">{responsesBySource.manual}</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div 
                className="bg-green-500 h-2 rounded-full" 
                style={{ width: `${(responsesBySource.manual / totalResponders) * 100 || 0}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {/* Campaign Performance Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">Campaign Performance</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-slate-700 uppercase border-b border-slate-200">
                <th className="px-5 py-3">Project ID</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Mailed</th>
                <th className="px-5 py-3">Responders</th>
                <th className="px-5 py-3">Response Rate</th>
                <th className="px-5 py-3">Performance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {campaignPerformance.map((campaign) => (
                <tr key={campaign.projectId} className="hover:bg-white/5 transition-colors">
                  <td className="px-5 py-3">
                    <span className="bg-green-600 text-white px-2 py-1 rounded font-bold text-sm">
                      #{campaign.projectId}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      campaign.status === 'active' ? 'bg-green-500/20 text-green-400' :
                      campaign.status === 'pending' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-slate-500/20 text-slate-400'
                    }`}>
                      {campaign.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-900">{campaign.mailed.toLocaleString()}</td>
                  <td className="px-5 py-3 text-slate-900">{campaign.responders}</td>
                  <td className="px-5 py-3">
                    <span className={`font-semibold ${
                      campaign.responseRate >= 1 ? 'text-green-400' : 'text-amber-400'
                    }`}>
                      {campaign.responseRate.toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="w-24 bg-slate-700 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${
                          campaign.responseRate >= 1 ? 'bg-green-500' : 'bg-amber-500'
                        }`}
                        style={{ width: `${Math.min(campaign.responseRate * 100, 100)}%` }}
                      ></div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ReportsView;
