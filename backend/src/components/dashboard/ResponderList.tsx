import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { Responder, Event } from '@/types';
import { decodeIPA, decodeIncome } from '@/lib/acxiomDecoders';
import { formatPhoneDisplay } from '@/lib/utils';
import { 
  CheckCircle2, 
  XCircle, 
  Clock,
  Phone, 
  Mail,
  Edit3,
  Trash2,
  Save,
  X,
  Users,
  QrCode,
  PhoneCall,
  UserPlus,
  AlertTriangle,
  Printer,
} from 'lucide-react';

interface ResponderListProps {
  responders: Responder[];
  events: Event[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string | null) => void;
  onUpdateResponder: (responderId: string, updates: Partial<Responder>) => void | Promise<void>;
  isMasterAdmin?: boolean;
  onDeleteResponder?: (responderId: string) => void;
  campaignName?: string;
}

interface EditDraft {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  guests: number;
  guest_name: string;
  event_id: string;
  status: string;
  confirmed: boolean;
  attended: boolean;
  notes: string;
}

const ResponderList: React.FC<ResponderListProps> = ({
  responders,
  events,
  selectedEventId,
  onSelectEvent,
  onUpdateResponder,
  isMasterAdmin = false,
  onDeleteResponder,
  campaignName = 'Campaign',
}) => {
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'unconfirmed' | 'waitlist'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const eventMap = new Map(events.map(e => [e.id, e]));

  // Normalize status: guard against null/undefined, extra whitespace, or mixed case from DB
  const normStatus = (r: Responder) => (r.status || 'registered').trim().toLowerCase();

  // Derive which sections to show based on the filter selection
  const showWaitlist = filter === 'all' || filter === 'waitlist';
  const showRegistered = filter === 'all' || filter === 'confirmed' || filter === 'unconfirmed';

  // Strip "Status: ..." segments injected by older imports — status now has its own column
  const displayNotes = (notes: string | null | undefined): string => {
    if (!notes) return '';
    return notes
      .split(' | ')
      .filter(part => !/^Status:/i.test(part.trim()))
      .join(' | ')
      .trim();
  };

  const waitlistResponders = showWaitlist
    ? responders.filter(r =>
        normStatus(r) === 'waitlist' &&
        (!selectedEventId || r.event_id === selectedEventId)
      )
    : [];

  const filteredResponders = showRegistered
    ? responders.filter(r => {
        const s = normStatus(r);
        if (s === 'waitlist' || s === 'cancelled') return false;
        if (selectedEventId && r.event_id !== selectedEventId) return false;
        if (filter === 'confirmed') return r.confirmed;
        if (filter === 'unconfirmed') return !r.confirmed;
        return true;
      })
    : [];

  const unassignedCount = responders.filter(r => {
    const s = normStatus(r);
    return !r.event_id && s !== 'waitlist' && s !== 'cancelled';
  }).length;

  // Total signups = ALL responders for this event (waitlist + registered) + their guests.
  // Cancelled are excluded — they opted out and should not count toward campaign responses.
  const eventResponders = (selectedEventId
    ? responders.filter(r => r.event_id === selectedEventId)
    : responders
  ).filter(r => normStatus(r) !== 'cancelled');
  const totalSignupsCount = eventResponders.reduce((sum, r) => sum + 1 + (r.guests ?? 0), 0);

  // Registered attendees (seats/venue planning) — excludes waitlist and cancelled
  const attendeesCount = filteredResponders.reduce((sum, r) => sum + 1 + (r.guests ?? 0), 0);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const formatEventShort = (ev: Event) => {
    const parts: string[] = [];
    if (ev.event_date) parts.push(formatDate(ev.event_date));
    if (ev.event_time) parts.push(formatTime(ev.event_time));
    if (ev.venue_name) parts.push(ev.venue_name);
    return parts.join(' · ');
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'qr_code': return <QrCode className="w-4 h-4 text-purple-400" />;
      case 'call_center': return <PhoneCall className="w-4 h-4 text-blue-400" />;
      case 'manual': return <UserPlus className="w-4 h-4 text-green-400" />;
      default: return null;
    }
  };

  const handleToggleConfirmed = (responder: Responder) => {
    onUpdateResponder(responder.id, { confirmed: !responder.confirmed });
  };

  const openEdit = (responder: Responder) => {
    setEditingId(responder.id);
    setDraft({
      first_name: responder.first_name ?? '',
      last_name: responder.last_name ?? '',
      phone: responder.phone ?? '',
      email: responder.email ?? '',
      guests: responder.guests ?? 0,
      guest_name: (responder as any).guest_name ?? '',
      event_id: responder.event_id ?? '',
      status: normStatus(responder),
      confirmed: responder.confirmed ?? false,
      attended: responder.attended ?? false,
      notes: responder.notes ?? '',
    });
  };

  const saveEdit = async () => {
    if (!editingId || !draft) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      await onUpdateResponder(editingId, {
        first_name: draft.first_name || undefined,
        last_name: draft.last_name || undefined,
        phone: draft.phone || undefined,
        email: draft.email || undefined,
        guests: draft.guests,
        guest_name: draft.guest_name || null,
        event_id: draft.event_id || null,
        status: draft.status,
        confirmed: draft.confirmed,
        attended: draft.attended,
        notes: draft.notes || undefined,
      });
      setEditingId(null);
      setDraft(null);
    } catch (err: any) {
      setEditError(err?.message ?? 'Save failed. Please try again.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = (responder: Responder) => {
    const name = `${responder.first_name ?? ''} ${responder.last_name ?? ''}`.trim() || responder.phone || responder.email || responder.id;
    if (!window.confirm(`Delete responder "${name}"? This cannot be undone.`)) return;
    onDeleteResponder?.(responder.id);
  };

  // Print a professional sign-in sheet in a new window
  const printResponders = (forEventId: string | null) => {
    const toPrint = (forEventId
      ? responders.filter(r => r.event_id === forEventId)
      : responders
    ).filter(r => normStatus(r) !== 'waitlist' && normStatus(r) !== 'cancelled');
    const ev = forEventId ? eventMap.get(forEventId) : null;

    // Build header subtitle: Date · Time · Venue
    const headerParts: string[] = [];
    if (ev?.event_date) headerParts.push(formatDate(ev.event_date));
    if (ev?.event_time) headerParts.push(formatTime(ev.event_time));
    if (ev?.venue_name) headerParts.push(ev.venue_name);
    const subHeader = headerParts.length ? headerParts.join(' &middot; ') : 'All Meetings';

    // Sort alphabetically by last name
    const sorted = [...toPrint].sort((a, b) => (a.last_name ?? '').localeCompare(b.last_name ?? ''));

    // Build table rows: responder row first, guest row (if any) BELOW
    const rows = sorted.map(r => {
      const guestName = (r as any).guest_name as string | null | undefined;
      const guestCount = r.guests ?? 0;
      const respRow = `<tr>
        <td>${(r.last_name ?? '').toUpperCase()}, ${r.first_name ?? ''}</td>
        <td>${formatPhoneDisplay(r.phone)}</td>
        <td>${r.email ?? ''}</td>
        <td class="sig-cell"></td>
        <td></td>
      </tr>`;
      let guestRow = '';
      if (guestName) {
        guestRow = `<tr class="guest-row">
          <td class="guest-cell"><span class="guest-label">Guest:</span> ${guestName}</td>
          <td></td><td></td><td class="sig-cell"></td><td></td>
        </tr>`;
      } else if (guestCount > 0) {
        guestRow = `<tr class="guest-row">
          <td class="guest-cell"><span class="guest-label">Guest${guestCount > 1 ? 's' : ''}:</span> +${guestCount}</td>
          <td></td><td></td><td class="sig-cell"></td><td></td>
        </tr>`;
      }
      return respRow + guestRow;
    }).join('');

    // 5 blank walk-in rows
    const blankRows = Array(5).fill(
      '<tr><td>&nbsp;</td><td></td><td></td><td class="sig-cell"></td><td></td></tr>'
    ).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Sign-In Sheet</title>
  <style>
    @page { size: landscape; margin: 0.6in 0.5in; }
    * { box-sizing: border-box; }
    body {
      font-family: Arial, sans-serif;
      font-size: 15px;
      color: #000;
      background: #fff;
      margin: 0;
      padding: 0;
    }
    .header {
      text-align: center;
      margin-bottom: 18px;
      border-bottom: 3px solid #000;
      padding-bottom: 10px;
    }
    .header h1 {
      font-size: 26px;
      font-weight: bold;
      margin: 0 0 6px;
      letter-spacing: 2px;
      text-transform: uppercase;
    }
    .header p {
      font-size: 17px;
      margin: 0;
      color: #000;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th {
      background: #000;
      color: #fff;
      font-weight: bold;
      font-size: 15px;
      border: 2px solid #000;
      padding: 8px 10px;
      text-align: left;
      text-transform: uppercase;
    }
    td {
      border: 1.5px solid #333;
      padding: 0 10px;
      font-size: 15px;
      vertical-align: middle;
      height: 40px;
      max-height: 40px;
      overflow: hidden;
      white-space: nowrap;
    }
    .sig-cell {
      min-width: 200px;
    }
    tr.guest-row td {
      background: #f5f5f5;
      border-top: none;
      height: 32px;
      max-height: 32px;
      padding: 0 10px;
      font-size: 14px;
    }
    .guest-cell {
      padding-left: 24px;
    }
    .guest-label {
      font-style: italic;
      color: #555;
      font-size: 13px;
    }
    .blank-divider td {
      border-top: 2px dashed #aaa;
      background: #fafafa;
    }
    .blank-label {
      font-size: 12px;
      color: #888;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Sign In Sheet</h1>
    <p>${subHeader}</p>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:22%">Name</th>
        <th style="width:13%">Phone</th>
        <th style="width:20%">Email</th>
        <th class="sig-cell" style="width:25%">Signature</th>
        <th style="width:20%">Notes</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr class="blank-divider">
        <td colspan="5" class="blank-label">&nbsp;&nbsp;Walk-ins</td>
      </tr>
      ${blankRows}
    </tbody>
  </table>
  <script>window.onload = function() { window.print(); };</script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  };

  // Edit is always visible; delete is admin-only. Action column is always present.
  const colCount = 8;

  return (
    <div className="bg-white text-slate-900">
      {/* Event Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 p-4 border-b border-slate-200">
        <button
          onClick={() => onSelectEvent(null)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${selectedEventId === null ? 'bg-red-600 text-white' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'}`}
        >
          All Meetings
        </button>
        {events.map((event) => (
          <button
            key={event.id}
            onClick={() => onSelectEvent(event.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${selectedEventId === event.id ? 'bg-red-600 text-white' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'}`}
          >
            {formatDate(event.event_date)} @ {formatTime(event.event_time)}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="border border-slate-200 bg-white rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-500/50"
          >
            <option value="all">All Status</option>
            <option value="confirmed">Confirmed</option>
            <option value="unconfirmed">Unconfirmed</option>
            <option value="waitlist">Waitlist</option>
          </select>
          {selectedEventId && (
            <button
              onClick={() => printResponders(selectedEventId)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-xs"
            ><Printer className="w-3.5 h-3.5" />Print Selected Meeting</button>
          )}
          <button
            onClick={() => printResponders(null)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-500 hover:bg-slate-600 text-white rounded-lg text-xs"
          ><Printer className="w-3.5 h-3.5" />Print All Meetings</button>
        </div>
      </div>

      {/* Unassigned banner */}
      {unassignedCount > 0 && filter !== 'waitlist' && (
        <div className="mx-4 mt-3 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span><strong>{unassignedCount}</strong> responder{unassignedCount !== 1 ? 's' : ''} have no meeting assigned. Use the filter above to view them.</span>
        </div>
      )}

      {/* Responder Count */}
      <div className="px-4 py-2 border-b border-slate-200 flex items-center gap-4 flex-wrap">
        <span className="text-sm text-slate-600">
          Showing <span className="font-semibold text-slate-900">{filteredResponders.length}</span> registered
        </span>
        {waitlistResponders.length > 0 && (
          <span className="text-sm text-amber-700">
            <span className="font-semibold">{waitlistResponders.length}</span> on waitlist
          </span>
        )}
        <span className="text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{totalSignupsCount}</span> total signups
          <span className="text-xs text-slate-400 ml-1">(registered + waitlist + guests)</span>
        </span>
        {attendeesCount !== totalSignupsCount && (
          <span className="text-xs text-slate-400">
            {attendeesCount} registered seats
          </span>
        )}
      </div>

      {/* ── Edit Responder Modal ──
           Rendered via portal into document.body so `position:fixed` is always
           relative to the viewport, regardless of any transform/overflow on parents. */}
      {editingId && draft && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/40"
          onClick={() => { if (!savingEdit) { setEditingId(null); setDraft(null); setEditError(null); } }}
        >
          {/* Modal panel — fixed near top of viewport so it is always visible */}
          <div
            className="fixed left-1/2 -translate-x-1/2 top-16 w-full max-w-lg max-h-[calc(100vh-100px)] overflow-y-auto bg-white rounded-xl shadow-2xl p-5 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="font-semibold text-slate-800">Edit Responder</div>
              <button
                onClick={() => { if (!savingEdit) { setEditingId(null); setDraft(null); setEditError(null); } }}
                className="p-1 text-slate-400 hover:text-slate-700"
              ><X className="w-5 h-5" /></button>
            </div>

            {/* Attendee Status — most prominent field */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Attendee Status</label>
              <div className="flex gap-2">
                {(['registered', 'waitlist', 'cancelled'] as const).map(s => (
                  <button
                    key={s}
                    type="button"
                    disabled={savingEdit}
                    onClick={() => setDraft({ ...draft, status: s })}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors capitalize ${
                      draft.status === s
                        ? s === 'registered' ? 'bg-green-500 text-white border-green-500'
                          : s === 'waitlist' ? 'bg-amber-500 text-white border-amber-500'
                          : 'bg-red-500 text-white border-red-500'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    } disabled:opacity-50`}
                  >
                    {s === 'registered' ? '✓ Registered' : s === 'waitlist' ? '⏳ Waitlist' : '✕ Cancelled'}
                  </button>
                ))}
              </div>
            </div>

            {/* Name + Contact */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">First name</label>
                <input disabled={savingEdit} className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50" value={draft.first_name} onChange={e => setDraft({ ...draft, first_name: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Last name</label>
                <input disabled={savingEdit} className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50" value={draft.last_name} onChange={e => setDraft({ ...draft, last_name: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Phone</label>
                <input disabled={savingEdit} className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50" value={draft.phone} onChange={e => setDraft({ ...draft, phone: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Email</label>
                <input disabled={savingEdit} className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50" value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} />
              </div>
            </div>

            {/* Guest */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Guest count (+1s)</label>
                <input type="number" min={0} max={9} disabled={savingEdit} className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50" value={draft.guests} onChange={e => setDraft({ ...draft, guests: Math.max(0, parseInt(e.target.value) || 0) })} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Guest name (if known)</label>
                <input disabled={savingEdit} className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50" placeholder="e.g. Jane Smith" value={draft.guest_name} onChange={e => setDraft({ ...draft, guest_name: e.target.value })} />
              </div>
            </div>

            {/* Meeting assignment */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">Assigned Meeting</label>
              <select disabled={savingEdit} className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white disabled:opacity-50" value={draft.event_id} onChange={e => setDraft({ ...draft, event_id: e.target.value })}>
                <option value="">— unassigned —</option>
                {events.map(ev => <option key={ev.id} value={ev.id}>{formatEventShort(ev)}</option>)}
              </select>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">Notes</label>
              <textarea disabled={savingEdit} className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 h-16 resize-none disabled:opacity-50" value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} />
            </div>

            {/* Confirmation + Attended */}
            <div className="flex items-center gap-5 pt-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" className="accent-green-600" disabled={savingEdit} checked={draft.confirmed} onChange={e => setDraft({ ...draft, confirmed: e.target.checked })} />
                <span className={draft.confirmed ? 'text-green-700 font-medium' : 'text-slate-600'}>Confirmed</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" className="accent-indigo-600" disabled={savingEdit} checked={draft.attended} onChange={e => setDraft({ ...draft, attended: e.target.checked })} />
                <span className={draft.attended ? 'text-indigo-700 font-medium' : 'text-slate-600'}>Attended</span>
              </label>
            </div>

            {/* Error message */}
            {editError && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                {editError}
              </div>
            )}

            {/* Footer */}
            <div className="flex justify-end gap-2 pt-1 border-t border-slate-100">
              <button
                disabled={savingEdit}
                onClick={() => { setEditingId(null); setDraft(null); setEditError(null); }}
                className="px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50"
              >Cancel</button>
              <button
                onClick={saveEdit}
                disabled={savingEdit}
                className="px-4 py-1.5 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded flex items-center gap-1.5 disabled:opacity-60"
              >
                {savingEdit ? <><span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />Saving…</> : <><Save className="w-4 h-4" />Save changes</>}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── WAITLIST SECTION ── */}
      {waitlistResponders.length > 0 && (
        <div className="mx-4 mt-4 mb-1">
          {/* Section header */}
          <div className="flex items-center gap-3 px-3 py-2 bg-amber-500 rounded-t-lg">
            <Clock className="w-4 h-4 text-white shrink-0" />
            <span className="text-white text-sm font-bold uppercase tracking-widest">Waitlist</span>
            <span className="ml-1 px-2 py-0.5 rounded-full bg-white/20 text-white text-xs font-semibold">{waitlistResponders.length}</span>
            <span className="ml-auto text-amber-100 text-xs italic">Not included on sign-in sheet</span>
          </div>
          <div className="overflow-x-auto rounded-b-lg border border-amber-300 border-t-0">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-amber-700 uppercase bg-amber-50 border-b border-amber-200">
                  <th className="px-4 py-2">Waitlist</th>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2 hidden md:table-cell">Contact</th>
                  <th className="px-4 py-2 hidden lg:table-cell">Location</th>
                  <th className="px-4 py-2">Guests</th>
                  <th className="px-4 py-2 hidden sm:table-cell">Meeting</th>
                  <th className="px-4 py-2">Notes</th>
                  <th className="px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {waitlistResponders.map(responder => {
                  const assignedEvent = responder.event_id ? eventMap.get(responder.event_id) : null;
                  const wNotes = displayNotes(responder.notes);
                  return (
                    <tr key={responder.id} className="bg-amber-50/50 hover:bg-amber-100/50 transition-colors">
                      {/* Waitlist status icon */}
                      <td className="px-4 py-3">
                        <div className="p-1.5 rounded-lg bg-amber-400/20 text-amber-600 inline-flex" title="Waitlist">
                          <Clock className="w-5 h-5" />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{responder.first_name} {responder.last_name}</div>
                        {responder.guest_name
                          ? <div className="text-xs text-slate-400">Guest: {responder.guest_name}</div>
                          : (responder.guests ?? 0) > 0
                            ? <div className="text-xs text-slate-400">+{responder.guests} guest{responder.guests === 1 ? '' : 's'}</div>
                            : null
                        }
                        <div className="text-xs text-slate-500 md:hidden">{formatPhoneDisplay(responder.phone)}</div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="flex flex-col gap-1">
                          {responder.phone && (
                            <a href={`tel:${responder.phone}`} className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
                              <Phone className="w-3 h-3" />{formatPhoneDisplay(responder.phone)}
                            </a>
                          )}
                          {responder.email && (
                            <a href={`mailto:${responder.email}`} className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-700 truncate max-w-[180px]">
                              <Mail className="w-3 h-3" />{responder.email}
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="text-sm text-slate-600">{[responder.city, responder.state, responder.zip].filter(Boolean).join(', ')}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Users className="w-4 h-4 text-slate-400" />
                          <span className="text-slate-900 font-medium">{responder.guests ?? 0}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {assignedEvent ? (
                          <div className="text-xs text-slate-600">
                            <div className="font-medium">{formatDate(assignedEvent.event_date)} {formatTime(assignedEvent.event_time)}</div>
                            <div className="text-slate-400 truncate max-w-[140px]">{assignedEvent.venue_name}</div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {wNotes
                          ? <span className="text-xs text-slate-500 truncate max-w-[120px] block" title={wNotes}>{wNotes}</span>
                          : <span className="text-xs text-slate-400 italic">—</span>
                        }
                      </td>
                      {/* Edit always shown; Delete admin-only */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(responder)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded" title="Edit"><Edit3 className="w-4 h-4" /></button>
                          {isMasterAdmin && <button onClick={() => handleDelete(responder)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete"><Trash2 className="w-4 h-4" /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── REGISTERED SECTION header ── */}
      {showRegistered && (
        <div className="mx-4 mt-4 mb-1">
          <div className="flex items-center gap-3 px-3 py-2 bg-slate-700 rounded-t-lg">
            <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
            <span className="text-white text-sm font-bold uppercase tracking-widest">Registered</span>
            <span className="ml-1 px-2 py-0.5 rounded-full bg-white/20 text-white text-xs font-semibold">{filteredResponders.length}</span>
          </div>
        </div>
      )}

      {/* Responder Table */}
      {showRegistered && <div className="overflow-x-auto mx-4 rounded-b-lg border border-slate-200 border-t-0">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-slate-500 uppercase border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3 hidden md:table-cell">Contact</th>
              <th className="px-4 py-3 hidden lg:table-cell">Location</th>
              <th className="px-4 py-3">Guests</th>
              <th className="px-4 py-3 hidden sm:table-cell">Meeting</th>
              <th className="px-4 py-3">Notes</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredResponders.map((responder) => {
              const assignedEvent = responder.event_id ? eventMap.get(responder.event_id) : null;
              const hasEnrichment =
                responder.matched_to_mail_list != null ||
                !!responder.age ||
                !!responder.income ||
                !!responder.ipa;
              return (
                <React.Fragment key={responder.id}>
                  <tr
                    className={`hover:bg-slate-50 transition-colors ${!responder.event_id ? 'bg-amber-50/60' : responder.confirmed ? '' : 'bg-amber-50'}`}
                  >
                  {/* Status */}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleConfirmed(responder)}
                      className={`p-1.5 rounded-lg transition-colors ${responder.confirmed ? 'bg-green-500/20 text-green-600 hover:bg-green-500/30' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                      title={responder.confirmed ? 'Confirmed' : 'Not Confirmed'}
                    >
                      {responder.confirmed ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                    </button>
                  </td>

                  {/* Name */}
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{responder.first_name} {responder.last_name}</div>
                    {responder.guest_name
                      ? <div className="text-xs text-slate-400">Guest: {responder.guest_name}</div>
                      : (responder.guests ?? 0) > 0
                        ? <div className="text-xs text-slate-400">+{responder.guests} guest{responder.guests === 1 ? '' : 's'}</div>
                        : null
                    }
                    <div className="text-xs text-slate-500 md:hidden">{formatPhoneDisplay(responder.phone)}</div>
                  </td>

                  {/* Contact */}
                  <td className="px-4 py-3 hidden md:table-cell">
                    <div className="flex flex-col gap-1">
                      {responder.phone && (
                        <a href={`tel:${responder.phone}`} className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 transition-colors">
                          <Phone className="w-3 h-3" />{formatPhoneDisplay(responder.phone)}
                        </a>
                      )}
                      {responder.email && (
                        <a href={`mailto:${responder.email}`} className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-700 transition-colors truncate max-w-[180px]">
                          <Mail className="w-3 h-3" />{responder.email}
                        </a>
                      )}
                    </div>
                  </td>

                  {/* Location */}
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <div className="text-sm text-slate-600">{[responder.city, responder.state, responder.zip].filter(Boolean).join(', ')}</div>
                  </td>

                  {/* Guests */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Users className="w-4 h-4 text-slate-400" />
                      <span className="text-slate-900 font-medium">{responder.guests ?? 0}</span>
                    </div>
                  </td>

                  {/* Meeting */}
                  <td className="px-4 py-3 hidden sm:table-cell">
                    {assignedEvent ? (
                      <div className="text-xs text-slate-600">
                        <div className="font-medium">{formatDate(assignedEvent.event_date)} {formatTime(assignedEvent.event_time)}</div>
                        <div className="text-slate-400 truncate max-w-[140px]">{assignedEvent.venue_name}</div>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-xs font-medium">
                        <AlertTriangle className="w-3 h-3" />Unassigned
                      </span>
                    )}
                  </td>

                  {/* Notes */}
                  <td className="px-4 py-3">
                    {(() => { const n = displayNotes(responder.notes); return n
                      ? <span className="text-xs text-slate-500 truncate max-w-[120px] block" title={n}>{n}</span>
                      : <span className="text-xs text-slate-400 italic">—</span>; })()}
                  </td>

                  {/* Actions: Edit always shown; Delete admin-only */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(responder)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                        title="Edit"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      {isMasterAdmin && (
                        <button
                          onClick={() => handleDelete(responder)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>

                  {/* Enrichment detail row — visible once mailed-list matching has run */}
                  {hasEnrichment && (
                    <tr className={`${!responder.event_id ? 'bg-amber-50/40' : 'bg-slate-50/50'}`}>
                      <td colSpan={colCount} className="px-6 pb-2 pt-0">
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-0.5 text-xs text-slate-500">
                          {/* Purchased-list match indicator — icon only, title for tooltip */}
                          {responder.matched_to_mail_list === true && (
                            <span
                              className={`inline-flex items-center gap-0.5 ${responder.match_confidence === 'fuzzy' ? 'text-amber-500' : 'text-green-600'}`}
                              title={`On purchased list${responder.match_confidence === 'fuzzy' ? ' (possible match)' : ''}`}
                            >
                              <CheckCircle2 className="w-3 h-3" />
                            </span>
                          )}
                          {responder.matched_to_mail_list === false && (
                            <span className="inline-flex items-center gap-0.5 text-amber-400" title="Not found on purchased list">
                              <AlertTriangle className="w-3 h-3" />
                            </span>
                          )}
                          {responder.age && <span>Age: <span className="font-medium text-slate-700">{responder.age}</span></span>}
                          {responder.income && <span>Income: <span className="font-medium text-slate-700">{decodeIncome(responder.income)}</span></span>}
                          {responder.ipa && <span>IPA: <span className="font-medium text-slate-700">{decodeIPA(responder.ipa)}</span></span>}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>

        {showRegistered && filteredResponders.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No registered responders found</p>
          </div>
        )}
      </div>}
    </div>
  );
};

export default ResponderList;
