import React from 'react';
import { Campaign, Event, Responder } from '@/types';
import { 
  FolderKanban, 
  Calendar, 
  Mail, 
  Users, 
  TrendingUp,
  CheckCircle2,
  Clock,
  Target
} from 'lucide-react';

interface StatsOverviewProps {
  campaigns: Campaign[];
  events: Event[];
  responders: Responder[];
}

const StatsOverview: React.FC<StatsOverviewProps> = ({ campaigns, events, responders }) => {
  const activeCampaigns = campaigns.filter(c => c.status === 'active').length;
  const totalCampaigns = campaigns.length;
  const totalEvents = events.length;
  const totalMailed = campaigns.reduce((sum, c) => sum + c.mail_quantity, 0);
  const totalResponders = responders.length;
  const totalGuests = responders.reduce((sum, r) => sum + (r.guests || 0), 0);
  const confirmedResponders = responders.filter(r => r.confirmed).length;
  const overallResponseRate = totalMailed > 0 ? ((totalResponders / totalMailed) * 100).toFixed(2) : '0.00';

  const stats = [
    {
      label: 'Active Campaigns',
      value: activeCampaigns,
      subValue: `${totalCampaigns} total`,
      icon: FolderKanban,
      color: 'from-green-500 to-emerald-600',
      bgColor: 'bg-green-500/10',
      iconColor: 'text-green-400'
    },
    {
      label: 'Scheduled Events',
      value: totalEvents,
      subValue: 'Dinner meetings',
      icon: Calendar,
      color: 'from-blue-500 to-cyan-600',
      bgColor: 'bg-blue-500/10',
      iconColor: 'text-blue-400'
    },
    {
      label: 'Total Mailed',
      value: totalMailed.toLocaleString(),
      subValue: 'Mail pieces',
      icon: Mail,
      color: 'from-purple-500 to-violet-600',
      bgColor: 'bg-purple-500/10',
      iconColor: 'text-purple-400'
    },
    {
      label: 'Total Responders',
      value: totalResponders,
      subValue: `+${totalGuests} guests`,
      icon: Users,
      color: 'from-amber-500 to-orange-600',
      bgColor: 'bg-amber-500/10',
      iconColor: 'text-amber-400'
    },
    {
      label: 'Confirmed',
      value: confirmedResponders,
      subValue: `${Math.round((confirmedResponders / totalResponders) * 100) || 0}% rate`,
      icon: CheckCircle2,
      color: 'from-teal-500 to-cyan-600',
      bgColor: 'bg-teal-500/10',
      iconColor: 'text-teal-400'
    },
    {
      label: 'Response Rate',
      value: `${overallResponseRate}%`,
      subValue: 'Overall average',
      icon: Target,
      color: 'from-red-500 to-rose-600',
      bgColor: 'bg-red-500/10',
      iconColor: 'text-red-400'
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <div 
            key={index}
            className="bg-slate-800/50 backdrop-blur rounded-xl border border-white/10 p-4 hover:border-white/20 transition-all"
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <Icon className={`w-5 h-5 ${stat.iconColor}`} />
              </div>
            </div>
            <div className="text-2xl font-bold text-white mb-1">{stat.value}</div>
            <div className="text-xs text-slate-400">{stat.label}</div>
            <div className="text-xs text-slate-500 mt-1">{stat.subValue}</div>
          </div>
        );
      })}
    </div>
  );
};

export default StatsOverview;
