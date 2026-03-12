import React, { useState } from 'react';
import { Sparkles, ArrowRight, Loader2, MapPin, Users, Target, Calendar } from 'lucide-react';

export default function AiCampaignQuery() {
  const [query, setQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsProcessing(true);
    setShowResults(false);

    // Simulate AI orchestration delay (fetching map data, reasoning, etc.)
    setTimeout(() => {
      setIsProcessing(false);
      setShowResults(true);
    }, 2500);
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-8">
      {/* The Magic Bar */}
      <div className="relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
        <form onSubmit={handleSearch} className="relative flex items-center bg-white shadow-xl rounded-2xl overflow-hidden border border-gray-100">
          <div className="pl-6 text-indigo-500">
            <Sparkles className="w-6 h-6" />
          </div>
          <input
            type="text"
            className="w-full px-4 py-6 text-xl text-gray-800 placeholder-gray-400 bg-transparent border-none focus:outline-none focus:ring-0"
            placeholder="E.g., I want 50 qualified annuity leads in Dallas next month..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isProcessing}
          />
          <button
            type="submit"
            disabled={isProcessing || !query.trim()}
            className="flex items-center px-8 py-6 bg-indigo-50 text-indigo-600 font-semibold hover:bg-indigo-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <>
                <span className="mr-2">Optimize</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>
      </div>

      {/* Loading State Indicators */}
      {isProcessing && (
        <div className="flex flex-col items-center justify-center py-12 space-y-4 text-gray-500">
          <div className="flex items-center space-x-2">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
            <span className="animate-pulse">Analyzing historical campaign data...</span>
          </div>
          <p className="text-sm text-gray-400">Evaluating drive-time polygons and venue performance</p>
        </div>
      )}

      {/* Mock AI Proposal Results */}
      {showResults && (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">AI Campaign Proposal</h2>
              <p className="text-gray-500 mt-1">Optimized for maximum ROI based on historical performance.</p>
            </div>
            <div className="bg-green-50 text-green-700 px-4 py-2 rounded-full text-sm font-semibold flex items-center">
              <Target className="w-4 h-4 mr-2" />
              92% Success Confidence
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
              <div className="flex items-center text-gray-500 mb-2">
                <Users className="w-4 h-4 mr-2" />
                Target Audience
              </div>
              <p className="font-semibold text-lg text-gray-900">55-75 yrs, $100k+ Income</p>
              <p className="text-sm text-gray-500">$500k+ Investable Assets</p>
            </div>
            
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
              <div className="flex items-center text-gray-500 mb-2">
                <MapPin className="w-4 h-4 mr-2" />
                Recommended Venue
              </div>
              <p className="font-semibold text-lg text-gray-900">Ruth's Chris Steak House</p>
              <p className="text-sm text-gray-500">Uptown Dallas (15m Drive Zone)</p>
            </div>

            <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
              <div className="flex items-center text-gray-500 mb-2">
                <Calendar className="w-4 h-4 mr-2" />
                Optimal Timing
              </div>
              <p className="font-semibold text-lg text-gray-900">Tuesday, 4:30 PM</p>
              <p className="text-sm text-gray-500">Avoids rush hour & night driving</p>
            </div>

            <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
              <div className="flex items-center text-indigo-700 mb-2">
                <ArrowRight className="w-4 h-4 mr-2" />
                Mail Strategy
              </div>
              <p className="font-semibold text-lg text-indigo-900">8,500 Mailers</p>
              <p className="text-sm text-indigo-700">Estimated 52 Attendees</p>
            </div>
          </div>

          <div className="flex justify-end space-x-4 border-t pt-6">
            <button className="px-6 py-2 text-gray-600 hover:text-gray-900 font-medium transition-colors">
              Refine Parameters
            </button>
            <button className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors shadow-sm">
              Approve & Deploy Campaign
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
