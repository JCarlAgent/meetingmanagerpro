import React, { useState } from 'react';
import { Event, Campaign, Responder } from '@/types';
import { 
  Calendar, 
  MapPin, 
  Clock, 
  Users, 
  ChevronRight,
  CheckCircle2,
  XCircle,
  Eye
} from 'lucide-react';
import EventDetailView from './EventDetailView';

interface EventsViewProps {
  events: Event[];
  campaigns: Campaign[];
  responders: Responder[];
  onUpdateResponder: (responderId: string, updates: Partial<Responder>) => void;
}

const EventsView: React.FC<EventsViewProps> = ({ events, campaigns, responders, onUpdateResponder }) => {
  const [selectedEvent, setSelectedEvent] = useState<{ event: Event; campaign: Campaign } | null>(null);
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'past'>('all');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const filteredEvents = events.filter(event => {
    const eventDate = new Date(event.event_date);
    if (filter === 'upcoming') return eventDate >= today;
    if (filter === 'past') return eventDate < today;
    return true;
  });

  const getEventResponders = (eventId: string) => responders.filter(r => r.event_id === eventId);
  const getCampaign = (campaignId: string) => campaigns.find(c => c.id === campaignId);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short',
      month: 'short', 
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

  const isUpcoming = (dateStr: string) => {
    const eventDate = new Date(dateStr);
    return eventDate >= today;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Calendar className="w-6 h-6 text-red-400" />
          <h2 className="text-xl font-semibold text-white">Events</h2>
        </div>

        <div className="flex items-center gap-2">
          {['all', 'upcoming', 'past'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f as any)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === f 
                  ? 'bg-red-600 text-white' 
                  : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Events Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredEvents.map((event) => {
          const campaign = getCampaign(event.campaign_id);
          const eventResponders = getEventResponders(event.id);
          const totalGuests = eventResponders.reduce((sum, r) => sum + (r.guests || 0), 0);
          const totalSeats = eventResponders.length + totalGuests;
          const confirmedCount = eventResponders.filter(r => r.confirmed).length;
          const upcoming = isUpcoming(event.event_date);

          return (
            <div 
              key={event.id}
              className={`bg-slate-800/50 backdrop-blur rounded-xl border overflow-hidden transition-all hover:border-white/30 ${
                upcoming ? 'border-green-500/30' : 'border-white/10'
              }`}
            >
              {/* Event Header */}
              <div className={`px-4 py-3 border-b border-white/10 ${
                upcoming ? 'bg-green-500/10' : 'bg-slate-900/50'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="bg-green-600 text-white px-2 py-0.5 rounded text-sm font-bold">
                    #{campaign?.project_id}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    event.status === 'open' ? 'bg-green-500/20 text-green-400' :
                    event.status === 'full' ? 'bg-amber-500/20 text-amber-400' :
                    'bg-slate-500/20 text-slate-400'
                  }`}>
                    {event.status}
                  </span>
                </div>
              </div>

              {/* Event Details */}
              <div className="p-4">
                <h3 className="text-lg font-semibold text-white mb-2">{event.venue_name}</h3>
                
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-slate-400">
                    <MapPin className="w-4 h-4" />
                    <span>{event.venue_city}, {event.venue_state}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <Calendar className="w-4 h-4" />
                    <span>{formatDate(event.event_date)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <Clock className="w-4 h-4" />
                    <span>{formatTime(event.event_time)}</span>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-white/10">
                  <div className="text-center">
                    <div className="text-lg font-bold text-cyan-400">{eventResponders.length}</div>
                    <div className="text-xs text-slate-500">Responders</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-green-400">{confirmedCount}</div>
                    <div className="text-xs text-slate-500">Confirmed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-purple-400">{totalGuests}</div>
                    <div className="text-xs text-slate-500">Guests</div>
                  </div>
                </div>

                {/* Capacity Bar */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                    <span>Capacity</span>
                    <span>{totalSeats} / {event.max_capacity}</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full transition-all ${
                        totalSeats >= event.max_capacity ? 'bg-red-500' :
                        totalSeats >= event.max_capacity * 0.8 ? 'bg-amber-500' :
                        'bg-green-500'
                      }`}
                      style={{ width: `${Math.min((totalSeats / event.max_capacity) * 100, 100)}%` }}
                    ></div>
                  </div>
                </div>

                {/* View Button */}
                <button
                  onClick={() => campaign && setSelectedEvent({ event, campaign })}
                  className="w-full mt-4 flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  View Details
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredEvents.length === 0 && (
        <div className="text-center py-12 bg-slate-800/30 rounded-xl border border-white/10">
          <Calendar className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No events found</p>
        </div>
      )}

      {/* Event Detail Modal */}
      {selectedEvent && (
        <EventDetailView
          campaign={selectedEvent.campaign}
          event={selectedEvent.event}
          responders={responders.filter(r => r.event_id === selectedEvent.event.id)}
          onClose={() => setSelectedEvent(null)}
          onUpdateResponder={onUpdateResponder}
        />
      )}
    </div>
  );
};

export default EventsView;
