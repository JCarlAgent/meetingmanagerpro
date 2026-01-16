import React from 'react';
import { Campaign, Event, Responder } from '@/types';
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
  // Calculate metrics
  const totalMailed = campaigns.reduce((sum, c) => sum + c.mail_quantity, 0);
  const totalResponders = responders.length;
  const overallResponseRate = totalMailed > 0 ? (totalResponders / totalMailed) * 100 : 0;
  
  const campaignsByStatus = {
    active: campaigns.filter(c => c.status === 'active').length,
    pending: campaigns.filter(c => c.status === 'pending').length,
    closed: campaigns.filter(c => c.status === 'closed').length,
  };

  const responsesBySource = {
    qr_code: responders.filter(r => r.response_source === 'qr_code').length,
    call_center: responders.filter(r => r.response_source === 'call_center').length,
    manual: responders.filter(r => r.response_source === 'manual').length,
  };

  const confirmedRate = totalResponders > 0 
    ? (responders.filter(r => r.confirmed).length / totalResponders) * 100 
    : 0;

  const attendedRate = totalResponders > 0 
    ? (responders.filter(r => r.attended).length / totalResponders) * 100 
    : 0;

  // Campaign performance data
  const campaignPerformance = campaigns.map(campaign => {
    const campaignResponders = responders.filter(r => r.campaign_id === campaign.id);
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
      <div className="flex items-center gap-3">
        <BarChart3 className="w-6 h-6 text-red-400" />
        <h2 className="text-xl font-semibold text-white">Reports & Analytics</h2>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-white/10 p-5">
          <div className="flex items-center justify-between mb-3">
            <Target className="w-5 h-5 text-red-400" />
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              overallResponseRate >= 1 ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'
            }`}>
              {overallResponseRate >= 1 ? 'On Target' : 'Below Target'}
            </span>
          </div>
          <div className="text-3xl font-bold text-white">{overallResponseRate.toFixed(2)}%</div>
          <div className="text-sm text-slate-400">Overall Response Rate</div>
          <div className="mt-2 text-xs text-slate-500">Goal: 1.00%</div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-white/10 p-5">
          <div className="flex items-center justify-between mb-3">
            <Users className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="text-3xl font-bold text-white">{confirmedRate.toFixed(0)}%</div>
          <div className="text-sm text-slate-400">Confirmation Rate</div>
          <div className="mt-2 text-xs text-slate-500">{responders.filter(r => r.confirmed).length} confirmed</div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-white/10 p-5">
          <div className="flex items-center justify-between mb-3">
            <Calendar className="w-5 h-5 text-purple-400" />
          </div>
          <div className="text-3xl font-bold text-white">{attendedRate.toFixed(0)}%</div>
          <div className="text-sm text-slate-400">Attendance Rate</div>
          <div className="mt-2 text-xs text-slate-500">{responders.filter(r => r.attended).length} attended</div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-white/10 p-5">
          <div className="flex items-center justify-between mb-3">
            <TrendingUp className="w-5 h-5 text-green-400" />
          </div>
          <div className="text-3xl font-bold text-white">{totalMailed.toLocaleString()}</div>
          <div className="text-sm text-slate-400">Total Mail Pieces</div>
          <div className="mt-2 text-xs text-slate-500">{campaigns.length} campaigns</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Campaign Status Distribution */}
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-white/10 p-5">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <PieChart className="w-5 h-5 text-slate-400" />
            Campaign Status
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-slate-300">Active</span>
              </div>
              <span className="text-white font-semibold">{campaignsByStatus.active}</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div 
                className="bg-green-500 h-2 rounded-full" 
                style={{ width: `${(campaignsByStatus.active / campaigns.length) * 100 || 0}%` }}
              ></div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                <span className="text-slate-300">Pending</span>
              </div>
              <span className="text-white font-semibold">{campaignsByStatus.pending}</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div 
                className="bg-amber-500 h-2 rounded-full" 
                style={{ width: `${(campaignsByStatus.pending / campaigns.length) * 100 || 0}%` }}
              ></div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-slate-500"></div>
                <span className="text-slate-300">Closed</span>
              </div>
              <span className="text-white font-semibold">{campaignsByStatus.closed}</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div 
                className="bg-slate-500 h-2 rounded-full" 
                style={{ width: `${(campaignsByStatus.closed / campaigns.length) * 100 || 0}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Response Source Distribution */}
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-white/10 p-5">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-slate-400" />
            Response Sources
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                <span className="text-slate-300">QR Code</span>
              </div>
              <span className="text-white font-semibold">{responsesBySource.qr_code}</span>
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
                <span className="text-slate-300">Call Center</span>
              </div>
              <span className="text-white font-semibold">{responsesBySource.call_center}</span>
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
                <span className="text-slate-300">Manual Entry</span>
              </div>
              <span className="text-white font-semibold">{responsesBySource.manual}</span>
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
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-white/10 overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10">
          <h3 className="text-lg font-semibold text-white">Campaign Performance</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase border-b border-white/10">
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
                  <td className="px-5 py-3 text-white">{campaign.mailed.toLocaleString()}</td>
                  <td className="px-5 py-3 text-white">{campaign.responders}</td>
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
