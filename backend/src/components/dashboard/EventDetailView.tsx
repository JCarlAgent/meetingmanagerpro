import React, { useState } from 'react';
import { Event, Responder, Campaign } from '@/types';
import { 
  MapPin, 
  Phone, 
  Calendar, 
  Clock, 
  Users, 
  ExternalLink,
  CheckCircle2,
  XCircle,
  UserCheck,
  UserX,
  Mail,
  MessageSquare,
  Download,
  Printer
} from 'lucide-react';

interface EventDetailViewProps {
  campaign: Campaign;
  event: Event;
  responders: Responder[];
  onClose: () => void;
  onUpdateResponder: (responderId: string, updates: Partial<Responder>) => void;
}

const EventDetailView: React.FC<EventDetailViewProps> = ({
  campaign,
  event,
  responders,
  onClose,
  onUpdateResponder
}) => {
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'unconfirmed' | 'attended'>('all');

  const eventResponders = responders.filter(r => r.event_id === event.id);
  const totalGuests = eventResponders.reduce((sum, r) => sum + (r.guests || 0), 0);
  const totalSeats = eventResponders.length + totalGuests;
  const confirmedCount = eventResponders.filter(r => r.confirmed).length;
  const attendedCount = eventResponders.filter(r => r.attended).length;

  const filteredResponders = eventResponders.filter(r => {
    if (filter === 'confirmed') return r.confirmed;
    if (filter === 'unconfirmed') return !r.confirmed;
    if (filter === 'attended') return r.attended;
    return true;
  });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      month: 'long', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const exportToCSV = () => {
    const headers = ['First Name', 'Last Name', 'Email', 'Phone', 'City', 'State', 'ZIP', 'Guests', 'Confirmed', 'Attended', 'Notes'];
    const rows = eventResponders.map(r => [
      r.first_name,
      r.last_name,
      r.email,
      r.phone,
      r.city,
      r.state,
      r.zip,
      r.guests,
      r.confirmed ? 'Yes' : 'No',
      r.attended ? 'Yes' : 'No',
      r.notes || ''
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `event_${event.id}_responders.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-slate-800 rounded-2xl border border-white/10 w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-5 border-b border-white/10">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="bg-green-600 text-white px-3 py-1 rounded-lg font-bold">
                  #{campaign.project_id}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase ${
                  event.status === 'open' ? 'bg-green-500/20 text-green-400' :
                  event.status === 'full' ? 'bg-amber-500/20 text-amber-400' :
                  'bg-slate-500/20 text-slate-400'
                }`}>
                  {event.status}
                </span>
              </div>
              <h2 className="text-2xl font-bold text-white">{event.venue_name}</h2>
              <div className="flex items-center gap-4 mt-2 text-slate-400">
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {event.venue_city}, {event.venue_state}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {formatDate(event.event_date)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {formatTime(event.event_time)}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 p-6 bg-slate-900/50 border-b border-white/10">
          <div className="text-center">
            <div className="text-3xl font-bold text-cyan-400">{eventResponders.length}</div>
            <div className="text-xs text-slate-400 uppercase">Responders</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-purple-400">{totalGuests}</div>
            <div className="text-xs text-slate-400 uppercase">Guests</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-green-400">{confirmedCount}</div>
            <div className="text-xs text-slate-400 uppercase">Confirmed</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-amber-400">{attendedCount}</div>
            <div className="text-xs text-slate-400 uppercase">Attended</div>
          </div>
        </div>

        {/* Actions Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            {['all', 'confirmed', 'unconfirmed', 'attended'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f as any)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filter === f 
                    ? 'bg-red-600 text-white' 
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 text-slate-300 hover:bg-slate-600 rounded-lg text-sm transition-colors"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
            <button className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 text-slate-300 hover:bg-slate-600 rounded-lg text-sm transition-colors">
              <Printer className="w-4 h-4" />
              Print Badges
            </button>
          </div>
        </div>

        {/* Responder List */}
        <div className="overflow-y-auto max-h-[40vh]">
          <table className="w-full">
            <thead className="sticky top-0 bg-slate-800">
              <tr className="text-left text-xs text-slate-400 uppercase border-b border-white/10">
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Guests</th>
                <th className="px-4 py-3">Attended</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredResponders.map((responder) => (
                <tr key={responder.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onUpdateResponder(responder.id, { confirmed: !responder.confirmed })}
                      className={`p-1.5 rounded-lg transition-colors ${
                        responder.confirmed 
                          ? 'bg-green-500/20 text-green-400' 
                          : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                      }`}
                    >
                      {responder.confirmed ? <UserCheck className="w-5 h-5" /> : <UserX className="w-5 h-5" />}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{responder.first_name} {responder.last_name}</div>
                    <div className="text-xs text-slate-500">{responder.city}, {responder.state}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <a href={`tel:${responder.phone}`} className="flex items-center gap-1 text-sm text-slate-300 hover:text-white">
                        <Phone className="w-3 h-3" />
                        {responder.phone}
                      </a>
                      {responder.email && (
                        <a href={`mailto:${responder.email}`} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white truncate max-w-[150px]">
                          <Mail className="w-3 h-3" />
                          {responder.email}
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-white font-medium">{responder.guests}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onUpdateResponder(responder.id, { attended: !responder.attended })}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                        responder.attended 
                          ? 'bg-amber-500/20 text-amber-400' 
                          : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                      }`}
                    >
                      {responder.attended ? 'Attended' : 'Mark Attended'}
                    </button>
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
              ))}
            </tbody>
          </table>

          {filteredResponders.length === 0 && (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">No responders found</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-slate-900/50">
          <div className="text-sm text-slate-400">
            Capacity: <span className="text-white font-medium">{totalSeats}</span> / {event.max_capacity} seats
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default EventDetailView;
