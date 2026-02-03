import React, { useState } from 'react';
import { 
  X, 
  ChevronRight, 
  ChevronLeft,
  MapPin,
  Calendar,
  Clock,
  Users,
  FileText,
  Upload,
  Check,
  Plus,
  Trash2
} from 'lucide-react';

interface NewCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
}

interface EventData {
  venue_name: string;
  venue_address: string;
  venue_city: string;
  venue_state: string;
  event_date: string;
  event_time: string;
  max_capacity: number;
}

const NewCampaignModal: React.FC<NewCampaignModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    template_type: 'financial',
    mail_quantity: 5000,
    mail_piece_size: '8.5x4.5',
    mail_piece_type: 'Folded Self-Mailer',
    events: [
      {
        venue_name: '',
        venue_address: '',
        venue_city: '',
        venue_state: '',
        event_date: '',
        event_time: '18:30',
        max_capacity: 25
      }
    ] as EventData[]
  });

  const templates = [
    { id: 'financial', name: 'Financial Planning', description: 'Retirement & wealth management seminars' },
  ];

  const addEvent = () => {
    if (formData.events.length < 4) {
      setFormData({
        ...formData,
        events: [
          ...formData.events,
          {
            venue_name: formData.events[0]?.venue_name || '',
            venue_address: formData.events[0]?.venue_address || '',
            venue_city: formData.events[0]?.venue_city || '',
            venue_state: formData.events[0]?.venue_state || '',
            event_date: '',
            event_time: '18:30',
            max_capacity: 25
          }
        ]
      });
    }
  };

  const removeEvent = (index: number) => {
    if (formData.events.length > 1) {
      setFormData({
        ...formData,
        events: formData.events.filter((_, i) => i !== index)
      });
    }
  };

  const updateEvent = (index: number, field: keyof EventData, value: string | number) => {
    const newEvents = [...formData.events];
    newEvents[index] = { ...newEvents[index], [field]: value };
    setFormData({ ...formData, events: newEvents });
  };

  const handleSubmit = () => {
    onSubmit(formData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Create New Campaign</h2>
            <p className="text-sm text-slate-600">Step {step} of 4</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-6 py-3 bg-slate-50">
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className="flex-1">
                <div className={`h-1.5 rounded-full transition-colors ${s <= step ? 'bg-red-500' : 'bg-slate-200'}`} />
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-xs text-slate-500">
            <span>Template</span>
            <span>Events</span>
            <span>Details</span>
            <span>Review</span>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[50vh]">
          {/* Step 1: Template Selection */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-slate-900 mb-1">Select your template</h3>
              <p className="text-sm text-slate-600">v1 is financial-planner-first. Medicare templates are next.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => setFormData({ ...formData, template_type: template.id })}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      formData.template_type === template.id
                        ? 'bg-red-50 border-red-200 text-slate-900'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold">{template.name}</span>
                      {formData.template_type === template.id && (
                        <Check className="w-5 h-5 text-red-500" />
                      )}
                    </div>
                    <p className="text-sm text-slate-600">{template.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Event Details */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-white">Schedule Your Events</h3>
                {formData.events.length < 4 && (
                  <button
                    onClick={addEvent}
                    className="flex items-center gap-1 text-sm text-red-400 hover:text-red-300 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Event
                  </button>
                )}
              </div>
              
              {formData.events.map((event, index) => (
                <div key={index} className="bg-slate-900/50 rounded-xl p-4 border border-white/10">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-white">Event {index + 1}</span>
                    {formData.events.length > 1 && (
                      <button
                        onClick={() => removeEvent(index)}
                        className="p-1 text-slate-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs text-slate-400 mb-1">Venue Name</label>
                      <input
                        type="text"
                        value={event.venue_name}
                        onChange={(e) => updateEvent(index, 'venue_name', e.target.value)}
                        className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                        placeholder="Ruth's Chris Steak House"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs text-slate-400 mb-1">Address</label>
                      <input
                        type="text"
                        value={event.venue_address}
                        onChange={(e) => updateEvent(index, 'venue_address', e.target.value)}
                        className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                        placeholder="123 Main Street"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">City</label>
                      <input
                        type="text"
                        value={event.venue_city}
                        onChange={(e) => updateEvent(index, 'venue_city', e.target.value)}
                        className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                        placeholder="Raleigh"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">State</label>
                      <input
                        type="text"
                        value={event.venue_state}
                        onChange={(e) => updateEvent(index, 'venue_state', e.target.value)}
                        className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                        placeholder="NC"
                        maxLength={2}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Date</label>
                      <input
                        type="date"
                        value={event.event_date}
                        onChange={(e) => updateEvent(index, 'event_date', e.target.value)}
                        className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Time</label>
                      <input
                        type="time"
                        value={event.event_time}
                        onChange={(e) => updateEvent(index, 'event_time', e.target.value)}
                        className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Step 3: Mail Details */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-white mb-4">Mail Piece Details</h3>
              
              <div>
                <label className="block text-sm text-slate-400 mb-2">Mail Quantity</label>
                <div className="grid grid-cols-4 gap-2">
                  {[2500, 5000, 7500, 10000].map((qty) => (
                    <button
                      key={qty}
                      onClick={() => setFormData({ ...formData, mail_quantity: qty })}
                      className={`py-3 rounded-lg font-semibold transition-all ${
                        formData.mail_quantity === qty
                          ? 'bg-red-500 text-white'
                          : 'bg-slate-900/50 border border-white/10 text-slate-300 hover:border-white/30'
                      }`}
                    >
                      {qty.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">Mail Piece Size</label>
                <select
                  value={formData.mail_piece_size}
                  onChange={(e) => setFormData({ ...formData, mail_piece_size: e.target.value })}
                  className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
                >
                  <option value="8.5x4.5">8.5" x 4.5"</option>
                  <option value="8.5x5.5">8.5" x 5.5"</option>
                  <option value="6x9">6" x 9"</option>
                  <option value="6x11">6" x 11"</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">Mail Piece Type</label>
                <select
                  value={formData.mail_piece_type}
                  onChange={(e) => setFormData({ ...formData, mail_piece_type: e.target.value })}
                  className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
                >
                  <option value="Folded Self-Mailer">Folded Self-Mailer</option>
                  <option value="Postcard">Postcard</option>
                  <option value="Letter Package">Letter Package</option>
                </select>
              </div>

              <div className="bg-slate-900/50 rounded-xl p-4 border border-white/10">
                <div className="flex items-center gap-3 mb-3">
                  <Upload className="w-5 h-5 text-slate-400" />
                  <span className="font-medium text-white">Upload Demographic List</span>
                </div>
                <div className="border-2 border-dashed border-white/20 rounded-lg p-6 text-center hover:border-white/40 transition-colors cursor-pointer">
                  <p className="text-sm text-slate-400">Drag & drop your CSV file here, or click to browse</p>
                  <p className="text-xs text-slate-500 mt-1">Supports .csv files up to 10MB</p>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {step === 4 && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-white mb-4">Review Your Campaign</h3>
              
              <div className="bg-slate-900/50 rounded-xl p-4 border border-white/10">
                <h4 className="text-sm font-medium text-slate-400 mb-2">Template</h4>
                <p className="text-white capitalize">{formData.template_type.replace('_', ' ')}</p>
              </div>

              <div className="bg-slate-900/50 rounded-xl p-4 border border-white/10">
                <h4 className="text-sm font-medium text-slate-400 mb-2">Events ({formData.events.length})</h4>
                {formData.events.map((event, index) => (
                  <div key={index} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <span className="text-white">{event.venue_name || 'TBD'}</span>
                    <span className="text-slate-400">-</span>
                    <span className="text-slate-300">{event.event_date || 'Date TBD'}</span>
                  </div>
                ))}
              </div>

              <div className="bg-slate-900/50 rounded-xl p-4 border border-white/10">
                <h4 className="text-sm font-medium text-slate-400 mb-2">Mail Details</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500">Quantity</p>
                    <p className="text-white font-semibold">{formData.mail_quantity.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Size</p>
                    <p className="text-white font-semibold">{formData.mail_piece_size}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-slate-500">Type</p>
                    <p className="text-white font-semibold">{formData.mail_piece_type}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-slate-900/50">
          <button
            onClick={() => step > 1 && setStep(step - 1)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              step > 1 
                ? 'text-slate-300 hover:text-white hover:bg-white/10' 
                : 'text-slate-600 cursor-not-allowed'
            }`}
            disabled={step === 1}
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>

          {step < 4 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-2 rounded-lg transition-colors"
            >
              Continue
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-2 rounded-lg transition-colors"
            >
              <Check className="w-4 h-4" />
              Create Campaign
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default NewCampaignModal;
