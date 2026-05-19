import React, { useState } from 'react';
import { Responder, Event } from '@/types';
import { decodeIPA, decodeIncome } from '@/lib/acxiomDecoders';
import { 
  CheckCircle2, 
  XCircle, 
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
  onUpdateResponder: (responderId: string, updates: Partial<Responder>) => void;
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
  event_id: string;
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
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'unconfirmed' | 'unassigned'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);

  const eventMap = new Map(events.map(e => [e.id, e]));

  const filteredResponders = responders.filter(r => {
    if (selectedEventId && r.event_id !== selectedEventId) return false;
    if (filter === 'confirmed') return r.confirmed;
    if (filter === 'unconfirmed') return !r.confirmed;
    if (filter === 'unassigned') return !r.event_id;
    return true;
  });

  const unassignedCount = responders.filter(r => !r.event_id).length;
  // Attendees = primary responders + their guests (for the current filtered view)
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
      event_id: responder.event_id ?? '',
      confirmed: responder.confirmed ?? false,
      attended: responder.attended ?? false,
      notes: responder.notes ?? '',
    });
  };

  const saveEdit = () => {
    if (!editingId || !draft) return;
    onUpdateResponder(editingId, {
      first_name: draft.first_name || undefined,
      last_name: draft.last_name || undefined,
      phone: draft.phone || undefined,
      email: draft.email || undefined,
      guests: draft.guests,
      event_id: draft.event_id || null,
      confirmed: draft.confirmed,
      attended: draft.attended,
      notes: draft.notes || undefined,
    });
    setEditingId(null);
    setDraft(null);
  };

  const handleDelete = (responder: Responder) => {
    const name = `${responder.first_name ?? ''} ${responder.last_name ?? ''}`.trim() || responder.phone || responder.email || responder.id;
    if (!window.confirm(`Delete responder "${name}"? This cannot be undone.`)) return;
    onDeleteResponder?.(responder.id);
  };

  // Print a sign-in sheet in a new window
  const printResponders = (forEventId: string | null) => {
    const toPrint = forEventId ? responders.filter(r => r.event_id === forEventId) : responders;
    const ev = forEventId ? eventMap.get(forEventId) : null;
    const eventLabel = ev ? formatEventShort(ev) : 'All Meetings';
    const totalAttendees = toPrint.reduce((s, r) => s + 1 + (r.guests ?? 0), 0);
    const sorted = [...toPrint].sort((a, b) => (a.last_name ?? '').localeCompare(b.last_name ?? ''));
    const rows = sorted.map(r =>
      `<tr><td>${(r.last_name ?? '').toUpperCase()}, ${r.first_name ?? ''}</td>` +
      `<td>${r.phone ?? ''}</td>` +
      `<td style="text-align:center">${(r.guests ?? 0) + 1}</td>` +
      `<td style="text-align:center">${r.confirmed ? '&#x2713;' : ''}</td>` +
      `<td></td></tr>`
    ).join('');
    const html = [
      '<!DOCTYPE html><html><head><title>', campaignName, ' Sign-In Sheet</title>',
      '<style>body{font-family:Arial,sans-serif;font-size:11px;margin:20px}',
      'h2{font-size:15px;margin-bottom:2px}p{margin:0 0 10px;color:#555}',
      'table{width:100%;border-collapse:collapse}',
      'th{background:#e8e8e8;font-weight:bold;border:1px solid #bbb;padding:5px 8px;text-align:left;font-size:10px;text-transform:uppercase}',
      'td{border:1px solid #ccc;padding:5px 8px}',
      'tr:nth-child(even) td{background:#f9f9f9}</style></head><body>',
      '<h2>', campaignName, ' \u2014 Sign-In Sheet</h2>',
      '<p>', eventLabel, ' &nbsp;|&nbsp; ', toPrint.length, ' responder', toPrint.length !== 1 ? 's' : '', ', ', totalAttendees, ' total attendees</p>',
      '<table><thead><tr><th>Name</th><th>Phone</th><th>Party Size</th><th>Confirmed</th><th>Signature</th></tr></thead>',
      '<tbody>', rows, '</tbody></table>',
      '<scr', 'ipt>window.onload=function(){window.print();}</scr', 'ipt>',
      '</body></html>',
    ].join('');
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  };

  const colCount = isMasterAdmin ? 8 : 7;

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
            <option value="unassigned">⚠ Unassigned meeting {unassignedCount > 0 ? `(${unassignedCount})` : ''}</option>
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
      {unassignedCount > 0 && filter !== 'unassigned' && (
        <div className="mx-4 mt-3 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span><strong>{unassignedCount}</strong> responder{unassignedCount !== 1 ? 's' : ''} have no meeting assigned. Use the filter above to view them.</span>
        </div>
      )}

      {/* Responder Count */}
      <div className="px-4 py-2 border-b border-slate-200 flex items-center gap-4 flex-wrap">
        <span className="text-sm text-slate-600">
          Showing <span className="font-semibold text-slate-900">{filteredResponders.length}</span> responder{filteredResponders.length !== 1 ? 's' : ''}
        </span>
        <span className="text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{attendeesCount}</span> total attendees
          <span className="text-xs text-slate-400 ml-1">(primary + guests)</span>
        </span>
      </div>

      {/* Edit Modal */}
      {editingId && draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { setEditingId(null); setDraft(null); }}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="font-semibold text-slate-800">Edit Responder</div>
              <button onClick={() => { setEditingId(null); setDraft(null); }} className="p-1 text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">First name</label>
                <input className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400" value={draft.first_name} onChange={e => setDraft({ ...draft, first_name: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Last name</label>
                <input className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400" value={draft.last_name} onChange={e => setDraft({ ...draft, last_name: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Phone</label>
                <input className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400" value={draft.phone} onChange={e => setDraft({ ...draft, phone: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Email</label>
                <input className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400" value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Guests (+1s)</label>
                <input type="number" min={0} className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400" value={draft.guests} onChange={e => setDraft({ ...draft, guests: Math.max(0, parseInt(e.target.value) || 0) })} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Meeting</label>
                <select className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white" value={draft.event_id} onChange={e => setDraft({ ...draft, event_id: e.target.value })}>
                  <option value="">— unassigned —</option>
                  {events.map(ev => <option key={ev.id} value={ev.id}>{formatEventShort(ev)}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Notes</label>
              <textarea className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 h-20 resize-none" value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={draft.confirmed} onChange={e => setDraft({ ...draft, confirmed: e.target.checked })} />
                Confirmed
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={draft.attended} onChange={e => setDraft({ ...draft, attended: e.target.checked })} />
                Attended
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => { setEditingId(null); setDraft(null); }} className="px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded hover:bg-slate-50">Cancel</button>
              <button onClick={saveEdit} className="px-3 py-1.5 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded flex items-center gap-1"><Save className="w-4 h-4" />Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Responder Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-slate-500 uppercase border-b border-slate-200">
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3 hidden md:table-cell">Contact</th>
              <th className="px-4 py-3 hidden lg:table-cell">Location</th>
              <th className="px-4 py-3">Guests</th>
              <th className="px-4 py-3 hidden sm:table-cell">Meeting</th>
              <th className="px-4 py-3">Notes</th>
              {isMasterAdmin && <th className="px-4 py-3">Admin</th>}
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
                    {(responder.guests ?? 0) > 0 && (
                      <div className="text-xs text-slate-400">+{responder.guests} guest{responder.guests === 1 ? '' : 's'}</div>
                    )}
                    <div className="text-xs text-slate-500 md:hidden">{responder.phone}</div>
                  </td>

                  {/* Contact */}
                  <td className="px-4 py-3 hidden md:table-cell">
                    <div className="flex flex-col gap-1">
                      {responder.phone && (
                        <a href={`tel:${responder.phone}`} className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 transition-colors">
                          <Phone className="w-3 h-3" />{responder.phone}
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
                    {responder.notes ? (
                      <span className="text-xs text-slate-500 truncate max-w-[120px] block" title={responder.notes}>{responder.notes}</span>
                    ) : (
                      <span className="text-xs text-slate-400 italic">—</span>
                    )}
                  </td>

                  {/* Admin actions */}
                  {isMasterAdmin && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(responder)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                          title="Edit"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(responder)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  )}
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

        {filteredResponders.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No responders found</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResponderList;
