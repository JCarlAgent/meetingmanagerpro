import React, { useState } from 'react';
import { Responder, Campaign, Event } from '@/types';
import { 
  Users, 
  Search, 
  Download,
  CheckCircle2,
  XCircle,
  Phone,
  Mail,
  MessageSquare,
  Edit3,
  Save,
  X,
  QrCode,
  PhoneCall,
  UserPlus,
  Printer
} from 'lucide-react';

interface RespondersViewProps {
  responders: Responder[];
  campaigns: Campaign[];
  events: Event[];
  onUpdateResponder: (responderId: string, updates: Partial<Responder>) => void;
}

const RespondersView: React.FC<RespondersViewProps> = ({ 
  responders, 
  campaigns, 
  events,
  onUpdateResponder 
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'confirmed' | 'unconfirmed'>('all');
  const [campaignFilter, setCampaignFilter] = useState<string>('all');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [printMode, setPrintMode] = useState<'none' | 'notes' | 'signin'>('none');

  const filteredResponders = responders.filter(r => {
    if (statusFilter === 'confirmed' && !r.confirmed) return false;
    if (statusFilter === 'unconfirmed' && r.confirmed) return false;
    if (campaignFilter !== 'all' && r.campaign_id !== campaignFilter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        r.first_name.toLowerCase().includes(query) ||
        r.last_name.toLowerCase().includes(query) ||
        r.email?.toLowerCase().includes(query) ||
        r.phone?.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const getCampaignProjectId = (campaignId: string) => {
    const campaign = campaigns.find(c => c.id === campaignId);
    return campaign?.project_id || 'N/A';
  };

  const getEventInfo = (eventId: string | null) => {
    if (!eventId) return null;
    const event = events.find(e => e.id === eventId);
    if (!event) return null;
    return {
      venue: event.venue_name,
      date: new Date(event.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    };
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'qr_code': return <QrCode className="w-4 h-4 text-purple-400" />;
      case 'call_center': return <PhoneCall className="w-4 h-4 text-blue-400" />;
      case 'manual': return <UserPlus className="w-4 h-4 text-green-400" />;
      default: return null;
    }
  };

  const handleStartEditNote = (responder: Responder) => {
    setEditingNoteId(responder.id);
    setNoteText(responder.notes || '');
  };

  const handleSaveNote = (responderId: string) => {
    onUpdateResponder(responderId, { notes: noteText });
    setEditingNoteId(null);
    setNoteText('');
  };

  const exportToCSV = () => {
    const headers = ['Campaign', 'First Name', 'Last Name', 'Email', 'Phone', 'City', 'State', 'ZIP', 'Guests', 'Source', 'Confirmed', 'Notes'];
    const rows = filteredResponders.map(r => [
      getCampaignProjectId(r.campaign_id),
      r.first_name,
      r.last_name,
      r.email,
      r.phone,
      r.city,
      r.state,
      r.zip,
      r.guests,
      r.response_source,
      r.confirmed ? 'Yes' : 'No',
      r.notes || ''
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'responders_export.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`space-y-6 ${printMode !== 'none' ? 'print:!p-0 print:!space-y-0 print:!w-full print:!h-full' : ''}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-red-400" />
          <h2 className="text-xl font-semibold text-slate-900">All Responders</h2>
          <span className="bg-slate-700 text-white px-2 py-0.5 rounded-full text-sm">
            {filteredResponders.length}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              setPrintMode('notes');
              setTimeout(() => window.print(), 100);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">Print Notes</span>
          </button>
          
          <button
            onClick={() => {
              setPrintMode('signin');
              setTimeout(() => window.print(), 100);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">Print Sign-in</span>
          </button>

          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {printMode !== 'none' && (
        <div className="hidden print:block text-black bg-white min-h-screen p-8 absolute top-0 left-0 w-full z-50">
          <div className="mb-8 border-b-2 border-black pb-4">
            <h1 className="text-3xl font-bold text-black mb-2">
              {printMode === 'notes' ? 'Advisor Notes & Demographics' : 'Event Sign-in Sheet'}
            </h1>
            <p className="text-gray-600">Printed on {new Date().toLocaleDateString()}</p>
          </div>
          
          <div className="w-full">
            {printMode === 'notes' ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className="border-b border-black py-2 font-semibold">Name & Contact</th>
                    <th className="border-b border-black py-2 font-semibold w-1/4">Demographics</th>
                    <th className="border-b border-black py-2 font-semibold w-1/2">Meeting Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResponders.map(r => (
                    <tr key={r.id} className="border-b border-gray-300">
                      <td className="py-6 align-top">
                        <div className="font-bold text-lg">{r.first_name} {r.last_name}</div>
                        <div className="text-sm text-gray-600 font-mono mt-1">{r.phone || 'No phone'}</div>
                      </td>
                      <td className="py-6 align-top">
                        {r.income && <div><span className="font-semibold">Income:</span> {r.income}</div>}
                        {r.age && <div><span className="font-semibold">Age:</span> {r.age}</div>}
                        {r.ipa && <div><span className="font-semibold">IPA:</span> {r.ipa}</div>}
                        {!r.income && !r.age && !r.ipa && <span className="text-gray-400 italic">No demo data</span>}
                      </td>
                      <td className="py-6">
                        {/* Huge blank space for writing notes */}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-black py-4 px-4 font-semibold text-lg">Attendee Name</th>
                    <th className="border border-black py-4 px-4 font-semibold text-lg w-24 text-center">Guests</th>
                    <th className="border border-black py-4 px-4 font-semibold w-1/2 text-lg">Signature / Arrival Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResponders.map(r => (
                    <tr key={r.id}>
                      <td className="border border-black py-6 px-4 align-middle">
                        <div className="font-bold text-xl">{r.first_name} {r.last_name}</div>
                      </td>
                      <td className="border border-black py-6 px-4 text-center text-xl font-bold align-middle">
                        {r.guests > 1 ? `+${r.guests - 1}` : ''}
                      </td>
                      <td className="border border-black py-6 px-4 align-bottom">
                      </td>
                    </tr>
                  ))}
                  {/* Append some blank rows for walk-ins */}
                  {Array.from({ length: 5 }).map((_, i) => (
                    <tr key={`blank-${i}`}>
                      <td className="border border-black py-8 px-4"></td>
                      <td className="border border-black py-8 px-4"></td>
                      <td className="border border-black py-8 px-4"></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Filters (Hidden during print) */}
      <div className="flex flex-wrap items-center gap-3 bg-white rounded-xl border border-slate-200 p-4 print:hidden">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, email, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/50"
          />
        </div>

        <select
          value={campaignFilter}
          onChange={(e) => setCampaignFilter(e.target.value)}
          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/50"
        >
          <option value="all">All Campaigns</option>
          {campaigns.map(c => (
            <option key={c.id} value={c.id}>#{c.project_id}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/50"
        >
          <option value="all">All Status</option>
          <option value="confirmed">Confirmed</option>
          <option value="unconfirmed">Unconfirmed</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden print:hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-slate-800">
            <thead>
              <tr className="text-left text-xs text-slate-700 uppercase border-b border-slate-200">
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Campaign</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3 hidden md:table-cell">Contact</th>
                <th className="px-4 py-3 hidden lg:table-cell">Event</th>
                <th className="px-4 py-3">Guests</th>
                <th className="px-4 py-3 hidden sm:table-cell">Source</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredResponders.map((responder) => {
                const eventInfo = getEventInfo(responder.event_id);
                return (
                  <tr 
                    key={responder.id} 
                    className={`hover:bg-white/5 transition-colors ${!responder.confirmed ? 'bg-amber-500/5' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onUpdateResponder(responder.id, { confirmed: !responder.confirmed })}
                        className={`p-1.5 rounded-lg transition-colors ${
                          responder.confirmed 
                            ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' 
                            : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                        }`}
                      >
                        {responder.confirmed ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className="bg-green-600 text-white px-2 py-0.5 rounded text-xs font-bold">
                        #{getCampaignProjectId(responder.campaign_id)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{responder.first_name} {responder.last_name}</div>
                      <div className="text-xs text-slate-600">{responder.city}, {responder.state}</div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex flex-col gap-1">
                        {responder.phone && (
                          <a href={`tel:${responder.phone}`} className="flex items-center gap-1 text-sm text-slate-800 hover:text-slate-900">
                            <Phone className="w-3 h-3" />
                            {responder.phone}
                          </a>
                        )}
                        {responder.email && (
                          <a href={`mailto:${responder.email}`} className="flex items-center gap-1 text-xs text-slate-800 hover:text-slate-900 truncate max-w-[150px]">
                            <Mail className="w-3 h-3" />
                            {responder.email}
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {eventInfo ? (
                        <div className="text-sm">
                          <div className="text-slate-900">{eventInfo.venue}</div>
                          <div className="text-xs text-slate-600">{eventInfo.date}</div>
                        </div>
                      ) : (
                        <span className="text-slate-600 text-sm">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-slate-900 font-medium">{responder.guests}</span>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="flex items-center gap-2">
                        {getSourceIcon(responder.response_source)}
                        <span className="text-xs text-slate-600 capitalize">
                          {responder.response_source.replace('_', ' ')}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {editingNoteId === responder.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 w-28"
                            autoFocus
                          />
                          <button onClick={() => handleSaveNote(responder.id)} className="p-1 text-green-400 hover:text-green-300">
                            <Save className="w-4 h-4" />
                          </button>
                          <button onClick={() => setEditingNoteId(null)} className="p-1 text-slate-400 hover:text-white">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 cursor-pointer group" onClick={() => handleStartEditNote(responder)}>
                          {responder.notes ? (
                            <span className="text-sm text-slate-800 truncate max-w-[100px]" title={responder.notes}>
                              {responder.notes}
                            </span>
                          ) : (
                            <span className="text-sm text-slate-600 italic">Add note...</span>
                          )}
                          <Edit3 className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-colors">
                          <MessageSquare className="w-4 h-4" />
                        </button>
                        <a href={`tel:${responder.phone}`} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-colors">
                          <Phone className="w-4 h-4" />
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredResponders.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-600">No responders found</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RespondersView;
