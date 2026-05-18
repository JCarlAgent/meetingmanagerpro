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

  // Fetch responders from Supabase for this campaign (used both on mount and after sync)
  const reloadResponders = () => {
    if (!campaign.id) return;
    supabase
      .from('responders')
        .select('id, campaign_id, event_id, first_name, last_name, email, phone, guests, response_source, confirmed, attended, notes, age, income, ipa, matched_to_mail_list, match_confidence, created_at')
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
      .select('id, campaign_id, event_id, first_name, last_name, email, phone, guests, response_source, confirmed, attended, notes, age, income, ipa, matched_to_mail_list, match_confidence, created_at')
      .eq('campaign_id', campaign.id)
      .order('created_at', { ascending: false })
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
  // Attendees = sum of (1 primary + guests) across all responders
  const attendeesCount = displayResponders.reduce((sum, r) => sum + 1 + (r.guests ?? 0), 0) || (campaign.stats?.responses_total ?? 0);
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

    const isTestRun = !!testLimit;
    // Client-side slice: test mode sends ONLY the first N rows, not the full file
    const linesToSend = isTestRun ? allLines.slice(0, testLimit) : allLines;

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
        ? `[auth] Getting token… (test: ${linesToSend.length} rows / ${totalKB} KB in 1 chunk)`
        : `[auth] Getting token… (${linesToSend.length.toLocaleString()} rows / ${totalKB} KB → ${chunks.length} chunks of ${MAIL_CHUNK_SIZE} rows / ~${chunkKBEst} KB each)`
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
      setMatchMailMessage(
        `✓ Match complete — ${json.matched} exact, ${json.fuzzyMatched} fuzzy, ${json.unmatched} unmatched (${json.total} total).` +
        (json.errors?.length ? ` ${json.errors.length} errors.` : '')
      );
      reloadResponders();
    } catch (err: any) {
      setMatchMailMessage('Error: ' + (err?.message ?? String(err)));
    } finally {
      setIsMatchingMail(false);
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

  // Wrapped onUpdateResponder: triggers single-responder rematch when matching
  // fields (first_name, last_name, zip, address) are included in the update.
  const handleRespUpdateWithRematch = (responderId: string, updates: Partial<Responder>) => {
    onUpdateResponder(responderId, updates);
    const matchingFields: (keyof Responder)[] = ['first_name', 'last_name', 'zip', 'address'];
    if (matchingFields.some(f => f in updates)) {
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
      // Send only the first non-empty line
      const firstLine = mailedCsv.split('\n').find(l => l.trim()) ?? '';
      const res = await fetch('/api/integrations/workthelead/import-mailed-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jobId: campaign.id, csv: firstLine, chunkIndex: 0, totalChunks: 1, validateOnly: true }),
      });
      const rawText = await res.text();
      let j: Record<string, unknown>;
      try { j = JSON.parse(rawText); } catch { setMailedImportMessage(`[FAIL] Response not JSON: ${rawText.slice(0, 400)}`); return; }
      if (!res.ok) {
        setMailedImportMessage(`[FAIL] step=${j.step} — ${j.error}\n${j.hint ?? ''}`);
        return;
      }
      const mapped = j.firstRowMapped as Record<string, unknown> | null;
      const lines = [
        `✓ Validate OK — ${j.rawFieldCount} columns in raw CSV.`,
        `Mapped: first_name=${mapped?.first_name ?? '(empty)'}, last_name=${mapped?.last_name ?? '(empty)'}, zip=${mapped?.zip ?? '(empty)'}`,
        `age_band=${mapped?.age_band ?? '(empty)'}, claritas_ipa=${mapped?.claritas_ipa ?? '(empty)'}, est_income_range=${mapped?.est_income_range ?? '(empty)'}`,
        `Raw first line: ${(j.rawFirstLine as string ?? '').slice(0, 200)}`,
      ];
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
                              </div>
                              {showMailedImport && (
                                <div className="mt-2 space-y-2">
                                  {/* ── Primary: file upload ── */}
                                  <div>
                                    <div className="text-xs font-medium text-slate-600 mb-1">Upload AccuLeads CSV (no header row)</div>
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
    </div>
  );
};

export default CampaignCard;
