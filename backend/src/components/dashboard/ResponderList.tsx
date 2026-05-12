import React, { useState } from 'react';
import { Responder, Event } from '@/types';
import { 
  CheckCircle2, 
  XCircle, 
  MessageSquare, 
  Phone, 
  Mail,
  Edit3,
  Save,
  X,
  Users,
  QrCode,
  PhoneCall,
  UserPlus
} from 'lucide-react';

interface ResponderListProps {
  responders: Responder[];
  events: Event[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string | null) => void;
  onUpdateResponder: (responderId: string, updates: Partial<Responder>) => void;
}

const ResponderList: React.FC<ResponderListProps> = ({
  responders,
  events,
  selectedEventId,
  onSelectEvent,
  onUpdateResponder
}) => {
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'unconfirmed'>('all');

  const filteredResponders = responders.filter(r => {
    if (selectedEventId && r.event_id !== selectedEventId) return false;
    if (filter === 'confirmed') return r.confirmed;
    if (filter === 'unconfirmed') return !r.confirmed;
    return true;
  });

  const handleStartEditNote = (responder: Responder) => {
    setEditingNoteId(responder.id);
    setNoteText(responder.notes || '');
  };

  const handleSaveNote = (responderId: string) => {
    onUpdateResponder(responderId, { notes: noteText });
    setEditingNoteId(null);
    setNoteText('');
  };

  const handleToggleConfirmed = (responder: Responder) => {
    onUpdateResponder(responder.id, { confirmed: !responder.confirmed });
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'qr_code': return <QrCode className="w-4 h-4 text-purple-400" />;
      case 'call_center': return <PhoneCall className="w-4 h-4 text-blue-400" />;
      case 'manual': return <UserPlus className="w-4 h-4 text-green-400" />;
      default: return null;
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  return (
    <div className="bg-white text-slate-900">
      {/* Event Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 p-4 border-b border-slate-200">
          <button
            onClick={() => onSelectEvent(null)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            selectedEventId === null 
              ? 'bg-red-600 text-white' 
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          All Events
        </button>
        {events.map((event, index) => (
          <button
            key={event.id}
            onClick={() => onSelectEvent(event.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              selectedEventId === event.id 
                ? 'bg-red-600 text-white' 
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {formatDate(event.event_date)} @ {formatTime(event.event_time)}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
          >
            <option value="all">All Status</option>
            <option value="confirmed">Confirmed</option>
            <option value="unconfirmed">Unconfirmed</option>
          </select>
        </div>
      </div>

      {/* Responder Count */}
        <div className="px-4 py-2 border-b border-slate-200">
        <span className="text-sm text-slate-600">
          Showing <span className="font-semibold text-slate-900">{filteredResponders.length}</span> responders
        </span>
      </div>

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
              <th className="px-4 py-3 hidden sm:table-cell">Source</th>
              <th className="px-4 py-3">Notes</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredResponders.map((responder) => (
              <tr 
                key={responder.id} 
                className={`hover:bg-slate-50 transition-colors ${
                  responder.confirmed ? '' : 'bg-amber-50'
                }`}
              >
                {/* Status */}
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleToggleConfirmed(responder)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      responder.confirmed 
                        ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' 
                        : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                    }`}
                    title={responder.confirmed ? 'Confirmed' : 'Not Confirmed'}
                  >
                    {responder.confirmed ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <XCircle className="w-5 h-5" />
                    )}
                  </button>
                </td>

                {/* Name */}
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">
                    {responder.first_name} {responder.last_name}
                  </div>
                  <div className="text-xs text-slate-600 md:hidden">
                    {responder.phone}
                  </div>
                </td>

                {/* Contact */}
                <td className="px-4 py-3 hidden md:table-cell">
                  <div className="flex flex-col gap-1">
                    {responder.phone && (
                      <a href={`tel:${responder.phone}`} className="flex items-center gap-1 text-sm text-slate-300 hover:text-white transition-colors">
                        <Phone className="w-3 h-3" />
                        {responder.phone}
                      </a>
                    )}
                    {responder.email && (
                      <a href={`mailto:${responder.email}`} className="flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors truncate max-w-[180px]">
                        <Mail className="w-3 h-3" />
                        {responder.email}
                      </a>
                    )}
                  </div>
                </td>

                {/* Location */}
                <td className="px-4 py-3 hidden lg:table-cell">
                  <div className="text-sm text-slate-700">
                    {responder.city}, {responder.state} {responder.zip}
                  </div>
                </td>

                {/* Guests */}
                <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Users className="w-4 h-4 text-slate-400" />
                      <span className="text-slate-900 font-medium">{responder.guests}</span>
                    </div>
                </td>

                {/* Source */}
                <td className="px-4 py-3 hidden sm:table-cell">
                  <div className="flex items-center gap-2">
                    {getSourceIcon(responder.response_source)}
                    <span className="text-xs text-slate-400 capitalize">
                      {responder.response_source.replace('_', ' ')}
                    </span>
                  </div>
                </td>

                {/* Notes */}
                    <td className="px-4 py-3">
                  {editingNoteId === responder.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 w-32"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveNote(responder.id)}
                        className="p-1 text-green-400 hover:text-green-300 transition-colors"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditingNoteId(null)}
                        className="p-1 text-slate-400 hover:text-white transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div 
                      className="flex items-center gap-2 cursor-pointer group"
                      onClick={() => handleStartEditNote(responder)}
                    >
                      {responder.notes ? (
                        <span className="text-sm text-slate-300 truncate max-w-[120px]" title={responder.notes}>
                          {responder.notes}
                        </span>
                      ) : (
                        <span className="text-sm text-slate-500 italic">Add note...</span>
                      )}
                      <Edit3 className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  )}
                </td>

                {/* Actions */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button 
                      className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-colors"
                      title="Send Message"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
                    <a 
                      href={`tel:${responder.phone}`}
                      className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-colors"
                      title="Call"
                    >
                      <Phone className="w-4 h-4" />
                    </a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredResponders.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <p className="text-slate-600">No responders found</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResponderList;
