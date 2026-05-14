import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
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
import { toErrorMessage } from '@/lib/errors';

interface CampaignCardProps {
  campaign: Campaign;
  events: Event[];
  responders: Responder[];
  onUpdateResponder: (responderId: string, updates: Partial<Responder>) => void;
  onUpdateCampaign: (campaignId: string, updates: Partial<Campaign>) => void;
  // optional callback to open add responder UI; if not provided the component will emit a global event
  onAddResponder?: (campaignId: string) => void;
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
  const { user } = useAuth();

  // Helper: persist checklist index (0-based) into jobs.notes via same pattern used in Dashboard.handleUpdateCampaignStatus
  const persistChecklistIndex = async (jobId: string, index: number, value: boolean) => {
    try {
      const { data: job } = await supabase.from('jobs').select('id, notes').eq('id', jobId).maybeSingle();
      let notesObj: any = {};
      try { if (job && job.notes) notesObj = typeof job.notes === 'string' ? JSON.parse(job.notes) : job.notes; } catch { notesObj = { text: job?.notes ?? '' }; }
      if (!notesObj) notesObj = {};
      if (!notesObj.checklist || typeof notesObj.checklist !== 'object') notesObj.checklist = {};
      const existingItems = (notesObj && typeof notesObj === 'object' && notesObj.checklist && Array.isArray(notesObj.checklist.items)) ? notesObj.checklist.items : [];
      existingItems[index] = !!value;
      notesObj.checklist.items = existingItems;
      const { data: updatedRows, error: updateErr } = await supabase.from('jobs').update({ notes: JSON.stringify(notesObj) }).eq('id', jobId).select('id, notes');
      if (updateErr) throw updateErr;
      // Update local campaign status if present
      const nextStatus = Array.isArray(campaign.status) ? campaign.status.slice() : [false,false,false,false,false];
      nextStatus[index] = !!value;
      onUpdateCampaign(campaign.id, { status: nextStatus });
      return updatedRows;
    } catch (err: any) {
      console.error('persistChecklistIndex failed', err);
      alert('Failed to save checklist: ' + (err?.message || String(err)));
      return null;
    }
  };

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
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
            <div className="text-sm text-slate-200">{events[0]?.venue_city || ''}{events[0]?.venue_city && events[0]?.venue_state ? ', ' : ''}{events[0]?.venue_state || ''}</div>
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

