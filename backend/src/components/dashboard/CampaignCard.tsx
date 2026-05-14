import React, { useState, useMemo } from 'react';
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
  TrendingUp,
  XCircle
} from 'lucide-react';
import ResponderList from './ResponderList';
import DeliveryTracking from './DeliveryTracking';
import PostMeetingROIModal from './PostMeetingROIModal';
import CampaignMapPreview from './map/CampaignMapPreview';
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
  const [mapZips, setMapZips] = useState<string[]>([]);
  const [showAllZips, setShowAllZips] = useState(false);

  const totalResponders = responders.length;
  const purchasedList = campaign.mail_quantity ?? 0; // job_mailing_lists.row_count when available (Dashboard mapping)
  const mailedCount = campaign.stats?.mailed_count ?? campaign.stats?.mailed ?? 0;
  const deliveredCount = campaign.stats?.delivered_count ?? campaign.stats?.delivered ?? 0;
  const responsesCount = responders.length || (campaign.stats?.responses_total ?? 0);
  const responseRate = mailedCount > 0 ? ((responsesCount / mailedCount) * 100) : 0;

  const isPaid = Boolean(campaign.paid_at || campaign.stats?.first_delivery_at);

  const isCompleted = useMemo(() => {
    const now = new Date();
    if (!events || events.length === 0) return false;
    return events.every(e => e.event_date ? new Date(e.event_date + 'T00:00:00') < now : false);
  }, [events]);

  const statusLabel = isCompleted ? 'COMPLETED' : (isPaid ? 'ACTIVE' : 'PENDING');

  const formatDateParts = (dateStr?: string) => {
    if (!dateStr) return { month: '', day: '', weekday: '' };
    const d = new Date(dateStr + 'T00:00:00');
    return { month: d.toLocaleDateString('en-US', { month: 'short' }), day: String(d.getDate()), weekday: d.toLocaleDateString('en-US', { weekday: 'short' }) };
  };

  // Persist checklist index into jobs.notes (manual indexes: 0,2,3 per Dashboard convention)
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
      // update local UI via onUpdateCampaign status array
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

  const { user } = useAuth();


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
      <div className="p-3 lg:p-4">
        <div className="flex items-start justify-between gap-3">
          {/* Project ID & Status */}
          <div className="flex items-center gap-3">
            <div className="bg-green-600 text-white px-3 py-1.5 rounded-lg font-bold text-lg">{campaign.project_id}</div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase border ${getStatusBgColor(campaign.status)}`}>{campaign.status}</span>
            <button
              type="button"
              onClick={() => onUpdateCampaign(campaign.id, { paid_at: isPaid ? null : new Date().toISOString() })}
              className={`px-3 py-1 rounded-full text-xs font-semibold uppercase border transition-colors hover:opacity-90 ${isPaid ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-slate-500/10 text-slate-300 border-slate-500/30'}`}
              title={isPaid ? 'Click to mark unpaid' : 'Click to mark paid'}
            >{isPaid ? 'Paid' : 'Unpaid'}</button>
            <span className="text-slate-400 text-sm hidden sm:inline">{new Date(campaign.created_at).toLocaleDateString()}</span>
          </div>

          {/* Job Control Board */}
          <div className="flex-1 ml-3">
            <div className="bg-white rounded-xl border shadow-sm">
              <div className="flex">
                <div className={`w-12 flex flex-col items-center justify-center text-xxs font-bold tracking-wider text-white ${statusLabel === 'ACTIVE' ? 'bg-emerald-600' : statusLabel === 'PENDING' ? 'bg-amber-500' : 'bg-slate-400'}`}>
                  <div className="transform -rotate-90 w-full text-center">{statusLabel}</div>
                </div>

                <div className="flex-1 p-3 lg:p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm text-slate-500">{campaign.company || (campaign.org_name ?? '')}</div>
                      <div className="text-lg lg:text-xl font-semibold tracking-tight text-slate-900">{campaign.repName ? `${campaign.repName} • ${campaign.company}` : (campaign.company || 'Advisor')}</div>
                      <div className="text-xs text-slate-400 mt-1">Job: {campaign.project_id || campaign.id}</div>
                    </div>
                    <div className="flex items-end gap-6">
                      <div className="text-center">
                        <div className="text-4xl lg:text-5xl font-extrabold leading-tight text-slate-900">{mailedCount.toLocaleString()}</div>
                        <div className="text-xs text-slate-500 mt-1">Mailed</div>
                      </div>
                      <div className="text-center">
                        <div className="text-4xl lg:text-5xl font-extrabold leading-tight text-slate-900">{deliveredCount.toLocaleString()}</div>
                        <div className="text-xs text-slate-500 mt-1">Delivered</div>
                      </div>
                      <div className="text-center">
                        <div className="text-4xl lg:text-5xl font-extrabold leading-tight text-slate-900">{responsesCount.toLocaleString()}</div>
                        <div className="text-xs text-slate-500 mt-1">Responses</div>
                      </div>
                      <div className="text-center">
                        <div className="text-4xl lg:text-5xl font-extrabold leading-tight text-slate-900">{(responseRate).toFixed(2)}%</div>
                        <div className="text-xs text-slate-500 mt-1">Response Rate</div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-3">
                    {/* Responder preview */}
                    <div className="col-span-1 bg-white rounded-lg p-2 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-semibold">Responders</div>
                        <a href="#" onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'responders' } })); }} className="text-xs text-slate-500">See full list</a>
                      </div>
                      <div className="text-sm">
                        <div className="grid grid-cols-12 gap-2 font-semibold text-xs text-slate-500 pb-2 border-b">
                          <div className="col-span-6">Name</div>
                          <div className="col-span-4">Contact</div>
                          <div className="col-span-2 text-right">Guests</div>
                        </div>
                        <div className="divide-y mt-2">
                          {responders.slice(0,7).map((r) => (
                            <div key={r.id} className="grid grid-cols-12 gap-2 py-2 items-center text-sm">
                              <div className="col-span-6 truncate">{r.full_name}</div>
                              <div className="col-span-4 truncate text-xs text-slate-600">{r.phone || r.email}</div>
                              <div className="col-span-2 text-right text-xs text-slate-600">{r.guests || 0}</div>
                            </div>
                          ))}
                          {responders.length === 0 && <div className="py-2 text-sm text-slate-500">No responders yet</div>}
                        </div>
                      </div>
                    </div>

                    {/* Meetings */}
                    <div className="col-span-1 lg:col-span-1 bg-gray-50 rounded-lg p-2">
                      <div className="text-sm font-semibold mb-2">Meetings</div>
                      <div className="grid grid-cols-1 gap-2">
                        {events.slice(0,4).map((ev: any) => {
                          const parts = formatDateParts(ev.event_date);
                          const isPast = ev.event_date ? new Date(ev.event_date + 'T23:59:59') < new Date() : false;
                          return (
                            <div key={ev.id} className={`flex items-center gap-3 p-2 rounded-md ${isPast ? 'bg-gray-50 text-gray-500' : 'bg-white shadow-sm'}`}>
                              <div className={`w-20 text-center p-2 rounded ${isPast ? 'bg-gray-100' : 'bg-emerald-600 text-white'}`}>
                                <div className="text-xs uppercase">{parts.month}</div>
                                <div className="text-2xl font-extrabold leading-none">{parts.day}</div>
                                <div className="text-xs">{parts.weekday}</div>
                              </div>
                              <div className="flex-1">
                                <div className="font-medium text-sm">{ev.venue_name || 'TBD'}</div>
                                <div className="text-xs text-slate-500">{ev.venue_city ? `${ev.venue_city}${ev.venue_state ? `, ${ev.venue_state}` : ''}` : ''}</div>
                              </div>
                              <div className="text-sm text-slate-600">{ev.event_time || ''}</div>
                            </div>
                          );
                        })}
                        {events.length === 0 && <div className="text-sm text-slate-500">No meetings scheduled</div>}
                      </div>
                    </div>

                    {/* Map */}
                    <div className="col-span-1 lg:col-span-1 bg-gray-50 rounded-lg p-2">
                      <div className="text-sm font-semibold mb-2">Map</div>
                      {events[0]?.venue_name ? (
                        <div className="w-full h-[260px] md:h-[300px] overflow-hidden rounded">
                          <CampaignMapPreview venueHeadline={`${events[0].venue_name} ${events[0].venue_city || ''}`} campaignType="medicare" onZipsExtracted={setMapZips} />
                        </div>
                      ) : (
                        <div className="w-full h-[220px] flex items-center justify-center bg-white border rounded">Map pending venue coordinates.</div>
                      )}
                      {/* Compact ZIP preview */}
                      <div className="mt-2 bg-white border border-gray-200 rounded-lg p-2">
                        <div className="text-xs font-semibold text-slate-600 mb-1.5">Target ZIP Codes</div>
                        {mapZips.length === 0 ? (
                          <div className="text-xs text-slate-400 italic">Target ZIPs pending</div>
                        ) : (
                          <>
                            <div className="flex flex-wrap gap-1">
                              {(showAllZips ? mapZips : mapZips.slice(0, 10)).map((z, i) => (
                                <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">{z}</span>
                              ))}
                            </div>
                            {mapZips.length > 10 && (
                              <button
                                type="button"
                                onClick={() => setShowAllZips(v => !v)}
                                className="mt-1.5 text-[10px] text-indigo-500 hover:text-indigo-700 underline"
                              >{showAllZips ? 'Show less' : `Show all ${mapZips.length} ZIPs`}</button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Progress / checklist */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between gap-2">
                      {['Demo Data Done','List Purchased','Template Selected','800# Secured','Mailhouse Paid','Mail Sent'].map((label, idx) => {
                        const checked = Array.isArray(campaign.status) ? !!campaign.status[idx] : false;
                        return (
                          <div key={label} className="flex-1 flex items-center gap-2 justify-center px-3 py-2 rounded bg-gray-50">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${checked ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                              {checked ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                            </div>
                            <div className="text-xs text-slate-700 text-center truncate">{label}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* See details expander */}
                  <div className="mt-4 border-t pt-3">
                    <div className="flex items-center justify-between">
                      <button onClick={() => setIsExpanded(!isExpanded)} className="text-xs text-slate-400 hover:text-slate-600">{isExpanded ? 'Hide admin details' : 'See admin details'}</button>
                      <div className="text-xs text-slate-400">Updated {campaign.stats?.first_delivery_at ? new Date(campaign.stats.first_delivery_at).toLocaleDateString() : ''}</div>
                    </div>
                    {isExpanded && (
                      <div className="mt-3 space-y-3">
                        <div className="flex items-center gap-2">
                          {user?.is_master_admin && (
                            <button onClick={async () => { const newPaid = isPaid ? null : new Date().toISOString(); await onUpdateCampaign(campaign.id, { paid_at: newPaid }); alert('Paid status updated'); }} className="px-3 py-1 bg-indigo-600 text-white rounded">{isPaid ? 'Mark Unpaid' : 'Mark Paid'}</button>
                          )}
                          {user?.is_master_admin && (
                            <button onClick={async () => { const qtyStr = window.prompt('Enter purchased list row count:', String(purchasedList || '')); if (!qtyStr) return; const row_count = parseInt(qtyStr.replace(/,/g,''),10); if (Number.isNaN(row_count)) { alert('Invalid number'); return; } const { data, error } = await supabase.from('job_mailing_lists').insert({ job_id: campaign.id, row_count }).select(); if (error) { alert('Failed: '+error.message); } else { onUpdateCampaign(campaign.id, { mail_quantity: row_count }); alert('Recorded purchased list'); } }} className="px-3 py-1 bg-sky-600 text-white rounded">Record Purchased List</button>
                          )}
                          {user?.is_master_admin && (
                            <button onClick={async () => { const qtyStr = window.prompt('Enter mailed quantity (optional):', String(mailedCount || '')); if (qtyStr===null) return; const mailedQty = qtyStr ? parseInt(qtyStr.replace(/,/g,''),10) : null; const dateStr = window.prompt('Enter mailed date (YYYY-MM-DD) optional:', ''); try { if (mailedQty != null && !Number.isNaN(mailedQty)) { const { error } = await supabase.from('job_stats').upsert({ job_id: campaign.id, mailed_count: mailedQty }, { onConflict: 'job_id' }).select(); if (error) throw error; onUpdateCampaign(campaign.id, { mail_quantity: campaign.mail_quantity, stats: { ...(campaign.stats||{}), mailed_count: mailedQty } }); } if (dateStr) { const iso = new Date(dateStr+'T00:00:00Z').toISOString(); const { error: poErr } = await supabase.from('print_orders').insert({ job_id: campaign.id, mailed_at: iso }).select(); if (poErr) throw poErr; } alert('Recorded mailed quantity/date'); } catch(err:any){ alert('Failed: '+(err?.message||String(err))); } } } className="px-3 py-1 bg-amber-600 text-white rounded">Record Mailed Quantity</button>
                          )}
                          {user?.is_master_admin && (
                            <button onClick={async () => { await persistChecklistIndex(campaign.id, 3, true); alert('Marked Mailhouse Paid'); }} className="px-3 py-1 bg-emerald-600 text-white rounded">Mark Mailhouse Paid</button>
                          )}
                          {user?.is_master_admin && (
                            <button onClick={async () => { const qtyStr = window.prompt('Enter delivered quantity (optional):', String(deliveredCount || '')); if (qtyStr===null) return; const deliveredQty = qtyStr ? parseInt(qtyStr.replace(/,/g,''),10) : null; const dateStr = window.prompt('Enter delivery date (YYYY-MM-DD) optional:', ''); try { if (deliveredQty != null && !Number.isNaN(deliveredQty)) { const { error } = await supabase.from('job_stats').upsert({ job_id: campaign.id, delivered_count: deliveredQty }, { onConflict: 'job_id' }).select(); if (error) throw error; onUpdateCampaign(campaign.id, { delivered_quantity: deliveredQty, stats: { ...(campaign.stats||{}), delivered_count: deliveredQty } }); } if (dateStr) { const iso = new Date(dateStr+'T00:00:00Z').toISOString(); const { error } = await supabase.from('job_stats').upsert({ job_id: campaign.id, first_delivery_at: iso }, { onConflict: 'job_id' }).select(); if (error) throw error; } alert('Recorded delivery'); } catch(err:any){ alert('Failed: '+(err?.message||String(err))); } } } className="px-3 py-1 bg-emerald-500 text-white rounded">Record Delivery</button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded views outside the main header (kept minimal) */}
      {isExpanded && (
        <div className="border-t border-white/10 p-4">
          <ResponderList responders={responders} events={events} selectedEventId={selectedEventId} onSelectEvent={setSelectedEventId} onUpdateResponder={onUpdateResponder} />
        </div>
      )}

      {showDelivery && (
        <div className="border-t border-white/10 p-4">
          <DeliveryTracking campaign={campaign} compact={false} />
        </div>
      )}

      {showRoiForm && (
        <PostMeetingROIModal jobId={campaign.id} jobTitle={`Campaign ${campaign.project_id}`} isOpen={showRoiForm} onClose={() => setShowRoiForm(false)} onSuccess={() => setShowRoiForm(false)} />
      )}
    </div>
  );
};

export default CampaignCard;
