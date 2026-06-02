import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { formatPhoneDisplay } from '@/lib/utils';
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
  Plus,
  Package,
  Trash2,
  Truck,
  TrendingUp,
  XCircle
} from 'lucide-react';
import ResponderList from './ResponderList';
import DeliveryTracking from './DeliveryTracking';
import PostMeetingROIModal from './PostMeetingROIModal';
import VenueStaticMap from './map/VenueStaticMap';

interface CampaignCardProps {
  campaign: Campaign;
  events: Event[];
  responders: Responder[];
  onUpdateResponder: (responderId: string, updates: Partial<Responder>) => void | Promise<void>;
  onUpdateCampaign: (campaignId: string, updates: Partial<Campaign>) => void;
  // optional callback to open add responder UI; if not provided the component will emit a global event
  onAddResponder?: (campaignId: string) => void;
  // optional callback to re-fetch campaign/event data after a meeting edit
  onRefresh?: () => void;
  // optional callback to open the full campaign map view
  onOpenMap?: (campaignId: string) => void;
}

type MeetingResultRow = {
  id: string;
  job_id: string;
  meeting_id: string;
  attendees_actual: number | null;
  no_shows: number | null;
  walk_ins: number | null;
  appointments_booked: number | null;
  appointments_attended: number | null;
  products_sold_count: number | null;
  notes: string | null;
  reported_by: string | null;
  reported_at: string | null;
};

type MeetingSaleRow = {
  id: string;
  job_id: string;
  meeting_id: string;
  meeting_result_id: string | null;
  product_type: string | null;
  carrier_or_company: string | null;
  premium_or_asset_amount: number | null;
  gross_revenue: number | null;
  commission_amount: number | null;
  status: string | null;
  notes: string | null;
  created_at?: string;
};