        {/* Meetings List */}
        <div className="mt-4">
          <h4 className="text-sm text-slate-300 uppercase mb-2">Meetings</h4>
          <div className="space-y-2">
            {events.length === 0 && (
              <div className="bg-white text-slate-900 rounded-lg p-3">No meetings scheduled</div>
            )}
            {events.map((event) => (
              <div key={event.id} className="bg-white text-slate-900 rounded-lg p-3 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{event.venue_name || 'TBD'}</div>
                  <div className="text-sm text-slate-600">{event.venue_city}{event.venue_city && event.venue_state ? ', ' : ''}{event.venue_state}</div>
                  <div className="text-sm text-slate-700 mt-1">{event.event_date} {event.event_time ? `• ${formatTime(event.event_time)}` : ''}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500 mb-1">{event.status || 'open'}</div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedEventId(selectedEventId === event.id ? null : event.id)}
                      className="px-2 py-1 bg-slate-800 text-white rounded-md text-sm"
                    >
                      View Responders
                    </button>
                    <button
                      onClick={() => {
                        if (onAddResponder) return onAddResponder(campaign.id);
                        // emit global event for host to catch and open modal
                        window.dispatchEvent(new CustomEvent('open-add-responder', { detail: { campaignId: campaign.id, eventId: event.id } }));
                      }}
                      className="px-2 py-1 bg-green-600 text-white rounded-md text-sm"
                    >
                      Add Responder
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
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
            {user?.is_master_admin && (
              <button
                onClick={async () => {
                  const promptText = `Enter purchased demographic row count for ${campaign.title || campaign.project_id || campaign.id}`;
                  const qtyStr = window.prompt(promptText, String(campaign.mail_quantity || ''));
                  if (!qtyStr) return;
                  const row_count = parseInt(qtyStr.replace(/,/g, ''), 10);
                  if (Number.isNaN(row_count)) { alert('Invalid number'); return; }
                  try {
                    const { data, error } = await supabase.from('job_mailing_lists').insert({ job_id: campaign.id, row_count }).select();
                    if (error) throw error;
                    // Optimistically update visible quantity
                    onUpdateCampaign(campaign.id, { mail_quantity: row_count });
                    alert('List purchase recorded');
                  } catch (err: any) {
                    console.error('Failed to record list', err);
                    alert('Failed to record list: ' + (err?.message || String(err)));
                  }
                }}
                className="ml-2 text-xs px-2 py-1 bg-slate-700/20 rounded text-slate-300 hover:bg-slate-700/30"
              >
                Record Purchased List
              </button>
            )}
          </div>
          {/* Mailhouse Paid action */}
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${campaign.prepped_status ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 text-slate-400'}`}>
              <Printer className="w-4 h-4" />
            </div>
            <span className="text-xs text-slate-400">Mailhouse</span>
            {user?.is_master_admin && (
              <button
                onClick={async () => {
                  if (!confirm('Mark Mailhouse Paid for this campaign?')) return;
                  // Persist checklist index 3 (Mailhouse Paid)
                  await persistChecklistIndex(campaign.id, 3, true);
                  alert('Mailhouse marked paid.');
                }}
                className="ml-2 text-xs px-2 py-1 bg-amber-700/10 rounded text-amber-300 hover:bg-amber-700/20"
              >
                Record Mailhouse Paid
              </button>
            )}
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
        {user?.is_master_admin && (
          <div className="flex items-center gap-2 px-2">
            <button
              onClick={async () => {
                try {
                  const qtyStr = window.prompt('Enter mailed quantity:', String(campaign.stats?.mailed ?? campaign.mail_quantity ?? 0));
                  if (!qtyStr) return;
                  const mailedQty = parseInt(qtyStr.replace(/,/g, ''), 10);
                  if (Number.isNaN(mailedQty)) { alert('Invalid number'); return; }
                  const dateStr = window.prompt('Enter mailed date (YYYY-MM-DD):', new Date().toISOString().slice(0,10));
                  if (!dateStr) return;
                  const isoDate = new Date(`${dateStr}T00:00:00Z`).toISOString();

                  // Upsert job_stats.mailed_count
                  const { error: upErr } = await supabase.from('job_stats').upsert({ job_id: campaign.id, mailed_count: mailedQty }, { onConflict: 'job_id' }).select();
                  if (upErr) throw upErr;
                  // Insert print_orders(mailed_at)
                  const { error: poErr } = await supabase.from('print_orders').insert({ job_id: campaign.id, mailed_at: isoDate }).select();
                  if (poErr) throw poErr;

                  // Mark checklist index 4 (Mail Sent) true
                  await persistChecklistIndex(campaign.id, 4, true);

                  // Update local campaign UI
                  onUpdateCampaign(campaign.id, { mail_quantity: mailedQty, paid_at: isoDate, stats: { ...(campaign.stats||{}), mailed: mailedQty, mailed_count: mailedQty } });
                  alert('Recorded mail sent and updated mailed quantity.');
                } catch (err: any) {
                  console.error('Failed to record mail sent', err);
                  alert('Failed to record mail sent: ' + (err?.message || String(err)));
                }
              }}
              className="text-xs px-2 py-1 bg-sky-700/10 rounded text-sky-300 hover:bg-sky-700/20"
            >
              Record Mail Sent
            </button>

            <button
              onClick={async () => {
                try {
                  const qtyStr = window.prompt('Enter delivered mail quantity:', String(campaign.delivered_quantity ?? campaign.stats?.delivered ?? 0));
                  if (!qtyStr) return;
                  const deliveredQty = parseInt(qtyStr.replace(/,/g, ''), 10);
                  if (Number.isNaN(deliveredQty)) { alert('Invalid number'); return; }
                  const dateStr = window.prompt('Enter delivery date (YYYY-MM-DD):', new Date().toISOString().slice(0,10));
                  if (!dateStr) return;
                  const isoDate = new Date(`${dateStr}T00:00:00Z`).toISOString();
                  const { data, error } = await supabase.from('job_stats').upsert({ job_id: campaign.id, delivered_count: deliveredQty, first_delivery_at: isoDate }, { onConflict: 'job_id' }).select();
                  if (error) throw error;
                  // Update UI
                  onUpdateCampaign(campaign.id, { delivered_quantity: deliveredQty, delivered_date: isoDate, stats: { ...(campaign.stats||{}), delivered: deliveredQty } });
                  // mark Mail Sent checklist index 4 as true as delivery implies mail sent
                  await persistChecklistIndex(campaign.id, 4, true);
                  alert('Recorded delivery.');
                } catch (err: any) {
                  console.error('Failed to record delivery', err);
                  alert('Failed to record delivery: ' + (err?.message || String(err)));
                }
              }}
              className="text-xs px-2 py-1 bg-emerald-700/10 rounded text-emerald-300 hover:bg-emerald-700/20"
            >
              Record Mail Delivery
            </button>
          </div>
        )}
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
