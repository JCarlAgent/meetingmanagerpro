import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Campaign, Event } from '@/types';
import { X, UserPlus, AlertCircle } from 'lucide-react';

interface AddResponderModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaigns: Campaign[];
  events: Event[];
  onSuccess: () => void;
}

const AddResponderModal: React.FC<AddResponderModalProps> = ({
  isOpen,
  onClose,
  campaigns,
  events,
  onSuccess
}) => {
  const [formData, setFormData] = useState({
    campaign_id: '',
    event_id: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    city: '',
    state: '',
    zip: '',
    guests: 0,
    notes: '',
    income: '',
    age: '',
    ipa: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const activeCampaigns = campaigns.filter(c => c.status === 'active' || c.status === 'pending');
  const campaignEvents = events.filter(e => e.campaign_id === formData.campaign_id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.campaign_id || !formData.first_name || !formData.last_name) {
      setError('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);

    try {
      const { error: insertError } = await supabase.from('responders').insert({
        campaign_id: formData.campaign_id,
        event_id: formData.event_id || null,
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        phone: formData.phone,
        city: formData.city,
        state: formData.state,
        zip: formData.zip,
        guests: formData.guests,
        notes: formData.notes,
        income: formData.income,
        age: formData.age,
        ipa: formData.ipa,
        response_source: 'manual',
        confirmed: false,
        attended: false,
      });

      if (insertError) throw insertError;

      onSuccess();
      onClose();
      setFormData({
        campaign_id: '',
        event_id: '',
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        city: '',
        state: '',
        zip: '',
        guests: 0,
        notes: '',
        income: '',
        age: '',
        ipa: '',
      });
    } catch (err) {
      console.error('Error adding responder:', err);
      setError('Failed to add responder. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-slate-800 rounded-2xl border border-white/10 w-full max-w-lg max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <UserPlus className="w-5 h-5 text-green-400" />
            </div>
            <h2 className="text-xl font-semibold text-white">Add Responder</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[60vh]">
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-400">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <div className="space-y-4">
            {/* Campaign Selection */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">Campaign *</label>
              <select
                value={formData.campaign_id}
                onChange={(e) => setFormData({ ...formData, campaign_id: e.target.value, event_id: '' })}
                className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
                required
              >
                <option value="">Select campaign...</option>
                {activeCampaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    #{campaign.project_id} - {campaign.template_type.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>

            {/* Event Selection */}
            {formData.campaign_id && campaignEvents.length > 0 && (
              <div>
                <label className="block text-sm text-slate-400 mb-1">Event</label>
                <select
                  value={formData.event_id}
                  onChange={(e) => setFormData({ ...formData, event_id: e.target.value })}
                  className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
                >
                  <option value="">Select event...</option>
                  {campaignEvents.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.venue_name} - {new Date(event.event_date).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Name */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-slate-400 mb-1">First Name *</label>
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  placeholder="John"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Last Name *</label>
                <input
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  placeholder="Doe"
                  required
                />
              </div>
            </div>

            {/* Contact */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  placeholder="john@email.com"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  placeholder="919-555-0100"
                />
              </div>
            </div>

            {/* Location */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm text-slate-400 mb-1">City</label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  placeholder="Raleigh"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">State</label>
                <input
                  type="text"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  placeholder="NC"
                  maxLength={2}
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">ZIP</label>
                <input
                  type="text"
                  value={formData.zip}
                  onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                  className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  placeholder="27609"
                />
              </div>
            </div>

            {/* Guests */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">Number of Guests</label>
              <input
                type="number"
                value={formData.guests}
                onChange={(e) => setFormData({ ...formData, guests: parseInt(e.target.value) || 0 })}
                className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
                min="0"
                max="10"
              />
            </div>

            {/* Demographics */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Estimated Income</label>
                <input
                  type="text"
                  value={formData.income}
                  onChange={(e) => setFormData({ ...formData, income: e.target.value })}
                  className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  placeholder="$100k+"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Age</label>
                <input
                  type="text"
                  value={formData.age}
                  onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                  className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  placeholder="65+"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">IPA (Assets)</label>
                <input
                  type="text"
                  value={formData.ipa}
                  onChange={(e) => setFormData({ ...formData, ipa: e.target.value })}
                  className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  placeholder="$500k+"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 resize-none"
                rows={3}
                placeholder="Any additional notes..."
              />
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10 bg-slate-900/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Adding...</span>
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                <span>Add Responder</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddResponderModal;
