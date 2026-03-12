import React, { useState } from 'react';
import { Sparkles, ArrowRight, Loader2, MapPin, Users, Target, Calendar } from 'lucide-react';
import { supabase } from '@/lib/supabase'; // Make sure Supabase is imported for Auth

interface AiProposal {
  targetAudience: { headline: string; subtext: string };
  recommendedVenue: { headline: string; subtext: string };
  optimalTiming: { headline: string; subtext: string };
  mailStrategy: { headline: string; subtext: string };
  confidenceScore: string;
}

export default function AiCampaignQuery() {
  const [query, setQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<AiProposal | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsProcessing(true);
    setResult(null);
    setErrorMsg('');

    try {
      // 1. Get the current user session token for the backend API
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('You must be logged in to use the AI Optimizer.');
      }

      // 2. Call our new Supabase Edge Function for Gemini
      const response = await supabase.functions.invoke('gemini-optimizer', {
        body: { query }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to analyze campaign request.');
      }
      
      if (response.data && response.data.error) {
        throw new Error(response.data.error);
      }

      // 3. Set the results!
      setResult(response.data);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'An unexpected error occurred during AI processing.');
    } finally {
      setIsProcessing(false);
    }
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

      {/* Error state */}
      {errorMsg && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 flex items-center justify-center fade-in slide-in-from-top-4 duration-500">
          {errorMsg}
        </div>
      )}

      {/* Mock AI Proposal Results */}
      {result && (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">AI Campaign Proposal</h2>
              <p className="text-gray-500 mt-1">Optimized for maximum ROI based on real-world constraints.</p>
            </div>
            <div className="bg-green-50 text-green-700 px-4 py-2 rounded-full text-sm font-semibold flex items-center">
              <Target className="w-4 h-4 mr-2" />
              {result.confidenceScore}% Success Confidence
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
              <div className="flex items-center text-gray-500 mb-2">
                <Users className="w-4 h-4 mr-2" />
                Target Audience
              </div>
              <p className="font-semibold text-lg text-gray-900">{result.targetAudience.headline}</p>
              <p className="text-sm text-gray-500">{result.targetAudience.subtext}</p>
            </div>
            
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
              <div className="flex items-center text-gray-500 mb-2">
                <MapPin className="w-4 h-4 mr-2" />
                Recommended Venue
              </div>
              <p className="font-semibold text-lg text-gray-900">{result.recommendedVenue.headline}</p>
              <p className="text-sm text-gray-500">{result.recommendedVenue.subtext}</p>
            </div>

            <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
              <div className="flex items-center text-gray-500 mb-2">
                <Calendar className="w-4 h-4 mr-2" />
                Optimal Timing
              </div>
              <p className="font-semibold text-lg text-gray-900">{result.optimalTiming.headline}</p>
              <p className="text-sm text-gray-500">{result.optimalTiming.subtext}</p>
            </div>

            <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
              <div className="flex items-center text-indigo-700 mb-2">
                <ArrowRight className="w-4 h-4 mr-2" />
                Mail Strategy
              </div>
              <p className="font-semibold text-lg text-indigo-900">{result.mailStrategy.headline}</p>
              <p className="text-sm text-indigo-700">{result.mailStrategy.subtext}</p>
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