const CampaignCard: React.FC<CampaignCardProps> = ({ 
  campaign, 
  events, 
  responders,
  onUpdateResponder,
  onUpdateCampaign,
  onRefresh,
  onOpenMap,
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

  // --- Edit Meeting state (master admin only) ---
  const [editingMeeting, setEditingMeeting] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ event_date: '', event_time: '', venue_name: '', venue_address: '', venue_city: '', venue_state: '' });
  const [isSavingMeeting, setIsSavingMeeting] = useState(false);
  const [editMeetingError, setEditMeetingError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [showTsvImport, setShowTsvImport] = useState(false);
  const [tsvText, setTsvText] = useState('');
  const [importEventId, setImportEventId] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [bulkAssignEventId, setBulkAssignEventId] = useState<string>('');
  const [isBulkAssigning, setIsBulkAssigning] = useState(false);
  const [bulkAssignMessage, setBulkAssignMessage] = useState<string | null>(null);
  const [showMailedImport, setShowMailedImport] = useState(false);
  const [mailedCsv, setMailedCsv] = useState('');
  const [mailedFileName, setMailedFileName] = useState<string | null>(null);
  const [mailedRowCount, setMailedRowCount] = useState<number | null>(null);
  const [isImportingMail, setIsImportingMail] = useState(false);
  const [mailedImportMessage, setMailedImportMessage] = useState<string | null>(null);
  const [isMatchingMail, setIsMatchingMail] = useState(false);
  const [matchMailMessage, setMatchMailMessage] = useState<string | null>(null);
  const [matchNameResults, setMatchNameResults] = useState<any[] | null>(null);
  const [matcherVersion, setMatcherVersion] = useState<string | null>(null);
  const [isDebuggingMatch, setIsDebuggingMatch] = useState(false);
  const [debugMatchOutput, setDebugMatchOutput] = useState<string | null>(null);
  const [meetingResultsByEventId, setMeetingResultsByEventId] = useState<Map<string, MeetingResultRow>>(new Map());
  const [meetingSalesByEventId, setMeetingSalesByEventId] = useState<Map<string, MeetingSaleRow[]>>(new Map());
  const [deletedMeetingSalesByEventId, setDeletedMeetingSalesByEventId] = useState<Map<string, string[]>>(new Map());
  const [savingMeetingResultEventId, setSavingMeetingResultEventId] = useState<string | null>(null);
  const [savingMeetingSalesEventId, setSavingMeetingSalesEventId] = useState<string | null>(null);

  // Fetch responders from Supabase for this campaign (used both on mount and after sync)
  const reloadResponders = () => {
    if (!campaign.id) return;
    supabase
      .from('responders')
        .select('id, campaign_id, event_id, first_name, last_name, email, phone, guests, guest_name, response_source, confirmed, attended, notes, age, income, ipa, matched_to_mail_list, match_confidence, status, created_at')
      .eq('campaign_id', campaign.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setLocalResponders(data ?? []); });
  };

  // Load real responders for this campaign/job from Supabase (newest first)
  useEffect(() => {
    if (!campaign.id) return;
    let cancelled = false;
    supabase
      .from('responders')
      .select('id, campaign_id, event_id, first_name, last_name, email, phone, guests, guest_name, response_source, confirmed, attended, notes, age, income, ipa, matched_to_mail_list, match_confidence, status, created_at')
      .eq('campaign_id', campaign.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setLocalResponders(data ?? []);
      });
    return () => { cancelled = true; };
  }, [campaign.id]);

  useEffect(() => {
    if (!isExpanded) return;

    const eventIds = (Array.isArray(events) ? events : [])
      .map((e: any) => String(e?.id || ''))
      .filter(Boolean);

    if (!eventIds.length) {
      setMeetingResultsByEventId(new Map());
      setMeetingSalesByEventId(new Map());
      setDeletedMeetingSalesByEventId(new Map());
      return;
    }

    let cancelled = false;

    Promise.all([
      supabase
        .from('meeting_results')
        .select(
          'id, job_id, meeting_id, attendees_actual, no_shows, walk_ins, appointments_booked, appointments_attended, products_sold_count, notes, reported_by, reported_at'
        )
        .eq('job_id', campaign.id)
        .in('meeting_id', eventIds),
      supabase
        .from('meeting_sales')
        .select(
          'id, job_id, meeting_id, meeting_result_id, product_type, carrier_or_company, premium_or_asset_amount, gross_revenue, commission_amount, status, notes, created_at'
        )
        .eq('job_id', campaign.id)
        .in('meeting_id', eventIds)
        .order('created_at', { ascending: true }),
    ]).then(([resultsResp, salesResp]) => {
      if (cancelled) return;

      if (!resultsResp.error) {
        const nextResults = new Map<string, MeetingResultRow>();
        for (const row of (resultsResp.data ?? []) as any[]) {
          const eventId = String(row.meeting_id || '');
          if (!eventId) continue;
          nextResults.set(eventId, {
            id: String(row.id),
            job_id: String(row.job_id),
            meeting_id: eventId,
            attendees_actual: row.attendees_actual === null ? null : Number(row.attendees_actual),
            no_shows: row.no_shows === null ? null : Number(row.no_shows),
            walk_ins: row.walk_ins === null ? null : Number(row.walk_ins),
            appointments_booked: row.appointments_booked === null ? null : Number(row.appointments_booked),
            appointments_attended: row.appointments_attended === null ? null : Number(row.appointments_attended),
            products_sold_count: row.products_sold_count === null ? null : Number(row.products_sold_count),
            notes: row.notes ?? null,
            reported_by: row.reported_by ?? null,
            reported_at: row.reported_at ?? null,
          });
        }
        setMeetingResultsByEventId(nextResults);
      } else {
        setMeetingResultsByEventId(new Map());
      }

      if (!salesResp.error) {
        const nextSales = new Map<string, MeetingSaleRow[]>();
        for (const row of (salesResp.data ?? []) as any[]) {
          const eventId = String(row.meeting_id || '');
          if (!eventId) continue;
          const list = nextSales.get(eventId) || [];
          list.push({
            id: String(row.id),
            job_id: String(row.job_id),
            meeting_id: eventId,
            meeting_result_id: row.meeting_result_id ?? null,
            product_type: row.product_type ?? null,
            carrier_or_company: row.carrier_or_company ?? null,
            premium_or_asset_amount: row.premium_or_asset_amount === null ? null : Number(row.premium_or_asset_amount),
            gross_revenue: row.gross_revenue === null ? null : Number(row.gross_revenue),
            commission_amount: row.commission_amount === null ? null : Number(row.commission_amount),
            status: row.status ?? null,
            notes: row.notes ?? null,
            created_at: row.created_at ?? undefined,
          });
          nextSales.set(eventId, list);
        }
        setMeetingSalesByEventId(nextSales);
        setDeletedMeetingSalesByEventId(new Map());
      } else {
        setMeetingSalesByEventId(new Map());
        setDeletedMeetingSalesByEventId(new Map());
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isExpanded, campaign.id, events]);

  // Prefer live-loaded responders; fall back to prop (legacy campaigns view) then stats count
  const displayResponders = localResponders.length > 0 ? localResponders : responders;
  const totalResponders = displayResponders.length || (campaign.stats?.responses_total ?? 0);
  const purchasedList = campaign.mail_quantity ?? 0; // job_mailing_lists.row_count when available (Dashboard mapping)
  const mailedCount = campaign.stats?.mailed_count ?? (campaign as any).mailed_count ?? campaign.stats?.mailed ?? 0;
  const deliveredCount = campaign.stats?.delivered_count ?? (campaign as any).delivered_quantity ?? campaign.stats?.delivered ?? 0;
  // Attendees = sum of (1 primary + guests) across NON-cancelled responders (registered + waitlist).
  // Matches the same formula used in ResponderList totalSignupsCount.
  const nonCancelledResponders = displayResponders.filter(
    r => (r.status || 'registered').trim().toLowerCase() !== 'cancelled'
  );
  const attendeesCount = nonCancelledResponders.reduce((sum, r) => sum + 1 + (r.guests ?? 0), 0) || (campaign.stats?.responses_total ?? 0);
  const responseRate = deliveredCount > 0 ? ((attendeesCount / deliveredCount) * 100) : 0;

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
    if (replaceExisting && !window.confirm(
      'REPLACE MODE: This will DELETE all existing responders for this meeting before importing.\n\nManually set attendance flags and advisor notes will be lost.\n\nContinue?'
    )) return;
    setImportMessage('Importing…');
    setIsImporting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? null;
      if (!token) { setImportMessage('Not logged in.'); return; }
      const resp = await fetch('/api/integrations/workthelead/import-tsv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          jobId: campaign.id,
          eventId: importEventId,
          tsv: tsvText,
          replaceExisting,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setImportMessage(`[FAIL] ${data?.error || resp.status}`);
        return;
      }
      // Build rich diagnostics message
      const lines = [
        `✓ Import complete${data.replaceMode ? ' (REPLACE mode)' : ''}`,
        `  Rows in paste:   ${data.rowsParsed ?? '?'} total  (${data.aRows ?? '?'} attendee A-rows, ${data.gRows ?? '?'} guest G-rows${data.unknownRows ? `, ${data.unknownRows} unknown` : ''})`,
        `  Attendees found: ${data.total ?? '?'}`,
        `  Inserted:        ${data.inserted ?? 0}`,
        `  Updated:         ${data.updated ?? 0}`,
        `  Skipped:         ${data.skipped ?? 0}`,
        ...(data.skippedReasons?.length ? [`  Skip reasons:    ${data.skippedReasons.join(' | ')}`] : []),
        ...(data.errors?.length ? [`  Errors:          ${data.errors.join(' | ')}`] : []),
      ];
      setImportMessage(lines.join('\n'));
      if (data.inserted > 0 || data.updated > 0) {
        reloadResponders();
        // Auto-run purchased-list match in the background after every TeleDirect import
        silentMatchResponders();
        // Only auto-close if no skips/errors to review
        if (!data.skipped && !data.errors?.length) {
          setTsvText('');
          setImportEventId('');
          setShowTsvImport(false);
          setReplaceExisting(false);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setImportMessage(`[FAIL] ${msg}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleDeleteResponder = async (responderId: string) => {
    const { error } = await supabase.from('responders').delete().eq('id', responderId);
    if (error) { alert('Delete failed: ' + error.message); return; }
    reloadResponders();
  };

  const bulkAssignUnassigned = async () => {
    if (!bulkAssignEventId) { setBulkAssignMessage('Select a meeting first.'); return; }
    setIsBulkAssigning(true);
    setBulkAssignMessage(null);
    try {
      const { data: unassigned, error: selErr } = await supabase
        .from('responders').select('id')
        .eq('campaign_id', campaign.id).is('event_id', null);
      if (selErr) throw selErr;
      if (!unassigned?.length) { setBulkAssignMessage('No unassigned responders found.'); return; }
      const { error: updErr } = await supabase
        .from('responders').update({ event_id: bulkAssignEventId })
        .eq('campaign_id', campaign.id).is('event_id', null);
      if (updErr) throw updErr;
      setBulkAssignMessage(`Assigned ${unassigned.length} responder${unassigned.length !== 1 ? 's' : ''} to selected meeting.`);
      setBulkAssignEventId('');
      reloadResponders();
    } catch (err: any) {
      setBulkAssignMessage('Error: ' + (err?.message || String(err)));
    } finally {
      setIsBulkAssigning(false);
    }
  };

  const { user } = useAuth();

  const openEditMeeting = (ev: any) => {
    setEditingMeeting(ev);
    setEditForm({
      event_date: ev.event_date ?? '',
      event_time: ev.event_time ?? '',
      venue_name: ev.venue_name ?? '',
      venue_address: ev.venue_address ?? '',
      venue_city: ev.venue_city ?? '',
      venue_state: ev.venue_state ?? '',
    });
    setEditMeetingError(null);
  };

  const saveMeetingEdit = async () => {
    if (!editingMeeting) return;
    setIsSavingMeeting(true);
    setEditMeetingError(null);
    try {
      // Always write starts_at — use form date if set, fall back to existing meeting date.
      const dateVal = editForm.event_date || editingMeeting.event_date || '';
      const timeVal = (editForm.event_time || '00:00').substring(0, 5);
      // UTC-literal storage: append Z so no browser timezone offset is applied.
      const startsAt = dateVal ? `${dateVal}T${timeVal}:00Z` : undefined;
      const updates: Record<string, string | undefined> = {
        location_name: editForm.venue_name,
        address1: editForm.venue_address,
        city: editForm.venue_city,
        state: editForm.venue_state,
        ...(startsAt ? { starts_at: startsAt } : {}),
      };
      const { error } = await supabase.from('job_meetings').update(updates).eq('id', editingMeeting.id);
      if (error) throw error;
      setEditingMeeting(null);
      onRefresh?.();
    } catch (err) {
      setEditMeetingError((err as any)?.message ?? String(err));
    } finally {
      setIsSavingMeeting(false);
    }
  };

  const handleMailedFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMailedImportMessage(null);
    setMailedFileName(file.name);
    setMailedRowCount(null);
    setMailedCsv('');
    // Reset input so re-selecting same file still fires onChange
    e.target.value = '';
    setMailedImportMessage(`[1/6] Reading file: ${file.name} (${(file.size / 1024).toFixed(1)} KB, type: "${file.type || 'unknown'}")…`);
    file.text()
      .then(text => {
        const rows = text.split('\n').filter(l => l.trim().length > 0).length;
        setMailedCsv(text);
        setMailedRowCount(rows);
        const preview = text.slice(0, 200).replace(/\n/g, '↵');
        setMailedImportMessage(`[2/6] File read OK — ${rows.toLocaleString()} rows. Preview: "${preview}…"`);
      })
      .catch(err => {
        setMailedImportMessage(`[FAIL] File read failed: ${err?.message ?? String(err)}`);
        setMailedFileName(null);
      });
  };

  // Rows per HTTP request. Keeps each JSON payload ~40–60 KB — far under any Vercel limit.
  const MAIL_CHUNK_SIZE = 200;

  const importMailedList = async (testLimit?: number) => {
    // ── 1. Slice lines client-side ──────────────────────────────────────────
    const allLines = mailedCsv
      .split('\n')
      .map(l => l.replace(/\r$/, ''))
      .filter(l => l.trim().length > 0);

    if (!allLines.length) {
      setMailedImportMessage(
        mailedFileName
          ? '[WAIT] File is still loading — please wait a moment then try again.'
          : '[FAIL] No file selected and no text pasted. Select a file first.'
      );
      return;
    }

    // Detect and strip header row.
    // Parse ALL fields of the first line and check for presence of
    // firstname+lastname+zip tokens regardless of column order.
    const firstLineFields = (allLines[0] ?? '').split(',').map(f => f.toLowerCase().replace(/[^a-z0-9_]/g, ''));
    const hasFirstToken = firstLineFields.some(f => f === 'firstname' || f === 'first_name');
    const hasLastToken  = firstLineFields.some(f => f === 'lastname'  || f === 'last_name');
    const hasZipToken   = firstLineFields.some(f => f === 'zip' || f === 'zip5');
    let headerRow: string | undefined;
    let dataLines = allLines;
    if (hasFirstToken && hasLastToken && hasZipToken) {
      headerRow = allLines[0];
      dataLines = allLines.slice(1);
    }

    const isTestRun = !!testLimit;
    // Client-side slice: test mode sends ONLY the first N rows, not the full file
    const linesToSend = isTestRun ? dataLines.slice(0, testLimit) : dataLines;

    // Build chunks — each chunk is MAIL_CHUNK_SIZE rows
    const chunks: string[][] = [];
    for (let i = 0; i < linesToSend.length; i += MAIL_CHUNK_SIZE) {
      chunks.push(linesToSend.slice(i, i + MAIL_CHUNK_SIZE));
    }

    const totalKB = (new Blob([linesToSend.join('\n')]).size / 1024).toFixed(1);
    const chunkKBEst = (new Blob([chunks[0]?.join('\n') ?? '']).size / 1024).toFixed(1);

    setIsImportingMail(true);
    setMailedImportMessage(
      isTestRun
        ? `[auth] Getting token… (test: ${linesToSend.length} rows / ${totalKB} KB in 1 chunk${headerRow ? ' — header-based' : ' — position-based'})`
        : `[auth] Getting token… (${linesToSend.length.toLocaleString()} rows / ${totalKB} KB → ${chunks.length} chunks of ${MAIL_CHUNK_SIZE} rows / ~${chunkKBEst} KB each${headerRow ? ' — header-based' : ' — position-based'})`
    );

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) {
        setMailedImportMessage('[FAIL] Not authenticated — please refresh and log in again.');
        setIsImportingMail(false);
        return;
      }

      // ── 2. Send chunks sequentially ────────────────────────────────────────
      let totalInserted = 0;
      let totalSkipped = 0;
      let sampleRow: Record<string, unknown> | null = null;
      const allErrors: string[] = [];

      for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci];
        const chunkCsv = chunk.join('\n');
        const ckKB = (new Blob([chunkCsv]).size / 1024).toFixed(1);

        setMailedImportMessage(
          isTestRun
            ? `Sending test chunk: ${chunk.length} rows / ${ckKB} KB…`
            : `Importing chunk ${ci + 1} of ${chunks.length} — ${chunk.length} rows / ${ckKB} KB…`
        );

        const res = await fetch('/api/integrations/workthelead/import-mailed-list', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            jobId:       campaign.id,
            csv:         chunkCsv,
            chunkIndex:  ci,
            totalChunks: chunks.length,
            isTestRun,
            ...(headerRow ? { headerRow } : {}),
          }),
        });

        const rawText = await res.text();
        const contentType = res.headers.get('content-type') ?? '(none)';

        if (!res.ok) {
          let errMsg = `HTTP ${res.status} on chunk ${ci + 1} of ${chunks.length}`;
          try {
            const j = JSON.parse(rawText);
            const stepLabel = j.step ? ` (step: ${j.step})` : '';
            const stackLine = j.stackFirstLine ? `\nStack: ${j.stackFirstLine}` : '';
            errMsg += `${stepLabel}: ${j.error ?? rawText.slice(0, 300)}${stackLine}`;
          } catch {
            errMsg += ` — (${contentType}): ${rawText.slice(0, 500)}`;
          }
          setMailedImportMessage(`[FAIL] ${errMsg}`);
          setIsImportingMail(false);
          return;
        }

        let json: Record<string, unknown>;
        try {
          json = JSON.parse(rawText);
        } catch {
          setMailedImportMessage(`[FAIL] Chunk ${ci + 1} response not valid JSON (${contentType}): ${rawText.slice(0, 200)}`);
          setIsImportingMail(false);
          return;
        }

        totalInserted += (json.inserted as number) ?? 0;
        totalSkipped  += (json.skipped as number) ?? 0;
        if (!sampleRow && json.sampleRow) sampleRow = json.sampleRow as Record<string, unknown>;
        if (Array.isArray(json.errors)) allErrors.push(...(json.errors as string[]));
      }

      // ── 3. Done ────────────────────────────────────────────────────────────
      const sampleNote = sampleRow
        ? ` Sample: ${sampleRow.first_name} ${sampleRow.last_name}, ${sampleRow.zip}`
        : '';
      const errNote  = allErrors.length ? ` (${allErrors.length} parse errors)` : '';
      const testNote = isTestRun ? ` [TEST RUN — first ${linesToSend.length} rows only, data NOT cleared]` : '';

      setMailedImportMessage(
        `✓ Imported ${totalInserted.toLocaleString()} purchased list records ` +
        `(${totalSkipped} skipped, ${linesToSend.length.toLocaleString()} rows in ${chunks.length} chunk${chunks.length !== 1 ? 's' : ''})` +
        `${testNote}${errNote}.${sampleNote}` +
        (isTestRun ? '' : ` Now click "Match Responders to Purchased List" to enrich responders with age / income / IPA.`)
      );

      if (!isTestRun) {
        setMailedCsv('');
        setMailedFileName(null);
        setMailedRowCount(null);
        setShowMailedImport(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Load failed')) {
        setMailedImportMessage(`[FAIL] Network error — request never reached server. (${msg})`);
      } else {
        setMailedImportMessage(`[FAIL] Unexpected error: ${msg}`);
      }
    } finally {
      setIsImportingMail(false);
    }
  };

  const runMatchResponders = async () => {
    setIsMatchingMail(true);
    setMatchMailMessage(null);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const res = await fetch('/api/integrations/workthelead/match-responders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jobId: campaign.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Match failed');
      const parts: string[] = [
        `✓ Match complete — ${json.matched} exact, ${json.fuzzyMatched} fuzzy, ${json.unmatched} unmatched (${json.total} total).`,
      ];
      if (json.writeFailCount > 0) {
        parts.push(`⚠ ${json.writeFailCount} write(s) failed.`);
      }
      if (json.errors?.length) {
        parts.push(`Errors: ${(json.errors as string[]).join(' | ')}`);
      }
      setMatchMailMessage(parts.join(' '));
      if (json.nameResults?.length) setMatchNameResults(json.nameResults);
      if (json.matcherVersion) setMatcherVersion(json.matcherVersion);
      reloadResponders();
    } catch (err: any) {
      setMatchMailMessage('Error: ' + (err?.message ?? String(err)));
    } finally {
      setIsMatchingMail(false);
    }
  };

  // Debug purchased-list matching for Nelson, Lee, Hart, French — read-only, no writes.
  const runDebugMatches = async () => {
    setIsDebuggingMatch(true);
    setDebugMatchOutput(null);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const res = await fetch('/api/integrations/workthelead/match-responders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jobId: campaign.id, debugNames: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDebugMatchOutput('ERROR: ' + (json.error ?? res.status));
        return;
      }
      setDebugMatchOutput(JSON.stringify(json, null, 2));
    } catch (err: any) {
      setDebugMatchOutput('ERROR: ' + (err?.message ?? String(err)));
    } finally {
      setIsDebuggingMatch(false);
    }
  };

  // Silent full-campaign match — no spinner, updates matchMailMessage on completion.
  // Used after TeleDirect import and other auto-triggers.
  const silentMatchResponders = async () => {
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const res = await fetch('/api/integrations/workthelead/match-responders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jobId: campaign.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return; // silent fail — purchased list may not be uploaded yet
      setMatchMailMessage(
        `✓ Auto-matched — ${json.matched} exact, ${json.fuzzyMatched} fuzzy, ${json.unmatched} unmatched (${json.total} total).`
      );
      reloadResponders();
    } catch {
      // silent
    }
  };

  // Single-responder rematch — called after manual edit touches name/address/zip.
  const matchSingleResponder = async (responderId: string) => {
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      await fetch('/api/integrations/workthelead/match-responders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jobId: campaign.id, responderId }),
      });
      reloadResponders();
    } catch {
      // silent
    }
  };

  // Wrapped onUpdateResponder: triggers single-responder rematch only when
  // matching fields (first_name, last_name, zip, address) actually changed value.
  // Uses await so errors thrown by the parent handler propagate to the modal's catch.
  const handleRespUpdateWithRematch = async (responderId: string, updates: Partial<Responder>) => {
    // Capture current values BEFORE the await so we can diff them.
    const before = localResponders.find(r => r.id === responderId);
    await onUpdateResponder(responderId, updates);
    // Merge the updates (which now come from the real DB row) into local state.
    setLocalResponders(prev => prev.map(r => r.id === responderId ? { ...r, ...updates } : r));
    // Only rematch if a matching-relevant field actually changed in value.
    // Checking presence in the payload alone is wrong — saveEdit always sends
    // first_name/last_name even when unchanged, which used to cause matchSingleResponder
    // to fire on every save and reloadResponders() to overwrite the optimistic update.
    const matchingFields: (keyof Responder)[] = ['first_name', 'last_name', 'zip', 'address'];
    const actuallyChanged = before && matchingFields.some(
      f => f in updates && updates[f as keyof Responder] !== before[f as keyof Responder]
    );
    if (actuallyChanged) {
      // Delay to allow parent DB write to complete before re-querying
      setTimeout(() => matchSingleResponder(responderId), 700);
    }
  };

  // Validate first row only — no DB write — surfaces column mapping issues quickly
  const runValidateFirstRow = async () => {
    if (!mailedCsv.trim()) {
      setMailedImportMessage('[FAIL] No CSV loaded. Select a file first.');
      return;
    }
    setMailedImportMessage('Validating first row…');
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      // Detect and separate header row from first data row.
      // Scan ALL fields of the first line for firstname+lastname+zip tokens
      // regardless of column order (full_name may appear before firstname).
      const allCsvLines = mailedCsv.split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.trim());
      const firstLineFieldsV = (allCsvLines[0] ?? '').split(',').map(f => f.toLowerCase().replace(/[^a-z0-9_]/g, ''));
      const hasFirstV = firstLineFieldsV.some(f => f === 'firstname' || f === 'first_name');
      const hasLastV  = firstLineFieldsV.some(f => f === 'lastname'  || f === 'last_name');
      const hasZipV   = firstLineFieldsV.some(f => f === 'zip' || f === 'zip5');
      let headerRowV: string | undefined;
      let firstDataLine: string;
      if (hasFirstV && hasLastV && hasZipV) {
        headerRowV = allCsvLines[0];
        firstDataLine = allCsvLines[1] ?? allCsvLines[0];
      } else {
        firstDataLine = allCsvLines[0] ?? '';
      }
      const res = await fetch('/api/integrations/workthelead/import-mailed-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          jobId: campaign.id,
          csv: firstDataLine,
          chunkIndex: 0,
          totalChunks: 1,
          validateOnly: true,
          ...(headerRowV ? { headerRow: headerRowV } : {}),
        }),
      });
      const rawText = await res.text();
      let j: Record<string, unknown>;
      try { j = JSON.parse(rawText); } catch { setMailedImportMessage(`[FAIL] Response not JSON: ${rawText.slice(0, 400)}`); return; }
      if (!res.ok) {
        setMailedImportMessage(`[FAIL] step=${j.step} — ${j.error}\n${j.hint ?? ''}`);
        return;
      }
      const mapped = j.firstRowMapped as Record<string, unknown> | null;
      const dbg    = j.headerDebug   as Record<string, unknown> | null;
      const abd    = j.ageBandDiag   as Record<string, unknown> | null;
      const lines = [
        `✓ Validate OK — ${j.rawFieldCount} columns in raw CSV (${j.importMode ?? 'position-based'}).`,
        `Mapped: first_name=${mapped?.first_name ?? '(empty)'}, last_name=${mapped?.last_name ?? '(empty)'}, zip=${mapped?.zip ?? '(empty)'}`,
        `age_band=${mapped?.age_band ?? '(empty)'}, claritas_ipa=${mapped?.claritas_ipa ?? '(empty)'}, est_income_range=${mapped?.est_income_range ?? '(empty)'}`,
        `gender_code=${mapped?.gender_code ?? '(empty)'}, homeowner=${mapped?.homeowner_flag1 ?? '(empty)'}, full_name=${mapped?.full_name ?? '(empty)'}`,
        abd ? `age_band diag: headerPos=${abd.headerPos ?? '?'}, rawValue='${abd.rawValue ?? ''}', mapped='${abd.mapped ?? ''}'${abd.note ? ` (${abd.note})` : ''}` : '',
        dbg?.reason ? `⚠ Header detection: ${dbg.reason}` : `Header detect: autoDetected=${dbg?.autoDetected ?? false}`,
        `Raw first line: ${(j.rawFirstLine as string ?? '').slice(0, 200)}`,
      ].filter(Boolean);
      setMailedImportMessage(lines.join('\n'));
    } catch (err: unknown) {
      setMailedImportMessage(`[FAIL] ${err instanceof Error ? err.message : String(err)}`);
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
    if (!timeStr) return '';
    const parts = timeStr.split(':');
    const hour = parseInt(parts[0] ?? '0', 10);
    const minutes = parts[1] ?? '00';
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const formatNumberInput = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '';
    return String(value);
  };

  const parseInteger = (value: string): number | null => {
    const cleaned = value.trim();
    if (!cleaned) return null;
    const parsed = Number.parseInt(cleaned.replace(/[^0-9-]/g, ''), 10);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const parseDecimal = (value: string): number | null => {
    const cleaned = value.trim();
    if (!cleaned) return null;
    const parsed = Number(cleaned.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  };

  const toEventTimestamp = (ev: any): number | null => {
    const date = String(ev?.event_date || '').trim();
    if (!date) return null;
    const rawTime = String(ev?.event_time || '00:00').trim();
    const hhmm = rawTime.slice(0, 5) || '00:00';
    const ts = Date.parse(`${date}T${hhmm}:00`);
    if (!Number.isNaN(ts)) return ts;
    const dateOnly = Date.parse(`${date}T00:00:00`);
    return Number.isNaN(dateOnly) ? null : dateOnly;
  };

  const isPastEvent = (ev: any): boolean => {
    const ts = toEventTimestamp(ev);
    return ts !== null && ts < Date.now();
  };

  const isTempSaleId = (id: string) => id.startsWith('tmp-');

  const patchMeetingResult = (eventId: string, patch: Partial<MeetingResultRow>) => {
    setMeetingResultsByEventId((prev) => {
      const next = new Map(prev);
      const existing = next.get(eventId) || {
        id: '',
        job_id: campaign.id,
        meeting_id: eventId,
        attendees_actual: null,
        no_shows: null,
        walk_ins: null,
        appointments_booked: null,
        appointments_attended: null,
        products_sold_count: null,
        notes: null,
        reported_by: null,
        reported_at: null,
      };
      next.set(eventId, { ...existing, ...patch, job_id: campaign.id, meeting_id: eventId });
      return next;
    });
  };

  const patchMeetingSale = (eventId: string, saleId: string, patch: Partial<MeetingSaleRow>) => {
    setMeetingSalesByEventId((prev) => {
      const next = new Map(prev);
      const list = [...(next.get(eventId) || [])];
      const idx = list.findIndex((sale) => sale.id === saleId);
      if (idx === -1) return prev;
      list[idx] = { ...list[idx], ...patch, meeting_id: eventId, job_id: campaign.id };
      next.set(eventId, list);
      return next;
    });
  };

  const addMeetingSale = (eventId: string) => {
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setMeetingSalesByEventId((prev) => {
      const next = new Map(prev);
      const list = [...(next.get(eventId) || [])];
      list.push({
        id: tempId,
        job_id: campaign.id,
        meeting_id: eventId,
        meeting_result_id: meetingResultsByEventId.get(eventId)?.id || null,
        product_type: null,
        carrier_or_company: null,
        premium_or_asset_amount: null,
        gross_revenue: null,
        commission_amount: null,
        status: null,
        notes: null,
      });
      next.set(eventId, list);
      return next;
    });
  };

  const removeMeetingSale = (eventId: string, saleId: string) => {
    setMeetingSalesByEventId((prev) => {
      const next = new Map(prev);
      const list = next.get(eventId) || [];
      next.set(eventId, list.filter((sale) => sale.id !== saleId));
      return next;
    });

    if (!isTempSaleId(saleId)) {
      setDeletedMeetingSalesByEventId((prev) => {
        const next = new Map(prev);
        const ids = next.get(eventId) || [];
        next.set(eventId, [...ids, saleId]);
        return next;
      });
    }
  };

  const saveMeetingResult = async (ev: any) => {
    const eventId = String(ev?.id || '');
    if (!eventId) {
      alert('Cannot save meeting results: meeting_id is missing.');
      return;
    }
    if (!campaign?.id) {
      alert('Cannot save meeting results: job_id is missing.');
      return;
    }

    const hasMatchingMeeting = (events || []).some((e: any) => String(e?.id || '') === eventId);
    if (!hasMatchingMeeting) {
      alert(`Cannot save meeting results: meeting_id ${eventId} is not a known job_meetings.id for this campaign.`);
      return;
    }

    try {
      setSavingMeetingResultEventId(eventId);
      const row = meetingResultsByEventId.get(eventId) || {
        id: '',
        job_id: campaign.id,
        meeting_id: eventId,
        attendees_actual: null,
        no_shows: null,
        walk_ins: null,
        appointments_booked: null,
        appointments_attended: null,
        products_sold_count: null,
        notes: null,
        reported_by: null,
        reported_at: null,
      };

      const payload = {
        job_id: campaign.id,
        meeting_id: eventId,
        attendees_actual: row.attendees_actual,
        no_shows: row.no_shows,
        walk_ins: row.walk_ins,
        appointments_booked: row.appointments_booked,
        appointments_attended: row.appointments_attended,
        products_sold_count: row.products_sold_count,
        notes: row.notes,
        reported_by: user?.id ?? null,
        reported_at: new Date().toISOString(),
      };

      console.info('[meeting_results] upsert payload', payload);

      const { data, error } = await supabase
        .from('meeting_results')
        .upsert(payload as any, { onConflict: 'job_id,meeting_id' })
        .select(
          'id, job_id, meeting_id, attendees_actual, no_shows, walk_ins, appointments_booked, appointments_attended, products_sold_count, notes, reported_by, reported_at'
        )
        .single();
      if (error) {
        console.error('[meeting_results] upsert failed', {
          code: (error as any)?.code,
          message: (error as any)?.message,
          details: (error as any)?.details,
          hint: (error as any)?.hint,
          payload,
          onConflict: 'job_id,meeting_id',
        });
        throw error;
      }

      const saved = data as any;
      const savedResultId = String(saved.id);

      setMeetingResultsByEventId((prev) => {
        const next = new Map(prev);
        next.set(eventId, {
          id: savedResultId,
          job_id: String(saved.job_id),
          meeting_id: String(saved.meeting_id),
          attendees_actual: saved.attendees_actual === null ? null : Number(saved.attendees_actual),
          no_shows: saved.no_shows === null ? null : Number(saved.no_shows),
          walk_ins: saved.walk_ins === null ? null : Number(saved.walk_ins),
          appointments_booked: saved.appointments_booked === null ? null : Number(saved.appointments_booked),
          appointments_attended: saved.appointments_attended === null ? null : Number(saved.appointments_attended),
          products_sold_count: saved.products_sold_count === null ? null : Number(saved.products_sold_count),
          notes: saved.notes ?? null,
          reported_by: saved.reported_by ?? null,
          reported_at: saved.reported_at ?? null,
        });
        return next;
      });

      setMeetingSalesByEventId((prev) => {
        const next = new Map(prev);
        const list = [...(next.get(eventId) || [])].map((sale) => ({ ...sale, meeting_result_id: savedResultId }));
        next.set(eventId, list);
        return next;
      });

      console.info('[meeting_results] upsert success', {
        id: savedResultId,
        job_id: saved.job_id,
        meeting_id: saved.meeting_id,
      });
    } catch (err) {
      const e: any = err;
      const code = e?.code ? ` (${e.code})` : '';
      const msg = e?.message || String(err);
      const details = e?.details ? `\nDetails: ${e.details}` : '';
      const hint = e?.hint ? `\nHint: ${e.hint}` : '';

      console.error('saveMeetingResult failed', {
        code: e?.code,
        message: e?.message,
        details: e?.details,
        hint: e?.hint,
      });

      let extra = '';
      if (e?.code === '42P10') {
        extra = '\n\nMissing unique constraint/index for ON CONFLICT (job_id,meeting_id).';
      } else if (e?.code === '42501') {
        extra = '\n\nRLS denied this operation for current user.';
      } else if (e?.code === '23503') {
        extra = '\n\nmeeting_id must reference an existing public.job_meetings.id.';
      }

      alert(`Failed to save meeting results${code}: ${msg}${details}${hint}${extra}`);
    } finally {
      setSavingMeetingResultEventId(null);
    }
  };

  const saveMeetingSales = async (ev: any) => {
    const eventId = String(ev?.id || '');
    if (!eventId) return;

    try {
      setSavingMeetingSalesEventId(eventId);
      const meetingResultId = meetingResultsByEventId.get(eventId)?.id || null;
      const rows = meetingSalesByEventId.get(eventId) || [];
      const deletedIds = deletedMeetingSalesByEventId.get(eventId) || [];

      if (deletedIds.length) {
        const { error: deleteErr } = await supabase.from('meeting_sales').delete().in('id', deletedIds);
        if (deleteErr) throw deleteErr;
      }

      for (const row of rows.filter((sale) => !isTempSaleId(sale.id))) {
        const { error: updateErr } = await supabase
          .from('meeting_sales')
          .update({
            meeting_result_id: meetingResultId,
            product_type: row.product_type,
            carrier_or_company: row.carrier_or_company,
            premium_or_asset_amount: row.premium_or_asset_amount,
            gross_revenue: row.gross_revenue,
            commission_amount: row.commission_amount,
            status: row.status,
            notes: row.notes,
          } as any)
          .eq('id', row.id);
        if (updateErr) throw updateErr;
      }

      const insertRows = rows
        .filter((sale) => isTempSaleId(sale.id))
        .filter((sale) => {
          return Boolean(
            (sale.product_type && sale.product_type.trim()) ||
              (sale.carrier_or_company && sale.carrier_or_company.trim()) ||
              sale.premium_or_asset_amount !== null ||
              sale.gross_revenue !== null ||
              sale.commission_amount !== null ||
              (sale.status && sale.status.trim()) ||
              (sale.notes && sale.notes.trim())
          );
        })
        .map((sale) => ({
          job_id: campaign.id,
          meeting_id: eventId,
          meeting_result_id: meetingResultId,
          product_type: sale.product_type,
          carrier_or_company: sale.carrier_or_company,
          premium_or_asset_amount: sale.premium_or_asset_amount,
          gross_revenue: sale.gross_revenue,
          commission_amount: sale.commission_amount,
          status: sale.status,
          notes: sale.notes,
        }));

      if (insertRows.length) {
        const { error: insertErr } = await supabase.from('meeting_sales').insert(insertRows as any);
        if (insertErr) throw insertErr;
      }

      const { data: refreshed, error: refreshErr } = await supabase
        .from('meeting_sales')
        .select(
          'id, job_id, meeting_id, meeting_result_id, product_type, carrier_or_company, premium_or_asset_amount, gross_revenue, commission_amount, status, notes, created_at'
        )
        .eq('job_id', campaign.id)
        .eq('meeting_id', eventId)
        .order('created_at', { ascending: true });
      if (refreshErr) throw refreshErr;

      const nextRows: MeetingSaleRow[] = ((refreshed ?? []) as any[]).map((row) => ({
        id: String(row.id),
        job_id: String(row.job_id),
        meeting_id: String(row.meeting_id),
        meeting_result_id: row.meeting_result_id ?? null,
        product_type: row.product_type ?? null,
        carrier_or_company: row.carrier_or_company ?? null,
        premium_or_asset_amount: row.premium_or_asset_amount === null ? null : Number(row.premium_or_asset_amount),
        gross_revenue: row.gross_revenue === null ? null : Number(row.gross_revenue),
        commission_amount: row.commission_amount === null ? null : Number(row.commission_amount),
        status: row.status ?? null,
        notes: row.notes ?? null,
        created_at: row.created_at ?? undefined,
      }));

      setMeetingSalesByEventId((prev) => {
        const next = new Map(prev);
        next.set(eventId, nextRows);
        return next;
      });

      setDeletedMeetingSalesByEventId((prev) => {
        const next = new Map(prev);
        next.delete(eventId);
        return next;
      });
    } catch (err) {
      console.error('saveMeetingSales failed', err);
      alert('Failed to save meeting sales.');
    } finally {
      setSavingMeetingSalesEventId(null);
    }
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
                        <div className="text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-tight text-slate-900">{attendeesCount.toLocaleString()}</div>
                        <div className="text-xs text-slate-500 mt-1">Attendees</div>
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
                      {/* Purchased-list match summary — visible when matching has run */}
                      {matchMailMessage && (
                        <div className={`mb-2 px-2 py-1 rounded text-[10px] leading-snug ${matchMailMessage.startsWith('Error') ? 'bg-red-50 text-red-600' : 'bg-violet-50 text-violet-700'}`}>
                          {matchMailMessage}
                        </div>
                      )}
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
                              <div className="col-span-4 truncate text-xs text-slate-600">{r.phone ? formatPhoneDisplay(r.phone) : r.email || '—'}</div>
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
                          const isPast = isPastEvent(ev);
                          const evAttendees = displayResponders
                            .filter(r => r.event_id === ev.id)
                            .reduce((sum, r) => sum + 1 + (r.guests ?? 0), 0);
                          const resultRow = meetingResultsByEventId.get(ev.id);
                          const salesRows = meetingSalesByEventId.get(ev.id) || [];
                          return (
                            <div key={ev.id} className={`rounded-md p-2 ${isPast ? 'bg-gray-50 text-gray-500' : 'bg-white shadow-sm'}`}>
                              <div className="flex items-center gap-3">
                                <div className={`w-20 text-center p-2 rounded ${isPast ? 'bg-gray-100' : 'bg-emerald-600 text-white'}`}>
                                  <div className="text-xs uppercase">{parts.month}</div>
                                  <div className="text-2xl font-extrabold leading-none">{parts.day}</div>
                                  <div className="text-xs">{parts.weekday}</div>
                                </div>
                                <div className="flex-1">
                                  <div className="font-medium text-sm">{ev.venue_name || 'TBD'}</div>
                                  <div className="text-xs text-slate-500">{ev.venue_city ? `${ev.venue_city}${ev.venue_state ? `, ${ev.venue_state}` : ''}` : ''}</div>
                                  <div className="text-xs text-slate-400">Attendees: {evAttendees}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="text-sm text-slate-600">{ev.event_time ? formatTime(ev.event_time) : ''}</div>
                                  {!!user && (
                                    <button
                                      type="button"
                                      title="Edit meeting"
                                      onClick={() => openEditMeeting(ev)}
                                      className="text-xs text-slate-400 hover:text-blue-600 underline leading-none"
                                    >Edit</button>
                                  )}
                                </div>
                              </div>

                              {isPast && (
                                <div className="mt-2 rounded border border-slate-200 bg-white p-2">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="text-xs font-semibold text-slate-700">Meeting Results</div>
                                    <button
                                      type="button"
                                      onClick={() => saveMeetingResult(ev)}
                                      disabled={savingMeetingResultEventId === ev.id}
                                      className="text-[11px] px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                                    >
                                      {savingMeetingResultEventId === ev.id ? 'Saving…' : 'Save results'}
                                    </button>
                                  </div>

                                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                                    <input
                                      inputMode="numeric"
                                      value={formatNumberInput(resultRow?.attendees_actual)}
                                      onChange={(e) => patchMeetingResult(ev.id, { attendees_actual: parseInteger(e.target.value) })}
                                      placeholder="Attendees"
                                      className="text-xs border rounded px-2 py-1.5"
                                    />
                                    <input
                                      inputMode="numeric"
                                      value={formatNumberInput(resultRow?.no_shows)}
                                      onChange={(e) => patchMeetingResult(ev.id, { no_shows: parseInteger(e.target.value) })}
                                      placeholder="No-shows"
                                      className="text-xs border rounded px-2 py-1.5"
                                    />
                                    <input
                                      inputMode="numeric"
                                      value={formatNumberInput(resultRow?.walk_ins)}
                                      onChange={(e) => patchMeetingResult(ev.id, { walk_ins: parseInteger(e.target.value) })}
                                      placeholder="Walk-ins"
                                      className="text-xs border rounded px-2 py-1.5"
                                    />
                                    <input
                                      inputMode="numeric"
                                      value={formatNumberInput(resultRow?.appointments_booked)}
                                      onChange={(e) => patchMeetingResult(ev.id, { appointments_booked: parseInteger(e.target.value) })}
                                      placeholder="Appointments booked"
                                      className="text-xs border rounded px-2 py-1.5"
                                    />
                                    <input
                                      inputMode="numeric"
                                      value={formatNumberInput(resultRow?.appointments_attended)}
                                      onChange={(e) => patchMeetingResult(ev.id, { appointments_attended: parseInteger(e.target.value) })}
                                      placeholder="Appointments attended"
                                      className="text-xs border rounded px-2 py-1.5"
                                    />
                                    <input
                                      inputMode="numeric"
                                      value={formatNumberInput(resultRow?.products_sold_count)}
                                      onChange={(e) => patchMeetingResult(ev.id, { products_sold_count: parseInteger(e.target.value) })}
                                      placeholder="Products sold count"
                                      className="text-xs border rounded px-2 py-1.5"
                                    />
                                  </div>

                                  <textarea
                                    rows={2}
                                    value={resultRow?.notes || ''}
                                    onChange={(e) => patchMeetingResult(ev.id, { notes: e.target.value || null })}
                                    placeholder="Results notes"
                                    className="mt-2 w-full text-xs border rounded px-2 py-1.5"
                                  />

                                  <div className="mt-3 border-t pt-2">
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="text-xs font-semibold text-slate-700">Sales</div>
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => addMeetingSale(ev.id)}
                                          className="text-[11px] px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1"
                                        >
                                          <Plus className="w-3 h-3" /> Add sale
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => saveMeetingSales(ev)}
                                          disabled={savingMeetingSalesEventId === ev.id}
                                          className="text-[11px] px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                                        >
                                          {savingMeetingSalesEventId === ev.id ? 'Saving…' : 'Save sales'}
                                        </button>
                                      </div>
                                    </div>

                                    {salesRows.length === 0 ? (
                                      <div className="text-[11px] text-slate-500">No sales rows.</div>
                                    ) : (
                                      <div className="space-y-2">
                                        {salesRows.map((sale) => (
                                          <div key={sale.id} className="rounded border border-slate-200 p-2 bg-slate-50">
                                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                                              <input
                                                value={sale.product_type || ''}
                                                onChange={(e) => patchMeetingSale(ev.id, sale.id, { product_type: e.target.value || null })}
                                                placeholder="Product type"
                                                className="text-xs border rounded px-2 py-1.5"
                                              />
                                              <input
                                                value={sale.carrier_or_company || ''}
                                                onChange={(e) => patchMeetingSale(ev.id, sale.id, { carrier_or_company: e.target.value || null })}
                                                placeholder="Carrier/company"
                                                className="text-xs border rounded px-2 py-1.5"
                                              />
                                              <input
                                                value={sale.status || ''}
                                                onChange={(e) => patchMeetingSale(ev.id, sale.id, { status: e.target.value || null })}
                                                placeholder="Status"
                                                className="text-xs border rounded px-2 py-1.5"
                                              />
                                              <input
                                                inputMode="decimal"
                                                value={formatNumberInput(sale.premium_or_asset_amount)}
                                                onChange={(e) => patchMeetingSale(ev.id, sale.id, { premium_or_asset_amount: parseDecimal(e.target.value) })}
                                                placeholder="Premium/asset"
                                                className="text-xs border rounded px-2 py-1.5"
                                              />
                                              <input
                                                inputMode="decimal"
                                                value={formatNumberInput(sale.gross_revenue)}
                                                onChange={(e) => patchMeetingSale(ev.id, sale.id, { gross_revenue: parseDecimal(e.target.value) })}
                                                placeholder="Gross revenue"
                                                className="text-xs border rounded px-2 py-1.5"
                                              />
                                              <input
                                                inputMode="decimal"
                                                value={formatNumberInput(sale.commission_amount)}
                                                onChange={(e) => patchMeetingSale(ev.id, sale.id, { commission_amount: parseDecimal(e.target.value) })}
                                                placeholder="Commission"
                                                className="text-xs border rounded px-2 py-1.5"
                                              />
                                            </div>
                                            <div className="mt-2 flex items-start gap-2">
                                              <textarea
                                                rows={2}
                                                value={sale.notes || ''}
                                                onChange={(e) => patchMeetingSale(ev.id, sale.id, { notes: e.target.value || null })}
                                                placeholder="Sale notes"
                                                className="flex-1 text-xs border rounded px-2 py-1.5"
                                              />
                                              <button
                                                type="button"
                                                onClick={() => removeMeetingSale(ev.id, sale.id)}
                                                className="text-[11px] px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 inline-flex items-center gap-1"
                                              >
                                                <Trash2 className="w-3 h-3" /> Remove
                                              </button>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {events.length === 0 && <div className="text-sm text-slate-500">No meetings scheduled</div>}
                      </div>
                    </div>

                    {/* Map */}
                    <div className="col-span-1 lg:col-span-1 bg-gray-50 rounded-lg p-2">
                      <div className="text-sm font-semibold mb-2">Map</div>
                      <VenueStaticMap
                        venueLat={(events[0] as any)?.venue_lat ?? null}
                        venueLng={(events[0] as any)?.venue_lng ?? null}
                        venueAddress={
                          events[0]
                            ? [events[0].venue_name, events[0].venue_address, events[0].venue_city, events[0].venue_state]
                                .filter(Boolean).join(', ')
                            : undefined
                        }
                        height={260}
                        onOpenFullMap={onOpenMap ? () => onOpenMap(campaign.id) : undefined}
                        meetingId={events[0]?.id}
                        onCoordinatesResolved={async (meetingId, lat, lng) => {
                          if (typeof lat !== 'number' || typeof lng !== 'number') return;
                          try {
                            await supabase
                              .from('job_meetings')
                              .update({ venue_lat: lat, venue_lng: lng })
                              .eq('id', meetingId);
                          } catch (err) {
                            console.warn('[VenueStaticMap] failed to persist coordinates', err);
                          }
                        }}
                      />
                      {onOpenMap && (
                        <button
                          type="button"
                          onClick={() => onOpenMap(campaign.id)}
                          className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors"
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          Map Mailed List &amp; Responders
                        </button>
                      )}

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
                        {/* Read-only details — visible to all users */}
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-600 bg-slate-50 rounded p-2">
                          {(campaign as any).job_number && <div><span className="font-medium text-slate-500">Job #:</span> {(campaign as any).job_number}</div>}
                          {campaign.template_type && <div><span className="font-medium text-slate-500">Type:</span> {campaign.template_type}</div>}
                          {((campaign as any).rep_name || (campaign as any).repName) && <div><span className="font-medium text-slate-500">Rep:</span> {(campaign as any).rep_name || (campaign as any).repName}</div>}
                          {((campaign as any).rep_phone || (campaign as any).repPhone) && <div><span className="font-medium text-slate-500">Phone:</span> {(campaign as any).rep_phone || (campaign as any).repPhone}</div>}
                          {((campaign as any).rep_email || (campaign as any).repEmail) && <div className="col-span-2"><span className="font-medium text-slate-500">Email:</span> {(campaign as any).rep_email || (campaign as any).repEmail}</div>}
                          {campaign.mail_quantity > 0 && <div><span className="font-medium text-slate-500">Mail qty:</span> {campaign.mail_quantity.toLocaleString()}</div>}
                          {(campaign as any).org_name && <div><span className="font-medium text-slate-500">Org:</span> {(campaign as any).org_name}</div>}
                          <div className="col-span-2 text-slate-400 select-all break-all"><span className="font-medium text-slate-500">ID:</span> {campaign.id}</div>
                        </div>
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
                              {tsvText.trim() && (
                                <div className="text-xs text-slate-500">
                                  {tsvText.split('\n').filter(l => l.trim()).length.toLocaleString()} lines pasted
                                </div>
                              )}
                              {/* Replace mode checkbox */}
                              <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={replaceExisting}
                                  onChange={e => setReplaceExisting(e.target.checked)}
                                  className="w-3.5 h-3.5 rounded border-slate-300 text-red-600 focus:ring-red-400"
                                />
                                <span className="text-xs text-slate-700">
                                  <span className={replaceExisting ? 'font-semibold text-red-600' : ''}>
                                    Replace existing reservation data
                                  </span>
                                  <span className="text-slate-400 ml-1">
                                    {replaceExisting
                                      ? '— DELETES all current responders for this meeting first'
                                      : '— (default) inserts new, updates existing, preserves manual edits'}
                                  </span>
                                </span>
                              </label>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={importTsvLeads}
                                  disabled={isImporting || !tsvText.trim() || !importEventId}
                                  className={`px-3 py-1 disabled:opacity-50 text-white rounded text-sm ${
                                    replaceExisting
                                      ? 'bg-red-600 hover:bg-red-700'
                                      : 'bg-emerald-600 hover:bg-emerald-700'
                                  }`}
                                >
                                  {isImporting ? 'Importing…' : replaceExisting ? 'Replace & Import' : 'Run Import'}
                                </button>
                                <button
                                  onClick={() => { setShowTsvImport(false); setTsvText(''); setImportEventId(''); setImportMessage(null); setReplaceExisting(false); }}
                                  className="px-3 py-1 bg-slate-400 hover:bg-slate-500 text-white rounded text-sm"
                                >Cancel</button>
                              </div>
                              {importMessage && (
                                <div className={`p-2 border rounded text-xs font-mono whitespace-pre-wrap ${
                                  importMessage.startsWith('[FAIL]')
                                    ? 'bg-red-50 border-red-200 text-red-700'
                                    : importMessage.startsWith('✓')
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                    : 'bg-slate-50 border-slate-200 text-slate-700'
                                }`}>{importMessage}</div>
                              )}
                            </div>
                          )}
                          {/* ── Bulk assign unassigned responders ── */}
                          {user?.is_master_admin && (
                            <div className="w-full mt-2 pt-2 border-t border-slate-200">
                              <div className="text-xs font-medium text-slate-600 mb-1.5">Bulk assign unassigned responders</div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <select
                                  value={bulkAssignEventId}
                                  onChange={e => setBulkAssignEventId(e.target.value)}
                                  className="flex-1 min-w-[200px] p-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                                >
                                  <option value="">— select meeting to assign —</option>
                                  {events.map(ev => (
                                    <option key={ev.id} value={ev.id}>{formatEventOption(ev)}</option>
                                  ))}
                                </select>
                                <button
                                  onClick={bulkAssignUnassigned}
                                  disabled={isBulkAssigning || !bulkAssignEventId}
                                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded text-xs"
                                >{isBulkAssigning ? 'Assigning…' : 'Assign All Unassigned'}</button>
                              </div>
                              {bulkAssignMessage && (
                                <div className="mt-1 text-xs text-slate-600">{bulkAssignMessage}</div>
                              )}
                            </div>
                          )}
                          {/* ── Purchased demographic list import & matching ── */}
                          {user?.is_master_admin && (
                            <div className="w-full mt-2 pt-2 border-t border-slate-200">
                              <div className="text-xs font-medium text-slate-600 mb-1">Purchased Demographic List</div>
                              <div className="text-xs text-slate-400 mb-1.5">Import the full AccuLeads CSV, then match responders to enrich age / income / IPA data.</div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => { setShowMailedImport(v => !v); setMailedImportMessage(null); }}
                                  className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded text-xs"
                                >{showMailedImport ? 'Cancel' : 'Import Purchased List CSV'}</button>
                                <button
                                  type="button"
                                  onClick={runMatchResponders}
                                  disabled={isMatchingMail}
                                  className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded text-xs"
                                >{isMatchingMail ? 'Matching…' : 'Match Responders to Purchased List'}</button>
                                <button
                                  type="button"
                                  onClick={runDebugMatches}
                                  disabled={isDebuggingMatch}
                                  className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded text-xs"
                                >{isDebuggingMatch ? 'Diagnosing…' : 'Debug Purchased Matches'}</button>
                              </div>
                              {debugMatchOutput && (
                                <div className="mt-2">
                                  <div className="flex items-center justify-between mb-1">
                                    <div className="text-xs font-medium text-orange-700">Match Diagnostics (Nelson / Lee / Hart / French)</div>
                                    <button type="button" onClick={() => setDebugMatchOutput(null)} className="text-xs text-slate-400 hover:text-slate-600">✕ Clear</button>
                                  </div>
                                  <pre className="bg-orange-50 border border-orange-200 rounded p-2 text-[10px] font-mono text-slate-700 overflow-auto max-h-96 whitespace-pre-wrap break-words">{debugMatchOutput}</pre>
                                </div>
                              )}
                              {matchNameResults && matchNameResults.length > 0 && (
                                <div className="mt-2">
                                  <div className="flex items-center justify-between mb-1">
                                    <div className="text-xs font-medium text-slate-700">Real Match Results — all {matchNameResults.length} responder(s){matcherVersion && <span className="ml-2 font-mono text-[9px] text-slate-400">[{matcherVersion}]</span>}</div>
                                    <button type="button" onClick={() => setMatchNameResults(null)} className="text-xs text-slate-400 hover:text-slate-600">✕ Clear</button>
                                  </div>
                                  <div className="overflow-auto max-h-72 rounded border border-slate-200">
                                    <table className="w-full text-[10px] font-mono border-collapse">
                                      <thead className="sticky top-0 bg-slate-100">
                                        <tr>
                                          <th className="text-left px-1.5 py-1 border-b border-slate-200">Name</th>
                                          <th className="text-left px-1.5 py-1 border-b border-slate-200">Resp.Zip</th>
                                          <th className="text-left px-1.5 py-1 border-b border-slate-200">Confidence</th>
                                          <th className="text-left px-1.5 py-1 border-b border-slate-200">Tier</th>
                                          <th className="text-left px-1.5 py-1 border-b border-slate-200">Matched To</th>
                                          <th className="text-left px-1.5 py-1 border-b border-slate-200">Write</th>
                                          <th className="text-left px-1.5 py-1 border-b border-slate-200">Fail Reason / Error</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {matchNameResults.map((r: any) => (
                                          <tr key={r.id} className={r.confidence === 'none' ? 'bg-red-50' : r.confidence === 'exact' ? 'bg-green-50' : 'bg-yellow-50'}>
                                            <td className="px-1.5 py-0.5 border-b border-slate-100">{r.name}</td>
                                            <td className="px-1.5 py-0.5 border-b border-slate-100">{r.responderZip || '—'}</td>
                                            <td className="px-1.5 py-0.5 border-b border-slate-100">{r.confidence}</td>
                                            <td className="px-1.5 py-0.5 border-b border-slate-100">{r.tier}</td>
                                            <td className="px-1.5 py-0.5 border-b border-slate-100">{r.matchedPurchasedName ?? '—'} {r.matchedPurchasedZip ? `(${r.matchedPurchasedZip})` : ''}</td>
                                            <td className="px-1.5 py-0.5 border-b border-slate-100">{r.writeOk ? '✓' : '✗'}</td>
                                            <td className="px-1.5 py-0.5 border-b border-slate-100 text-red-600 max-w-xs truncate">{r.failReason ?? r.writeError ?? ''}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                              {showMailedImport && (
                                <div className="mt-2 space-y-2">
                                  {/* ── Primary: file upload ── */}
                                  <div>
                                    <div className="text-xs font-medium text-slate-600 mb-1">Upload AccuLeads CSV (header row optional — auto-detected)</div>
                                    <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-teal-50 hover:bg-teal-100 border border-teal-300 text-teal-700 rounded text-xs cursor-pointer">
                                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 12V4m0 0L8 8m4-4l4 4" /></svg>
                                      {mailedFileName ? 'Change file' : 'Choose file…'}
                                      <input
                                        type="file"
                                        accept=".csv,.txt,text/csv,text/plain"
                                        className="sr-only"
                                        onChange={handleMailedFileSelect}
                                      />
                                    </label>
                                    {mailedFileName && (
                                      <div className="mt-1 text-xs text-slate-600">
                                        <span className="font-medium">{mailedFileName}</span>
                                        {mailedRowCount !== null && (
                                          <span className="ml-2 text-slate-400">~{mailedRowCount.toLocaleString()} rows</span>
                                        )}
                                        {mailedRowCount === null && mailedCsv === '' && (
                                          <span className="ml-2 text-slate-400 italic">reading…</span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  {/* ── Fallback: paste textarea ── */}
                                  <details className="text-xs">
                                    <summary className="cursor-pointer text-slate-400 hover:text-slate-600 select-none">
                                      Or paste CSV manually (large files may fail)
                                    </summary>
                                    <textarea
                                      value={mailedFileName ? '' : mailedCsv}
                                      onChange={e => {
                                        setMailedFileName(null);
                                        setMailedRowCount(null);
                                        setMailedCsv(e.target.value);
                                      }}
                                      placeholder="Paste CSV rows here… (no headers)"
                                      rows={6}
                                      className="mt-1.5 w-full p-2 text-xs border border-slate-300 rounded font-mono focus:outline-none focus:ring-1 focus:ring-teal-400 resize-y"
                                    />
                                  </details>
                                  {/* ── Actions ── */}
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <button
                                      type="button"
                                      onClick={() => importMailedList()}
                                      disabled={isImportingMail || (!mailedCsv.trim())}
                                      className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-xs font-medium"
                                    >{isImportingMail ? 'Importing…' : 'Import Purchased List'}</button>
                                    <button
                                      type="button"
                                      onClick={() => importMailedList(100)}
                                      disabled={isImportingMail || (!mailedCsv.trim())}
                                      className="px-3 py-1.5 bg-slate-500 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-xs font-medium"
                                      title="Test: import first 100 rows only, no data cleared"
                                    >Test (100 rows)</button>
                                    <button
                                      type="button"
                                      onClick={runValidateFirstRow}
                                      disabled={isImportingMail || (!mailedCsv.trim())}
                                      className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-xs font-medium"
                                      title="Parse first row only — no DB write. Shows column mapping preview."
                                    >Validate First Row</button>
                                    <button
                                      type="button"
                                      onClick={() => { setShowMailedImport(false); setMailedCsv(''); setMailedFileName(null); setMailedRowCount(null); setMailedImportMessage(null); }}
                                      className="px-3 py-1.5 text-slate-600 border border-slate-300 rounded text-xs hover:bg-slate-50"
                                    >Cancel</button>
                                  </div>
                                  {mailedImportMessage && (
                                    <div className={`text-xs px-2 py-1.5 rounded whitespace-pre-wrap break-words font-mono ${mailedImportMessage.startsWith('[FAIL]') ? 'bg-red-50 text-red-700' : mailedImportMessage.startsWith('[6/6]') || mailedImportMessage.includes('✓') ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-600'}`}>
                                      {mailedImportMessage}
                                    </div>
                                  )}
                                </div>
                              )}
                              {matchMailMessage && (
                                <div className={`mt-1 text-xs px-2 py-1 rounded ${matchMailMessage.startsWith('Error') ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-600'}`}>
                                  {matchMailMessage}
                                </div>
                              )}
                              {mailedImportMessage && !showMailedImport && (
                                <div className="mt-1 text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700">
                                  {mailedImportMessage}
                                </div>
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
              <button type="button" onClick={() => setShowFullResponders(false)} className="text-xs text-slate-400 hover:text-slate-200 underline">Close</button>
            </div>
          </div>
          <ResponderList
            responders={displayResponders.length > 0 ? displayResponders : responders}
            events={events}
            selectedEventId={selectedEventId}
            onSelectEvent={setSelectedEventId}
            onUpdateResponder={handleRespUpdateWithRematch}
            isMasterAdmin={!!user?.is_master_admin}
            onDeleteResponder={handleDeleteResponder}
            campaignName={(campaign as any).project_name ?? (campaign as any).name ?? campaign.id}
          />
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

      {/* Edit Meeting Modal — master admin only */}
      {editingMeeting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={(e) => { if (e.target === e.currentTarget) setEditingMeeting(null); }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Edit Meeting</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Date</label>
                  <input type="date" value={editForm.event_date} onChange={e => setEditForm(f => ({ ...f, event_date: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Time (local)</label>
                  <input type="time" value={editForm.event_time} onChange={e => setEditForm(f => ({ ...f, event_time: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Venue / Location Name</label>
                <input type="text" value={editForm.venue_name} onChange={e => setEditForm(f => ({ ...f, venue_name: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Address</label>
                <input type="text" value={editForm.venue_address} onChange={e => setEditForm(f => ({ ...f, venue_address: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">City</label>
                  <input type="text" value={editForm.venue_city} onChange={e => setEditForm(f => ({ ...f, venue_city: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">State</label>
                  <input type="text" maxLength={2} value={editForm.venue_state} onChange={e => setEditForm(f => ({ ...f, venue_state: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-sm" />
                </div>
              </div>
            </div>
            {editMeetingError && <p className="mt-3 text-xs text-red-600">{editMeetingError}</p>}
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setEditingMeeting(null)} className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={saveMeetingEdit} disabled={isSavingMeeting} className="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">{isSavingMeeting ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CampaignCard;
