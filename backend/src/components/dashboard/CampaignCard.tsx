import React, { useState } from 'react';
import { Campaign, Event, Responder } from '@/types';
import { 
  ChevronDown, 
  ChevronUp, 
  MapPin, 
  Phone, 
  ExternalLink,
  Users,
  Mail,
  Calendar,
  CheckCircle2,
  Clock,
  Image,
  ListChecks,
  Printer,
  Package,
  Truck,
  TrendingUp
} from 'lucide-react';
import ResponderList from './ResponderList';
import DeliveryTracking from './DeliveryTracking';
import PostMeetingROIModal from './PostMeetingROIModal';

interface CampaignCardProps {
  campaign: Campaign;
  events: Event[];
  responders: Responder[];
  onUpdateResponder: (responderId: string, updates: Partial<Responder>) => void;
  onUpdateCampaign: (campaignId: string, updates: Partial<Campaign>) => void;
}

const CampaignCard: React.FC<CampaignCardProps> = ({ 
  campaign, 
  events, 
  responders,
  onUpdateResponder,
  onUpdateCampaign,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [showDelivery, setShowDelivery] = useState(false);
  const [showRoiForm, setShowRoiForm] = useState(false);

  const totalResponders = responders.length;
  const totalGuests = responders.reduce((sum, r) => sum + (r.guests || 0), 0);
  const totalReservations = totalResponders + totalGuests;
  const responseRate = ((totalResponders / campaign.mail_quantity) * 100).toFixed(2);
  const confirmedCount = responders.filter(r => r.confirmed).length;
  const isPaid = Boolean(campaign.paid_at);

  const getStatusBgColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500/10 text-green-400 border-green-500/30';
      case 'closed': return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
      case 'pending': return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
    }
  };

  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const getDayOfWeek = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  };

  const getMonthName = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'long' });
  };

  const getDay = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.getDate();
  };

  return (
    <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-white/10 overflow-hidden hover:border-white/20 transition-all">
      {/* Card Header */}
      <div className="p-4 lg:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          {/* Project ID & Status */}
          <div className="flex items-center gap-3">
            <div className="bg-green-600 text-white px-3 py-1.5 rounded-lg font-bold text-lg">
              {campaign.project_id}
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase border ${getStatusBgColor(campaign.status)}`}>
              {campaign.status}
            </span>
            <button
              type="button"
              onClick={() =>
                onUpdateCampaign(campaign.id, {
                  paid_at: isPaid ? null : new Date().toISOString(),
                })
              }
              className={`px-3 py-1 rounded-full text-xs font-semibold uppercase border transition-colors hover:opacity-90 ${
                isPaid
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                  : 'bg-slate-500/10 text-slate-300 border-slate-500/30'
              }`}
              title={isPaid ? 'Click to mark unpaid' : 'Click to mark paid'}
            >
              {isPaid ? 'Paid' : 'Unpaid'}
            </button>
            <span className="text-slate-400 text-sm hidden sm:inline">
              {new Date(campaign.created_at).toLocaleDateString()}
            </span>
          </div>

          {/* Response Rate */}
          <div className="text-right">
            <div className="text-3xl font-bold text-green-400">{responseRate}%</div>
            <div className="text-xs text-slate-400 uppercase">Response Rate</div>
          </div>
        </div>

        {/* Campaign Details Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          {/* Quantity */}
          <div className="bg-slate-900/50 rounded-lg p-3">
            <div className="text-xs text-slate-400 uppercase mb-1">Quantity</div>
            <div className="text-xl font-bold text-white">{campaign.mail_quantity.toLocaleString()}</div>
            <div className="text-xs text-slate-500">{campaign.mail_piece_size} {campaign.mail_piece_type}</div>
          </div>

          {/* Venue */}
          <div className="bg-slate-900/50 rounded-lg p-3">
            <div className="text-xs text-slate-400 uppercase mb-1">Venue</div>
            <div className="text-lg font-semibold text-white truncate">{events[0]?.venue_name || 'TBD'}</div>
            <div className="text-xs text-slate-500">{events[0]?.venue_city}, {events[0]?.venue_state}</div>
          </div>

          {/* Responders */}
          <div className="bg-slate-900/50 rounded-lg p-3">
            <div className="text-xs text-slate-400 uppercase mb-1">Responders</div>
            <div className="text-xl font-bold text-cyan-400">{totalResponders}</div>
            <div className="text-xs text-slate-500">{totalGuests} guests</div>
          </div>

          {/* Confirmed */}
          <div className="bg-slate-900/50 rounded-lg p-3">
            <div className="text-xs text-slate-400 uppercase mb-1">Confirmed</div>
            <div className="text-xl font-bold text-emerald-400">{confirmedCount}</div>
            <div className="text-xs text-slate-500">{totalReservations} total seats</div>
          </div>
        </div>

        {/* Event Dates */}
        <div className="flex flex-wrap gap-2 mt-4">
          {events.map((event) => (
            <div 
              key={event.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                event.status === 'closed' 
                  ? 'bg-slate-700/50 border-slate-600' 
                  : event.status === 'full'
                  ? 'bg-amber-500/10 border-amber-500/30'
                  : 'bg-green-500/10 border-green-500/30'
              }`}
              onClick={() => setSelectedEventId(selectedEventId === event.id ? null : event.id)}
            >
              <div className="text-center">
                <div className="text-xs text-slate-400">{getMonthName(event.event_date)}</div>
                <div className="text-lg font-bold text-white">{getDay(event.event_date)}</div>
                <div className="text-xs text-slate-500">{getDayOfWeek(event.event_date)}</div>
              </div>
              <div className="border-l border-white/10 pl-2">
                <div className="text-sm text-white">{formatTime(event.event_time)}</div>
                <div className={`text-xs uppercase font-semibold ${
                  event.status === 'closed' ? 'text-slate-400' : 
                  event.status === 'full' ? 'text-amber-400' : 'text-green-400'
                }`}>
                  {event.status}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Status Icons */}
        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/10">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${campaign.artwork_status === 'approved' ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 text-slate-400'}`}>
              <Image className="w-4 h-4" />
            </div>
            <span className="text-xs text-slate-400">Artwork</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${campaign.list_status === 'approved' ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 text-slate-400'}`}>
              <ListChecks className="w-4 h-4" />
            </div>
            <span className="text-xs text-slate-400">List</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${campaign.prepped_status ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 text-slate-400'}`}>
              <Printer className="w-4 h-4" />
            </div>
            <span className="text-xs text-slate-400">Prepped</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${campaign.produced_status ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 text-slate-400'}`}>
              <Package className="w-4 h-4" />
            </div>
            <span className="text-xs text-slate-400">Produced</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {campaign.toll_free_number && (
              <a href={`tel:${campaign.toll_free_number}`} className="flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors">
                <Phone className="w-4 h-4" />
                <span className="hidden sm:inline">{campaign.toll_free_number}</span>
              </a>
            )}
            {campaign.landing_page_url && (
              <a href={campaign.landing_page_url} target="_blank" rel="noopener noreferrer" className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>

        {/* USPS Delivery Tracking - Compact View */}
        <DeliveryTracking campaign={campaign} compact={true} />
      </div>

      {/* Action Buttons */}
      <div className="flex border-t border-white/10">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-slate-900/50 text-slate-400 hover:text-white hover:bg-slate-900/80 transition-colors"
        >
          <Users className="w-4 h-4" />
          <span className="text-sm font-medium">
            {isExpanded ? 'Hide' : 'View'} Responders ({totalResponders})
          </span>
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        <button
          onClick={() => setShowDelivery(!showDelivery)}
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-slate-900/50 text-slate-400 hover:text-white hover:bg-slate-900/80 transition-colors border-l border-white/10"
        >
          <Truck className="w-4 h-4" />
          <span className="text-sm font-medium">
            {showDelivery ? 'Hide' : 'View'} Delivery Details
          </span>
          {showDelivery ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {campaign.status === 'closed' && (
          <button
            onClick={() => setShowRoiForm(true)}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-500/10 text-red-400 hover:text-red-300 hover:bg-red-500/20 transition-colors border-l border-white/10"
          >
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm font-medium">
              Submit ROI Report
            </span>
          </button>
        )}
      </div>

      {/* Expanded Responder List */}
      {isExpanded && (
        <div className="border-t border-white/10">
          <ResponderList 
            responders={responders}
            events={events}
            selectedEventId={selectedEventId}
            onSelectEvent={setSelectedEventId}
            onUpdateResponder={onUpdateResponder}
          />
        </div>
      )}

      {/* Expanded Delivery Tracking */}
      {showDelivery && (
        <div className="border-t border-white/10 p-4">
          <DeliveryTracking campaign={campaign} compact={false} />
        </div>
      )}

      {/* ROI Modal */}
      {showRoiForm && (
        <PostMeetingROIModal
          jobId={campaign.id}
          jobTitle={`Campaign ${campaign.project_id}`}
          isOpen={showRoiForm}
          onClose={() => setShowRoiForm(false)}
          onSuccess={() => {
            setShowRoiForm(false);
            // Optionally, trigger a refresh here if needed
          }}
        />
      )}
    </div>
  );
};

export default CampaignCard;
