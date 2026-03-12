import React, { useState } from 'react';
import { X, CheckCircle2, Loader2, Star, Calculator, Users, CalendarCheck, TrendingUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface PostMeetingROIModalProps {
  jobId: string;
  jobTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function PostMeetingROIModal({ jobId, jobTitle, isOpen, onClose, onSuccess }: PostMeetingROIModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [formData, setFormData] = useState({
    actual_attendees: '',
    buying_units: '',
    appointments_booked: '',
    estimated_sales: '',
    venue_rating: 5,
    notes: ''
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Authentication required");

      const { error } = await supabase
        .from('job_roi_reports')
        .insert({
          job_id: jobId,
          reported_by_user_id: user.id,
          actual_attendees: parseInt(formData.actual_attendees) || 0,
          buying_units: parseInt(formData.buying_units) || 0,
          appointments_booked: parseInt(formData.appointments_booked) || 0,
          estimated_sales: parseFloat(formData.estimated_sales) || 0,
          venue_rating: formData.venue_rating,
          notes: formData.notes
        });

      if (error) {
        if (error.code === '23505') { // Unique violation
          throw new Error("An ROI report already exists for this campaign.");
        }
        throw error;
      }

      onSuccess();
    } catch (err: any) {
      console.error("ROI Report Error:", err);
      setErrorMsg(err.message || "Failed to submit report. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Post-Meeting ROI Report</h2>
            <p className="text-sm text-gray-500 mt-1">Campaign: <span className="font-semibold text-gray-700">{jobTitle}</span></p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto">
          {errorMsg && (
            <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl border border-red-100 text-sm">
              {errorMsg}
            </div>
          )}

          <form id="roi-form" onSubmit={handleSubmit} className="space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="space-y-2">
                <label className="flex items-center text-sm font-medium text-gray-700">
                  <Users className="w-4 h-4 mr-2 text-blue-500" />
                  Total Attendees
                </label>
                <div className="relative">
                  <input
                    type="number"
                    required
                    min="0"
                    value={formData.actual_attendees}
                    onChange={(e) => setFormData({...formData, actual_attendees: e.target.value})}
                    className="w-full pl-4 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors"
                    placeholder="e.g. 42"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center text-sm font-medium text-gray-700">
                  <Calculator className="w-4 h-4 mr-2 text-indigo-500" />
                  Buying Units (Households)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    required
                    min="0"
                    value={formData.buying_units}
                    onChange={(e) => setFormData({...formData, buying_units: e.target.value})}
                    className="w-full pl-4 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors"
                    placeholder="e.g. 25"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center text-sm font-medium text-gray-700">
                  <CalendarCheck className="w-4 h-4 mr-2 text-green-500" />
                  Appointments Booked
                </label>
                <div className="relative">
                  <input
                    type="number"
                    required
                    min="0"
                    value={formData.appointments_booked}
                    onChange={(e) => setFormData({...formData, appointments_booked: e.target.value})}
                    className="w-full pl-4 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors"
                    placeholder="e.g. 14"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center text-sm font-medium text-gray-700">
                  <TrendingUp className="w-4 h-4 mr-2 text-emerald-500" />
                  Estimated Sales / Volume ($)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.estimated_sales}
                    onChange={(e) => setFormData({...formData, estimated_sales: e.target.value})}
                    className="w-full pl-8 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors"
                    placeholder="2500000"
                  />
                </div>
              </div>

            </div>

            <div className="pt-4 border-t border-gray-100">
              <label className="flex items-center text-sm font-medium text-gray-700 mb-3">
                <Star className="w-4 h-4 mr-2 text-amber-400" />
                How would you rate the venue?
              </label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((rating) => (
                  <button
                    key={rating}
                    type="button"
                    onClick={() => setFormData({...formData, venue_rating: rating})}
                    className={`p-3 rounded-xl flex-1 flex flex-col items-center justify-center gap-1 transition-all ${
                      formData.venue_rating === rating 
                        ? 'bg-amber-50 border-2 border-amber-400 text-amber-700 shadow-sm' 
                        : 'bg-gray-50 border-2 border-transparent text-gray-400 hover:bg-gray-100'
                    }`}
                  >
                    <Star className={`w-6 h-6 ${formData.venue_rating >= rating ? 'fill-amber-400 text-amber-400' : ''}`} />
                    <span className="text-xs font-semibold">{rating}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Additional Notes or Feedback (Optional)
              </label>
              <textarea
                rows={3}
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors resize-none"
                placeholder="How was the food? Did the audience fit the demographic?"
              />
            </div>

          </form>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="roi-form"
            disabled={isSubmitting}
            className="flex items-center px-6 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {isSubmitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5 mr-2" />
                Submit Report
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
