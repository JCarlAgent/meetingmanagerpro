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
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [showTsvImport, setShowTsvImport] = useState(false);
  const [tsvText, setTsvText] = useState('');
  const [importEventId, setImportEventId] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  // Fetch responders from Supabase for this campaign (used both on mount and after sync)
  const reloadResponders = () => {
    if (!campaign.id) return;
    supabase
      .from('responders')
      .select('id, campaign_id, event_id, first_name, last_name, email, phone, guests, response_source, confirmed, attended, notes, created_at')
      .eq('campaign_id', campaign.id)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => { setLocalResponders(data ?? []); });
  };

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

  // Mailhouse Paid is stored at checklist index 4 in jobs.notes; first_delivery_at is NOT used as paid signal
  const isPaid = Array.isArray(campaign.status) && !!campaign.status[4];

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
      const nextStatus = Array.isArray(campaign.status) ? campaign.status.slice() : [false,false,false,false,false,false];
      nextStatus[index] = !!value;
      onUpdateCampaign(campaign.id, { status: nextStatus });
      return updatedRows;
    } catch (err: any) {
      console.error('persistChecklistIndex failed', err);
      alert('Failed to save checklist: ' + (err?.message || String(err)));
      return null;
    }
  };

  // Syncs TeleDirect call-center leads into the responders table for this campaign.
  const syncTeleDirectLeads = async () => {
    // Default sync date to today in YYYY-MM-DD format (local time)
    const todayDefault = new Date().toLocaleDateString('en-CA'); // en-CA = YYYY-MM-DD
    const syncDate = window.prompt(
      'Enter sync date (YYYY-MM-DD). TeleDirect returns leads for a 24-hour window.\nLeave blank or press OK to use today:',
      todayDefault
    );
    if (syncDate === null) return;
    const resolvedDate = (syncDate.trim() || todayDefault);
    setSyncMessage(null);
    setIsSyncing(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? null;
      if (!token) {
        setSyncMessage('Not logged in.');
        return;
      }
      const resp = await fetch('/api/integrations/workthelead/sync-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jobId: campaign.id, syncDate: resolvedDate }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const errLines = [
          `Error: ${data?.error || 'Sync failed'}`,
          data?.credentialUserId ? `UserID: ${String(data.credentialUserId).slice(0, 8)}…` : '',
          data?.usernamePreview ? `Username preview: ${data.usernamePreview}` : '',
          data?.safeUrl ? `URL: ${data.safeUrl}` : '',
          data?.rawPreview ? `Raw: ${String(data.rawPreview).slice(0, 300)}` : '',
        ].filter(Boolean).join(' | ');
        setSyncMessage(errLines);
        return;
      }
      if (data.inserted === 0 && data.updated === 0) {
        // Surface all diagnostics so admin can see exactly what was sent and received
        const diag = [
          `Parsed: ${data.total ?? 0} records`,
          data.syncDate ? `Date window: ${data.syncDate} (${data.fromDate} → ${data.toDate})` : '',
          data.usernamePreview ? `Username preview: ${data.usernamePreview}` : 'NO USERNAME',
          data.safeUrl ? `URL sent: ${data.safeUrl}` : '',
          data.containerTag ? `Container tag: <${data.containerTag}>` : 'No container tag detected',
          data.fieldNames?.length ? `Fields: [${data.fieldNames.join(', ')}]` : 'No fields',
          data.message || '',
          data.rawPreview ? `Raw: ${String(data.rawPreview).slice(0, 400)}` : '',
        ].filter(Boolean).join('\n');
        setSyncMessage(`Sync returned 0 leads.\n${diag}`);
        return;
      }
      const msg = `Sync complete — inserted: ${data.inserted}, updated: ${data.updated}, skipped: ${data.skipped} (of ${data.total} parsed)`;
      setSyncMessage(msg);
      // Refresh the preview and full list immediately
      reloadResponders();
    } catch (err: any) {
      setSyncMessage(err?.message || 'Sync error');
    } finally {
      setIsSyncing(false);
    }
  };

  const formatEventOption = (ev: Event): string => {
    const parts: string[] = [];
    if (ev.event_date) {
      const d = new Date(ev.event_date + 'T00:00:00');
      parts.push(d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
    }
    if (ev.event_time) {
      const [h, m] = ev.event_time.split(':').map(Number);
      const ampm = h >= 12 ? 'PM' : 'AM';
      parts.push(`${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`);
    }
    if (ev.venue_name) parts.push(`— ${ev.venue_name}`);
    return parts.join(' ');
  };

  const importTsvLeads = async () => {
    if (!tsvText.trim()) return;
    if (!importEventId) { setImportMessage('Please select a meeting before importing.'); return; }
    setImportMessage(null);
    setIsImporting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? null;
      if (!token) { setImportMessage('Not logged in.'); return; }
      const resp = await fetch('/api/integrations/workthelead/import-tsv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jobId: campaign.id, eventId: importEventId, tsv: tsvText }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setImportMessage(`Error: ${data?.error || resp.status}`);
        return;
      }
      const msg = [
        `Import complete — inserted: ${data.inserted}, updated: ${data.updated}, skipped: ${data.skipped} (of ${data.total} attendee rows, ${data.rowsParsed} total rows parsed)`,
        ...(data.errors?.length ? [`Errors: ${data.errors.join('; ')}`] : []),
      ].join('\n');
      setImportMessage(msg);
      if (data.inserted > 0 || data.updated > 0) {
        setTsvText('');
        setImportEventId('');
        setShowTsvImport(false);
        reloadResponders();
      }
    } catch (err: any) {
      setImportMessage(err?.message || 'Import error');
    } finally {
      setIsImporting(false);
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
                            await persistChecklistIndex(campaign.id, 4, !isPaid);
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
                      {(['Demo Data Done','List Purchased','Template Selected','800# Secured','Mailhouse Paid','Mail Sent'] as const).map((label, idx) => {
                        const checked = Array.isArray(campaign.status) ? !!campaign.status[idx] : false;
                        // Indexes 1 (List Purchased) and 5 (Mail Sent) are derived — not manually togglable
                        const isManual = idx !== 1 && idx !== 5;
                        const canToggle = isManual && !!user?.is_master_admin;
                        const inner = (
                          <>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${checked ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                              {checked ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                            </div>
                            <div className="text-xs text-slate-700 text-center truncate">{label}</div>
                          </>
                        );
                        if (canToggle) {
                          return (
                            <button
                              key={label}
                              type="button"
                              title={checked ? `Unmark: ${label}` : `Mark: ${label}`}
                              onClick={() => persistChecklistIndex(campaign.id, idx, !checked)}
                              className="flex-1 flex items-center gap-2 justify-center px-3 py-2 rounded bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors"
                            >
                              {inner}
                            </button>
                          );
                        }
                        return (
                          <div key={label} className="flex-1 flex items-center gap-2 justify-center px-3 py-2 rounded bg-gray-50">
                            {inner}
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
                            <button onClick={async () => { await persistChecklistIndex(campaign.id, 4, !isPaid); }} className="px-3 py-1 bg-indigo-600 text-white rounded">{isPaid ? 'Mark Unpaid' : 'Mark Paid'}</button>
                          )}
                          {user?.is_master_admin && (
                            <button onClick={async () => { const qtyStr = window.prompt('Enter purchased list row count:', String(purchasedList || '')); if (!qtyStr) return; const row_count = parseInt(qtyStr.replace(/,/g,''),10); if (Number.isNaN(row_count)) { alert('Invalid number'); return; } const { data, error } = await supabase.from('job_mailing_lists').insert({ job_id: campaign.id, row_count }).select(); if (error) { alert('Failed: '+error.message); } else { onUpdateCampaign(campaign.id, { mail_quantity: row_count }); alert('Recorded purchased list'); } }} className="px-3 py-1 bg-sky-600 text-white rounded">Record Purchased List</button>
                          )}
                          {user?.is_master_admin && (
                            <button onClick={async () => { const qtyStr = window.prompt('Enter mailed quantity (optional):', String(mailedCount || '')); if (qtyStr===null) return; const mailedQty = qtyStr ? parseInt(qtyStr.replace(/,/g,''),10) : null; try { if (mailedQty != null && !Number.isNaN(mailedQty)) { const { error } = await supabase.from('job_stats').upsert({ job_id: campaign.id, mailed_count: mailedQty }, { onConflict: 'job_id' }).select(); if (error) throw error; onUpdateCampaign(campaign.id, { mail_quantity: campaign.mail_quantity, stats: { ...(campaign.stats||{}), mailed_count: mailedQty } }); } alert('Recorded mailed quantity'); } catch(err:any){ alert('Failed: '+(err?.message||String(err))); } }} className="px-3 py-1 bg-amber-600 text-white rounded">Record Mailed Quantity</button>
                          )}
                          {user?.is_master_admin && (
                            <button onClick={async () => {
                              // Pre-fill with current mailed date or today
                              const todayLocal = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
                              const dateStr = window.prompt('Enter date mail was sent (YYYY-MM-DD), or leave blank to clear:', todayLocal);
                              if (dateStr === null) return; // cancelled
                              const trimmed = dateStr.trim();
                              // Parse as noon UTC to avoid any timezone-day-shift
                              const iso: string | null = trimmed ? (trimmed + 'T12:00:00.000Z') : null;
                              try {
                                // Check if any print_orders row exists for this job
                                const { data: rows } = await supabase
                                  .from('print_orders')
                                  .select('id')
                                  .eq('job_id', campaign.id)
                                  .limit(1);
                                const hasExisting = rows && rows.length > 0;
                                if (hasExisting) {
                                  // Update ALL rows for this job_id so no stale duplicate wins the DESC sort
                                  const { error } = await supabase.from('print_orders').update({ mailed_at: iso }).eq('job_id', campaign.id);
                                  if (error) throw error;
                                } else if (iso) {
                                  const { error } = await supabase.from('print_orders').insert({ job_id: campaign.id, mailed_at: iso });
                                  if (error) throw error;
                                }
                                // Update local UI directly — Dashboard derives status[5] from print_orders, not jobs.notes
                                const nextStatus = Array.isArray(campaign.status) ? campaign.status.slice() : [false,false,false,false,false,false];
                                nextStatus[5] = !!iso;
                                onUpdateCampaign(campaign.id, { status: nextStatus });
                                alert(iso ? 'Mail Sent date recorded' : 'Mail Sent date cleared');
                              } catch(err:any){ alert('Failed: '+(err?.message||String(err))); }
                            }} className="px-3 py-1 bg-orange-600 text-white rounded">Record Mail Sent Date</button>
                          )}
                          {user?.is_master_admin && (
                            <button onClick={async () => { await persistChecklistIndex(campaign.id, 3, !campaign.status?.[3]); }} className="px-3 py-1 bg-sky-700 text-white rounded">{campaign.status?.[3] ? '800# Secured ✓' : 'Mark 800# Secured'}</button>
                          )}
                          {user?.is_master_admin && (
                            <button onClick={async () => { const qtyStr = window.prompt('Enter delivered quantity (optional):', String(deliveredCount || '')); if (qtyStr===null) return; const deliveredQty = qtyStr ? parseInt(qtyStr.replace(/,/g,''),10) : null; const dateStr = window.prompt('Enter delivery date (YYYY-MM-DD) optional:', ''); try { if (deliveredQty != null && !Number.isNaN(deliveredQty)) { const { error } = await supabase.from('job_stats').upsert({ job_id: campaign.id, delivered_count: deliveredQty }, { onConflict: 'job_id' }).select(); if (error) throw error; onUpdateCampaign(campaign.id, { delivered_quantity: deliveredQty, stats: { ...(campaign.stats||{}), delivered_count: deliveredQty } }); } if (dateStr) { const iso = new Date(dateStr+'T00:00:00Z').toISOString(); const { error } = await supabase.from('job_stats').upsert({ job_id: campaign.id, first_delivery_at: iso }, { onConflict: 'job_id' }).select(); if (error) throw error; } alert('Recorded delivery'); } catch(err:any){ alert('Failed: '+(err?.message||String(err))); } }} className="px-3 py-1 bg-emerald-500 text-white rounded">Record Delivery</button>
                          )}
                          {user?.is_master_admin && (
                            <button
                              onClick={syncTeleDirectLeads}
                              disabled={isSyncing}
                              className="hidden"
                            >
                              {isSyncing ? 'Syncing…' : 'Sync TeleDirect Leads (experimental)'}
                            </button>
                          )}
                          {/* ── Primary: TeleDirect export import ── */}
                          {user?.is_master_admin && (
                            <button
                              onClick={() => { setShowTsvImport(v => !v); setImportMessage(null); }}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-medium"
                            >
                              {showTsvImport ? 'Cancel Import' : 'Import TeleDirect Export'}
                            </button>
                          )}
                          {showTsvImport && (
                            <div className="w-full mt-2 space-y-2">
                              <div className="text-xs text-slate-600">
                                Use this with the downloaded TeleDirect meeting export (.xls). Open the file, copy all rows including headers, paste here, then run import.
                              </div>
                              {/* Meeting selector — required before import */}
                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Select meeting <span className="text-red-500">*</span></label>
                                <select
                                  value={importEventId}
                                  onChange={e => setImportEventId(e.target.value)}
                                  className="w-full p-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white"
                                >
                                  <option value="">— select a meeting —</option>
                                  {events.map(ev => (
                                    <option key={ev.id} value={ev.id}>{formatEventOption(ev)}</option>
                                  ))}
                                </select>
                              </div>
                              <textarea
                                value={tsvText}
                                onChange={e => setTsvText(e.target.value)}
                                className="w-full h-40 p-2 text-xs font-mono border border-slate-300 rounded resize-y focus:outline-none focus:ring-1 focus:ring-emerald-400"
                                placeholder={`TimeStamp\tAttendee/Guest\tFirstName\tLastName\tPhoneNumber\tEmail...`}
                              />
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={importTsvLeads}
                                  disabled={isImporting || !tsvText.trim() || !importEventId}
                                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded text-sm"
                                >
                                  {isImporting ? 'Importing…' : 'Run Import'}
                                </button>
                                <button
                                  onClick={() => { setShowTsvImport(false); setTsvText(''); setImportEventId(''); setImportMessage(null); }}
                                  className="px-3 py-1 bg-slate-400 hover:bg-slate-500 text-white rounded text-sm"
                                >Cancel</button>
                              </div>
                              {importMessage && (
                                <div className="p-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700 whitespace-pre-wrap">{importMessage}</div>
                              )}
                            </div>
                          )}
                          {/* ── Dev / experimental tools ── */}
                          {user?.is_master_admin && (
                            <div className="w-full mt-3 pt-3 border-t border-slate-200 flex flex-wrap items-center gap-2">
                              <span className="text-[10px] text-slate-400 uppercase tracking-wide">Dev tools</span>
                              <button
                                onClick={syncTeleDirectLeads}
                                disabled={isSyncing}
                                className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-500 border border-slate-300 rounded text-xs"
                              >
                                {isSyncing ? 'Syncing…' : 'Sync TeleDirect API (experimental)'}
                              </button>
                              <button
                                onClick={async () => {
                                  const tdCampaignId = window.prompt('Debug TeleDirect API — enter Campaign ID to probe:');
                                  if (!tdCampaignId?.trim()) return;
                                  setSyncMessage('Running diagnostics…');
                                  try {
                                    const { data: sessionData } = await supabase.auth.getSession();
                                    const token = sessionData.session?.access_token ?? null;
                                    if (!token) { setSyncMessage('Not logged in.'); return; }
                                    const resp = await fetch('/api/integrations/workthelead/debug-leads', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                      body: JSON.stringify({ campaignId: tdCampaignId.trim() }),
                                    });
                                    const data = await resp.json().catch(() => ({}));
                                    if (!resp.ok) { setSyncMessage(`Diagnostic error: ${data?.error || resp.status}`); return; }
                                    const icon = (r: any) => r.hasLeads ? '✓ LEADS' : r.isAuthError ? '✗ AUTH' : r.isDateError ? '~ DATE' : r.hasOtherError ? '? OTHER' : '? EMPTY';
                                    const lines = [
                                      `Username: ${data.usernamePreview ?? '?'}`,
                                      `WINNER: ${data.winner ?? 'none'}`,
                                      '',
                                      ...(data.results ?? []).map((r: any) =>
                                        `[${icon(r)}] ${r.label}\n  ${r.safeDesc ?? r.safeUrl}\n  HTTP ${r.httpStatus} | ${r.preview}`
                                      ),
                                    ];
                                    setSyncMessage(lines.join('\n'));
                                  } catch (err: any) { setSyncMessage(`Diagnostic exception: ${err?.message}`); }
                                }}
                                className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-500 border border-slate-300 rounded text-xs"
                              >
                                Debug TeleDirect API
                              </button>
                              {syncMessage && (
                                <div className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600 break-all whitespace-pre-wrap">{syncMessage}</div>
                              )}
                            </div>
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
