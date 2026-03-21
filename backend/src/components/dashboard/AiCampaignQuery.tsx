import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, ArrowRight, Loader2, MapPin, Users, Target, Calendar, AlertCircle, FileSpreadsheet, X, Phone } from 'lucide-react';
import { supabase } from '@/lib/supabase'; // Make sure Supabase is imported for Auth
import PostMeetingROIModal from './PostMeetingROIModal';
import CampaignMapPreview from './map/CampaignMapPreview';
import Papa from 'papaparse';

interface AiProposal {
  targetAudience: { headline: string; subtext: string };
  recommendedVenue: { headline: string; subtext: string; phone?: string };
  optimalTiming: { headline: string; subtext: string };
  mailStrategy: { headline: string; subtext: string };
  confidenceScore: string;
}

export default function AiCampaignQuery() {
  const [query, setQuery] = useState('');
  const [campaignType, setCampaignType] = useState<'financial' | 'medicare'>('financial');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<AiProposal | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  
  // Data Toll State
  const [isTollLocked, setIsTollLocked] = useState(false);
  const [tollMessage, setTollMessage] = useState('');
  const [violatingJobs, setViolatingJobs] = useState<any[]>([]);
  const [showRoiModal, setShowRoiModal] = useState(false);

  // Refinement State
  const [isRefining, setIsRefining] = useState(false);
  const [refinementQuery, setRefinementQuery] = useState('');

  // Data List Upload State
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [listSummary, setListSummary] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const checkDataToll = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      const { data, error } = await supabase.rpc('get_data_toll_violations');
      if (!error && data && data.locked) {
        setIsTollLocked(true);
        setTollMessage(data.message);
        setViolatingJobs(data.violating_jobs || []);
      } else {
        setIsTollLocked(false);
        setViolatingJobs([]);
      }
    } catch (err) {
      console.error("Checking data toll failed", err);
    }
  };

  useEffect(() => {
    checkDataToll();
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFile(file);
    
    // Parse the CSV to extract geography / demographics for the AI payload
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows: any[] = results.data as any[];
        
        // Let's grab some metadata from the raw file to guide the AI
        const count = rows.length;
        
        // Find columns that might relate to location or wealth
        const cities = rows.map(r => r.City || r.CITY || r.city).filter(Boolean);
        const uniqueCities = [...new Set(cities)];

        // Enhanced Age Distribution Analysis
        const ages = rows.map(r => parseInt(r.Age || r.AGE || r.age)).filter(a => !isNaN(a));
        
        let ageDistribution = null;
        if (ages.length > 0) {
          // Calculate Median instead of Mean to avoid outliers skewing data
          const sortedAges = [...ages].sort((a, b) => a - b);
          const medianAge = sortedAges[Math.floor(sortedAges.length / 2)];
          
          // Calculate generational buckets to give the AI exact weighting
          const workingAgePct = Math.round((ages.filter(a => a < 65).length / ages.length) * 100);
          const earlyRetireePct = Math.round((ages.filter(a => a >= 65 && a <= 70).length / ages.length) * 100);
          const lateRetireePct = Math.round((ages.filter(a => a > 70).length / ages.length) * 100);
          
          ageDistribution = {
            medianAge,
            workingAgePct,
            earlyRetireePct,
            lateRetireePct
          };
        }
        
        // Aggregate an analysis payload
        setListSummary({
          fileName: file.name,
          totalRecords: count,
          primaryLocations: uniqueCities.slice(0, 5), // Top 5 sampled cities
          ageDistribution: ageDistribution,
          dataBroker: file.name.toLowerCase().includes('acculeads') ? 'AccuLeads' : 'Unknown Data Broker',
        });
      },
      error: (err) => {
        console.error("Failed to parse CSV", err);
      }
    });
  };

  const removeUploadedFile = () => {
    setUploadedFile(null);
    setListSummary(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSearch = async (e: React.FormEvent, isRefinement = false) => {
    e.preventDefault();
    const activeQuery = isRefinement ? refinementQuery : query;
    if (!activeQuery.trim()) return;

    setIsProcessing(true);
    setErrorMsg('');

    try {
      // 1. Get the current user session token for the backend API
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('You must be logged in to use the AI Optimizer.');
      }

      // 2. Call our new Supabase Edge Function for Gemini
      const payload: any = { 
        query: activeQuery,
        campaignType: campaignType,
        listContext: listSummary // Injects the real data stats!
      };
      if (isRefinement && result) {
        payload.previousContext = result;
      }

      const response = await supabase.functions.invoke('gemini-optimizer', {
        body: payload
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to analyze campaign request.');
      }
      
      if (response.data && response.data.error) {
        throw new Error(response.data.error);
      }

      // 3. Set the results!
      setResult(response.data);
      if (isRefinement) {
        setIsRefining(false);
        setRefinementQuery('');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'An unexpected error occurred during AI processing.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full space-y-8">
      {/* The Magic Bar */}
      <div className={`relative group ${isTollLocked ? 'opacity-75' : ''}`}>
        <div className={`absolute -inset-1 bg-gradient-to-r ${isTollLocked ? 'from-red-500 to-red-600' : 'from-blue-600 to-indigo-600'} rounded-2xl blur opacity-25 ${!isTollLocked && 'group-hover:opacity-40 transition duration-1000 group-hover:duration-200'}`}></div>
        
        {/* Uploaded File Chip */}
        {listSummary && (
          <div className="absolute -top-4 left-6 z-10 flex items-center bg-indigo-100 text-indigo-800 text-xs font-semibold px-3 py-1 rounded-full shadow-sm border border-indigo-200 transform transition-all">
            <FileSpreadsheet className="w-3 h-3 mr-1.5" />
            Analyzing {listSummary.totalRecords.toLocaleString()} records from {listSummary.fileName}
            <button type="button" onClick={removeUploadedFile} className="ml-2 hover:text-indigo-900 focus:outline-none">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        <form onSubmit={handleSearch} className={`relative flex flex-col bg-white shadow-xl rounded-2xl overflow-hidden border ${isTollLocked ? 'border-red-200' : 'border-gray-100'}`}>
          <div className="flex bg-gray-50 border-b border-gray-100 p-2 gap-2">
            <button
              type="button"
              onClick={() => setCampaignType('financial')}
              className={`flex-1 py-2 px-4 rounded-xl text-sm font-medium transition-all duration-200 ${
                campaignType === 'financial' 
                  ? 'bg-white shadow-sm border border-gray-200 text-indigo-700' 
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100 border border-transparent'
              }`}
            >
              Financial / Annuity
            </button>
            <button
              type="button"
              onClick={() => setCampaignType('medicare')}
              className={`flex-1 py-2 px-4 rounded-xl text-sm font-medium transition-all duration-200 ${
                campaignType === 'medicare' 
                  ? 'bg-white shadow-sm border border-gray-200 text-teal-700' 
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100 border border-transparent'
              }`}
            >
              Medicare (T65+)
            </button>
          </div>
          
          <div className="flex items-stretch flex-1">
            <div className={`pl-6 pt-6 ${isTollLocked ? 'text-red-400' : 'text-indigo-500'}`}>
              {isTollLocked ? <AlertCircle className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}
            </div>
            
            <textarea
              className={`w-full px-4 py-6 text-xl bg-transparent border-none focus:outline-none focus:ring-0 resize-none min-h-[120px] ${isTollLocked ? 'text-red-900 placeholder-red-300 cursor-not-allowed' : 'text-gray-800 placeholder-gray-400'}`}
              placeholder={isTollLocked ? "ROI Reporting Required to Unlock" : "E.g., I want 50 qualified annuity leads in Dallas next month...\n\n(Press Enter to analyze, Shift+Enter for new line)"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={isProcessing || isTollLocked}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (query.trim() && !isProcessing && !isTollLocked) {
                    handleSearch(e as unknown as React.FormEvent);
                  }
                }
              }}
            />

            {/* Attach Data List Button */}
            {!isTollLocked && (
              <div className="px-2 border-l border-gray-100 flex items-center justify-center">
                <input 
                  type="file" 
                  accept=".csv" 
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`p-3 rounded-xl transition-colors flex items-center ${uploadedFile ? 'bg-indigo-50 text-indigo-600' : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50'} focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2`}
                  title="Attach AccuLeads CSV"
                >
                  <FileSpreadsheet className="w-6 h-6" />
                </button>
              </div>
            )}
          </div>

          <div className="border-t border-gray-100">
            <button
              type="submit"
              disabled={isProcessing || !query.trim() || isTollLocked}
              className={`w-full flex items-center justify-center px-8 py-4 font-bold text-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                isTollLocked 
                  ? 'bg-red-50 text-red-500' 
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              {isProcessing ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <>
                  <span className="mr-2">{isTollLocked ? 'Locked' : 'Optimize Strategy'}</span>
                  {!isTollLocked && <ArrowRight className="w-5 h-5" />}
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Data Toll Error Banner */}
      {isTollLocked && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex flex-col items-center justify-center text-center space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="bg-red-100 p-3 rounded-full text-red-600">
            <AlertCircle className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-red-900 mb-1">Data Toll Active</h3>
            <p className="text-red-700">{tollMessage}</p>
          </div>
          {violatingJobs.length > 0 && (
            <button 
              onClick={() => setShowRoiModal(true)}
              className="mt-2 bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-medium transition-colors shadow-sm"
            >
              Report ROI for: {violatingJobs[0].title || 'Meeting'}
            </button>
          )}
        </div>
      )}

      {violatingJobs.length > 0 && (
        <PostMeetingROIModal 
          isOpen={showRoiModal}
          onClose={() => setShowRoiModal(false)}
          jobId={violatingJobs[0].job_id}
          jobTitle={violatingJobs[0].title || `Meeting on ${new Date(violatingJobs[0].starts_at).toLocaleDateString()}`}
          onSuccess={() => {
            setShowRoiModal(false);
            // Re-check the toll to unlock the magic bar!
            checkDataToll();
          }}
        />
      )}

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

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8">
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
              <p className="text-sm text-gray-500 mb-2">{result.recommendedVenue.subtext}</p>
              {result.recommendedVenue.phone && (
                <div className="flex items-center text-sm font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded w-fit">
                  <Phone className="w-3.5 h-3.5 mr-1.5" />
                  <a href={`tel:${result.recommendedVenue.phone}`} className="hover:underline">{result.recommendedVenue.phone}</a>
                </div>
              )}
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

          <div className="mb-8">
            <CampaignMapPreview 
              venueHeadline={result.recommendedVenue.headline}
              polygonDescription={result.recommendedVenue.subtext}
            />
          </div>

          {isRefining ? (
            <div className="mt-8 border-t pt-6 bg-gray-50 -mx-8 -mb-8 p-8 rounded-b-2xl">
              <form onSubmit={(e) => handleSearch(e, true)} className="relative">
                <input
                  type="text"
                  value={refinementQuery}
                  onChange={(e) => setRefinementQuery(e.target.value)}
                  placeholder="How should we adjust this campaign? (e.g., 'Change to an Italian restaurant' or 'Focus on higher net worth')"
                  className="w-full text-lg px-6 py-4 rounded-xl border-2 border-indigo-200 focus:border-indigo-500 focus:ring-0 shadow-sm transition-all text-gray-800 pr-32 bg-white"
                  disabled={isProcessing}
                  autoFocus
                />
                <div className="absolute right-2 top-2 flex space-x-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsRefining(false);
                      setRefinementQuery('');
                    }}
                    className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isProcessing || !refinementQuery.trim()}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                  >
                    {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="flex justify-end space-x-4 border-t pt-6">
              <button 
                onClick={() => setIsRefining(true)}
                className="px-6 py-2 text-gray-600 hover:text-gray-900 font-medium transition-colors"
              >
                Refine Parameters
              </button>
              <button className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors shadow-sm">
                Approve & Deploy Campaign
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
