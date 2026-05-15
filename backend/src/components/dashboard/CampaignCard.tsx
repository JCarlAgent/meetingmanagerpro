import React, { useState, useMemo, useEffect } from 'react';
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
  const [showFullResponders, setShowFullResponders] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [showDelivery, setShowDelivery] = useState(false);
  const [showRoiForm, setShowRoiForm] = useState(false);
  const [mapZips, setMapZips] = useState<string[]>([]);
  const [showAllZips, setShowAllZips] = useState(false);
  const [localResponders, setLocalResponders] = useState<Responder[]>([]);

  // Load real responders for this campaign/job from Supabase (newest first, max 10 for preview)
  useEffect(() => {
    if (!campaign.id) return;
    let cancelled = false;
    supabase
      .from('responders')
      .select('id, campaign_id, event_id, first_name, last_name, email, phone, guests, response_source, confirmed, attended, notes, created_at')
      .eq('campaign_id', campaign.id)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (!cancelled) setLocalResponders(data ?? []);
      });
    return () => { cancelled = true; };
  }, [campaign.id]);

  // Prefer live-loaded responders; fall back to prop (legacy campaigns view) then stats count
  const displayResponders = localResponders.length > 0 ? localResponders : responders;
  const totalResponders = displayResponders.length || (campaign.stats?.responses_total ?? 0);
  const purchasedList = campaign.mail_quantity ?? 0; // job_mailing_lists.row_count when available (Dashboard mapping)
  const mailedCount = campaign.stats?.mailed_count ?? (campaign as any).mailed_count ?? campaign.stats?.mailed ?? 0;
  const deliveredCount = campaign.stats?.delivered_count ?? (campaign as any).delivered_quantity ?? campaign.stats?.delivered ?? 0;
  const responsesCount = displayResponders.length || (campaign.stats?.responses_total ?? 0);
  const responseRate = deliveredCount > 0 ? ((responsesCount / deliveredCount) * 100) : 0;

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
    if (!timeStr) return '';
    const parts = timeStr.split(':');
    const hour = parseInt(parts[0] ?? '0', 10);
    const minutes = parts[1] ?? '00';
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
        {/* Job Control Board — full width, no outer badge row */}
        <div className="w-full">
            <div className="bg-white rounded-xl border shadow-sm">
              <div className="flex">
                <div className={`w-12 flex flex-col items-center justify-center text-xxs font-bold tracking-wider text-white ${statusLabel === 'ACTIVE' ? 'bg-emerald-600' : statusLabel === 'PENDING' ? 'bg-amber-500' : 'bg-slate-400'}`}>
                  <div className="transform -rotate-90 w-full text-center">{statusLabel}</div>
                </div>

                <div className="flex-1 p-3 lg:p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div>
                      <div className="text-sm text-slate-500">{campaign.company || (campaign.org_name ?? '')}</div>
                      <div className="text-lg lg:text-xl font-semibold tracking-tight text-slate-900">{(campaign as any).rep_name || campaign.repName || (campaign as any).org_name || campaign.company || 'Advisor'}</div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-slate-400">Job: {campaign.project_id || campaign.title || '—'}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase border ${getStatusBgColor(statusLabel.toLowerCase())}`}>{statusLabel}</span>
                        <button
                          type="button"
                          onClick={async () => {
                            const newPaidAt = isPaid ? null : new Date().toISOString();
                            const { error } = await supabase.from('jobs').update({ paid_at: newPaidAt }).eq('id', campaign.id);
                            if (error) { alert('Failed to save: ' + error.message); return; }
                            onUpdateCampaign(campaign.id, { paid_at: newPaidAt });
                          }}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase border transition-colors hover:opacity-90 ${isPaid ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30' : 'bg-slate-100 text-slate-500 border-slate-300'}`}
                        >{isPaid ? 'Paid ✓' : 'Mark Paid'}</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="text-center">
                        <div className="text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-tight text-slate-900">{mailedCount.toLocaleString()}</div>
                        <div className="text-xs text-slate-500 mt-1">Mailed</div>
                      </div>
                      <div className="text-center">
                        <div className="text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-tight text-slate-900">{deliveredCount.toLocaleString()}</div>
                        <div className="text-xs text-slate-500 mt-1">Delivered</div>
                      </div>
                      <div className="text-center">
                        <div className="text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-tight text-slate-900">{responsesCount.toLocaleString()}</div>
                        <div className="text-xs text-slate-500 mt-1">Responses</div>
                      </div>
                      <div className="text-center">
                        <div className="text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-tight text-slate-900">{(responseRate).toFixed(2)}%</div>
                        <div className="text-xs text-slate-500 mt-1">Response Rate</div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-3">
                    {/* Responder preview */}
                    <div className="col-span-1 bg-white rounded-lg p-2 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-semibold">Responders</div>
                        <a href="#" onClick={(e) => { e.preventDefault(); setShowFullResponders(v => !v); }} className="text-xs text-slate-500 hover:underline">{showFullResponders ? 'Close full list' : 'See full list'}</a>
                      </div>
                      <div className="text-sm">
                        <div className="grid grid-cols-12 gap-2 font-semibold text-xs text-slate-500 pb-2 border-b">
                          <div className="col-span-6">Name</div>
                          <div className="col-span-4">Contact</div>
                          <div className="col-span-2 text-right">Guests</div>
                        </div>
                        <div className="divide-y mt-2">
                          {displayResponders.slice(0, 10).map((r) => (
                            <div key={r.id} className="grid grid-cols-12 gap-2 py-2 items-center text-sm">
                              <div className="col-span-6 truncate">{`${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || '—'}</div>
                              <div className="col-span-4 truncate text-xs text-slate-600">{r.phone || r.email || '—'}</div>
                              <div className="col-span-2 text-right text-xs text-slate-600">{r.guests ?? 0}</div>
                            </div>
                          ))}
                          {displayResponders.length === 0 && <div className="py-2 text-sm text-slate-500">No responders yet</div>}
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
                              <div className="text-sm text-slate-600">{ev.event_time ? formatTime(ev.event_time) : ''}</div>
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
                        <div className="flex flex-wrap items-center gap-2">
                          {user?.is_master_admin && (
                            <button onClick={async () => { const newPaid = isPaid ? null : new Date().toISOString(); const { error } = await supabase.from('jobs').update({ paid_at: newPaid }).eq('id', campaign.id); if (error) { alert('Failed: '+error.message); return; } onUpdateCampaign(campaign.id, { paid_at: newPaid }); }} className="px-3 py-1 bg-indigo-600 text-white rounded">{isPaid ? 'Mark Unpaid' : 'Mark Paid'}</button>
                          )}
                          {user?.is_master_admin && (
                            <button onClick={async () => { const qtyStr = window.prompt('Enter purchased list row count:', String(purchasedList || '')); if (!qtyStr) return; const row_count = parseInt(qtyStr.replace(/,/g,''),10); if (Number.isNaN(row_count)) { alert('Invalid number'); return; } const { data, error } = await supabase.from('job_mailing_lists').insert({ job_id: campaign.id, row_count }).select(); if (error) { alert('Failed: '+error.message); } else { onUpdateCampaign(campaign.id, { mail_quantity: row_count }); alert('Recorded purchased list'); } }} className="px-3 py-1 bg-sky-600 text-white rounded">Record Purchased List</button>
                          )}
                          {user?.is_master_admin && (
                            <button onClick={async () => { const qtyStr = window.prompt('Enter mailed quantity (optional):', String(mailedCount || '')); if (qtyStr===null) return; const mailedQty = qtyStr ? parseInt(qtyStr.replace(/,/g,''),10) : null; try { if (mailedQty != null && !Number.isNaN(mailedQty)) { const { error } = await supabase.from('job_stats').upsert({ job_id: campaign.id, mailed_count: mailedQty }, { onConflict: 'job_id' }).select(); if (error) throw error; onUpdateCampaign(campaign.id, { mail_quantity: campaign.mail_quantity, stats: { ...(campaign.stats||{}), mailed_count: mailedQty } }); } alert('Recorded mailed quantity'); } catch(err:any){ alert('Failed: '+(err?.message||String(err))); } }} className="px-3 py-1 bg-amber-600 text-white rounded">Record Mailed Quantity</button>
                          )}
                          {user?.is_master_admin && (
                            <button onClick={async () => {
                              const dateStr = window.prompt('Enter date mail was sent (YYYY-MM-DD):', new Date().toISOString().slice(0,10));
                              if (!dateStr) return;
                              const iso = new Date(dateStr + 'T12:00:00Z').toISOString();
                              try {
                                const { error } = await supabase.from('print_orders').upsert({ job_id: campaign.id, mailed_at: iso }, { onConflict: 'job_id' }).select();
                                if (error) throw error;
                                await persistChecklistIndex(campaign.id, 5, true);
                                alert('Mail Sent date recorded');
                              } catch(err:any){ alert('Failed: '+(err?.message||String(err))); }
                            }} className="px-3 py-1 bg-orange-600 text-white rounded">Record Mail Sent Date</button>
                          )}
                          {user?.is_master_admin && (
                            <button onClick={async () => { await persistChecklistIndex(campaign.id, 3, true); alert('Marked Mailhouse Paid'); }} className="px-3 py-1 bg-emerald-600 text-white rounded">Mark Mailhouse Paid</button>
                          )}
                          {user?.is_master_admin && (
                            <button onClick={async () => { const qtyStr = window.prompt('Enter delivered quantity (optional):', String(deliveredCount || '')); if (qtyStr===null) return; const deliveredQty = qtyStr ? parseInt(qtyStr.replace(/,/g,''),10) : null; const dateStr = window.prompt('Enter delivery date (YYYY-MM-DD) optional:', ''); try { if (deliveredQty != null && !Number.isNaN(deliveredQty)) { const { error } = await supabase.from('job_stats').upsert({ job_id: campaign.id, delivered_count: deliveredQty }, { onConflict: 'job_id' }).select(); if (error) throw error; onUpdateCampaign(campaign.id, { delivered_quantity: deliveredQty, stats: { ...(campaign.stats||{}), delivered_count: deliveredQty } }); } if (dateStr) { const iso = new Date(dateStr+'T00:00:00Z').toISOString(); const { error } = await supabase.from('job_stats').upsert({ job_id: campaign.id, first_delivery_at: iso }, { onConflict: 'job_id' }).select(); if (error) throw error; } alert('Recorded delivery'); } catch(err:any){ alert('Failed: '+(err?.message||String(err))); } }} className="px-3 py-1 bg-emerald-500 text-white rounded">Record Delivery</button>
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

      {/* Full responders list — toggled by 'See full list' link */}
      {showFullResponders && (
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-white">Full Responder List</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { window.print(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded-lg transition-colors"
              >
                <Printer className="w-3.5 h-3.5" /> Print Sign-In Sheet
              </button>
              <button type="button" onClick={() => setShowFullResponders(false)} className="text-xs text-slate-400 hover:text-slate-200 underline">Close</button>
            </div>
          </div>
          <ResponderList responders={displayResponders.length > 0 ? displayResponders : responders} events={events} selectedEventId={selectedEventId} onSelectEvent={setSelectedEventId} onUpdateResponder={onUpdateResponder} />
        </div>
      )}

      {/* Admin details expander (separate from responders) */}
      {isExpanded && (
        <div className="border-t border-white/10 p-4">
          {/* admin buttons already rendered inside the card above */}
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
