import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { 
  ChevronDown, ChevronRight, Building2, Map, BarChart3, Mail, CheckCircle2, 
  XCircle, CalendarClock, DollarSign, CalendarCheck, Users, UsersRound, 
  Search, Phone, Navigation, User, ArrowLeft, Trophy, MapPin 
} from 'lucide-react';
import AiCampaignQuery, { AiProposal } from './AiCampaignQuery';
import { patchSetupState } from '@/lib/setupState';
import CampaignCard from './CampaignCard';

interface ClientDashboardProps {
  orgId: string;
  isFmo: boolean;
  onNavigate?: (view: string) => void;
  campaigns?: any[];
  events?: any[];
  onUpdateCampaignStatus?: (id: string, newStatus: boolean[]) => Promise<void> | void;
}

// --- Mock Data ---
const mockActiveCampaigns: any[] = [];

const mockCompletedCampaigns: any[] = [];

const topPerformersFMO: any[] = [];

const topPerformersCompany: any[] = [];

export default function ClientDashboard({ orgId, isFmo, onNavigate, campaigns = [], events = [], onUpdateCampaignStatus }: ClientDashboardProps) {
  // All sections contracted by default.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    company: false,
    campaigns: false,
    listBuilder: false,
    numbers: false,
  });

  const [orgData, setOrgData] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [activeCampaigns, setActiveCampaigns] = useState(mockActiveCampaigns);

  // If parent provides campaigns/events, use them as the source of truth for active campaigns
  useEffect(() => {
    try {
      if (Array.isArray(campaigns) && campaigns.length > 0) {
        const safeEvents = Array.isArray(events) ? events : [];
        const mapped = campaigns.map((c: any) => {
          const event = safeEvents.find((e: any) => e && e.campaign_id === c.id) || null;
          // job-level values (may come from canonical `jobs` or enriched stats)
          const mail_quantity = c.mail_quantity ?? (c.mailQuantity ?? 0);
          const delivered_quantity = c.delivered_quantity ?? c.delivered_count ?? (c.stats?.delivered ?? null) ?? null;
          const delivered_date = c.first_delivery_at ?? c.firstDeliveryAt ?? c.stats?.first_delivery_at ?? null;
          const responder_count = c.responder_count ?? c.responses_total ?? c.stats?.responses_total ?? 0;

          return {
            id: c.id,
            title: c.project_id || c.title || '',
            date: event && event.event_date ? `${event.event_date}` : '',
            venueName: event?.venue_name || '',
            city: event?.venue_city || event?.city || '',
            state: event?.venue_state || event?.state || '',
            // lightweight contact/advisor fields if available
            repName: c.repName || c.rep_name || '',
            repPhone: c.repPhone || c.rep_phone || '',
            repEmail: c.repEmail || c.rep_email || '',
            company: c.company || c.org_name || '',
            template_type: c.template_type || c.templateType || c.template || '',
            confirmation_method: c.confirmation_method || c.confirmationMethod || c.confirmation || null,
            mail_quantity,
            delivered_quantity,
            delivered_date,
            responder_count,
            status: Array.isArray(c.status) ? c.status : [true, false, false, false, false],
            daysLeft: c.daysLeft || '',
            stats: c.stats || { mailed: mail_quantity || 0, responses: responder_count || 0, attendees: 0, appointments: 0 }
          };
        });
        setActiveCampaigns(mapped);
      }
    } catch (err) {
      console.error('Error mapping campaigns/events in ClientDashboard:', err);
    }
  }, [campaigns, events]);

  const toggleCampaignStatus = async (campId: string, statusIndex: number) => {
    // Derived indexes (read-only): 1=List Purchased, 4=Mail Sent
    const derivedIndexes = [1, 4];
    if (derivedIndexes.includes(statusIndex)) return; // do not allow toggle for derived items
    // Compute new status from current activeCampaigns state (avoid updater race)
    const current = activeCampaigns.find(c => c.id === campId);
    if (!current) return;
    const ns = Array.isArray(current.status) ? [...current.status] : [false, false, false, false, false];
    ns[statusIndex] = !ns[statusIndex];

    // Optimistically update UI
    setActiveCampaigns(prev => prev.map(camp => camp.id === campId ? { ...camp, status: ns } : camp));

    // Persist to parent if handler provided
    try {
      if (onUpdateCampaignStatus) {
        await onUpdateCampaignStatus(campId, ns);
      }
    } catch (err) {
      console.error('Failed to persist checklist status', err);
      // Revert UI on failure by reloading campaigns prop mapping
      if (Array.isArray(campaigns) && campaigns.length > 0) {
        const safeEvents = Array.isArray(events) ? events : [];
        const mapped = campaigns.map((c: any) => {
          const event = safeEvents.find((e: any) => e && e.campaign_id === c.id) || null;
          return {
            id: c.id,
            title: c.project_id || c.title || '',
            date: event && event.event_date ? `${event.event_date}` : '',
            venueName: event?.venue_name || '',
            city: event?.venue_city || event?.city || '',
            state: event?.venue_state || event?.state || '',
            repName: '',
            repPhone: '',
            repEmail: '',
            company: '',
            status: Array.isArray(c.status) ? c.status : [true, false, false, false, false],
            daysLeft: c.daysLeft || '',
            stats: c.stats || { mailed: 0, responses: 0, attendees: 0, appointments: 0 }
          };
        });
        setActiveCampaigns(mapped);
      }
    }
  };
  const [selectedRep, setSelectedRep] = useState<any>(null);
  const { user } = useAuth();

  useEffect(() => {
    async function load() {
      const { data: org } = await supabase.from('orgs').select('*').eq('id', orgId).single();
      setOrgData(org || {});
    }
    load();
  }, [orgId]);

  const toggle = (section: string) => {
    setExpanded(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleAiAccept = (proposal: AiProposal, campaignName?: string, listContext?: any) => {
    const venues = proposal.recommendedVenue.headline.split('|').map(v => v.trim()).filter(Boolean);
    const newMeetings = venues.map(v => {
      let name = v;
      let city = '';
      let state = '';
      
      const dashSplit = v.split('-');
      if (dashSplit.length > 1) {
         name = dashSplit[0].trim();
         const locationPart = dashSplit[dashSplit.length - 1].trim(); 
         const commaSplit = locationPart.split(',');
         if (commaSplit.length > 1) {
            city = commaSplit[0].trim();
            state = commaSplit[1].trim();
         } else {
            city = locationPart;
         }
      } else {
         const commaSplit = v.split(',');
         if (commaSplit.length > 2) {
             name = commaSplit[0].trim();
             city = commaSplit[1].trim();
             state = commaSplit[2].trim();
         }
      }

      return {
        location_name: name,
        address1: '',
        city,
        state,
        date: '',
        time: '18:00'
      };
    });

    let mailQuantity = 5000;
    if (listContext && listContext.totalRecords) {
       // If an actual list was uploaded and sensed, use its exact count
       mailQuantity = listContext.totalRecords;
    } else {
       // Otherwise fallback to theoretical parsed from AI
       const qtyMatch = proposal.mailStrategy.headline.replace(/,/g, '').match(/\d+/);
       if (qtyMatch) {
          mailQuantity = parseInt(qtyMatch[0], 10);
       }
    }

    const demographicsNotes = `${proposal.targetAudience.headline}\n\n${proposal.targetAudience.subtext}\n\nVenue Context:\n${proposal.recommendedVenue.subtext}`;

    // Ensure we check the 'upload' option and set the uploaded list name if present
    const isListUploaded = !!listContext;

    patchSetupState({
      campaignTitle: campaignName,
      meetings: newMeetings,
      mailQuantity,
      demographicsNotes,
      rsvpMethods: { call_center: true, qr_code: true }, // Auto-select standard methods
      demographicsMode: isListUploaded ? 'upload' : 'printer',
      demographicsUploadedListName: isListUploaded ? listContext.fileName : undefined
    });

    if (onNavigate) {
      onNavigate('setup');
    }
  };

  const AccordionHeader = ({ id, icon: Icon, title }: { id: string, icon: any, title: string }) => {
    const isExpanded = expanded[id];
    return (
      <button 
        onClick={() => toggle(id)} 
        className={`w-full flex items-center justify-between p-5 md:p-6 transition-colors ${
          isExpanded ? 'bg-indigo-50 border-b border-indigo-100' : 'bg-white hover:bg-slate-50'
        }`}
      >
        <div className="flex items-center gap-3 md:gap-4">
          <div className={`p-2.5 rounded-lg ${isExpanded ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
            <Icon className="w-6 h-6 md:w-8 md:h-8" />
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">{title}</h2>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs font-bold text-slate-400 hidden sm:block uppercase tracking-wider px-2 py-1 bg-slate-100 rounded">
            {isExpanded ? 'Click to contract' : 'Click to expand'}
          </span>
          {isExpanded ? <ChevronDown className="w-6 h-6 text-slate-400" /> : <ChevronRight className="w-6 h-6 text-slate-400" />}
        </div>
      </button>
    );
  };

  // --- REP HISTORY OVERLAY VIEW ---
  if (selectedRep) {
    return (
      <div className="w-full bg-white rounded-xl border border-slate-200 overflow-hidden shadow-lg animate-in fade-in zoom-in-95 duration-300 min-h-[600px] flex flex-col">
        {/* Header Block */}
        <div className="bg-slate-900 p-6 md:p-10 text-white relative">
          <button 
            onClick={() => setSelectedRep(null)} 
            className="absolute top-6 left-6 flex items-center gap-2 text-slate-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" /> Back to Dashboard
          </button>
          
          <div className="mt-8 flex flex-col md:flex-row md:items-center gap-6">
            <div className="w-20 h-20 bg-indigo-500 rounded-full flex items-center justify-center text-4xl font-black text-white shrink-0 border-4 border-slate-800">
              {selectedRep.repName.charAt(0)}
            </div>
            <div>
              <h2 className="text-3xl font-black tracking-tight">{selectedRep.repName}</h2>
              <p className="text-indigo-300 font-medium text-lg mt-1">{isFmo ? selectedRep.company : orgData?.name || 'Company Agent'}</p>
              <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-slate-300">
                <span className="flex items-center gap-1.5"><Phone className="w-4 h-4"/> {selectedRep.repPhone}</span>
                <span className="flex items-center gap-1.5"><Mail className="w-4 h-4"/> {selectedRep.repEmail}</span>
                <span className="flex items-center gap-1.5"><Navigation className="w-4 h-4"/> {selectedRep.city}, {selectedRep.state}</span>
              </div>
            </div>
          </div>
        </div>

        {/* History Body */}
        <div className="p-6 md:p-10 bg-slate-50 flex-1">
          <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
            <CalendarCheck className="w-6 h-6 text-indigo-500" />
            Complete Meeting History
          </h3>

          <div className="space-y-4">
            {/* Show all completed campaigns for this rep (filtered mock data) */}
            {mockCompletedCampaigns
              .filter(c => c.repName === selectedRep.repName)
              .map(camp => (
              <div key={camp.id} className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-100">
                  <div>
                    <h4 className="font-bold text-lg text-slate-900">{camp.title}</h4>
                    <span className="text-sm font-medium text-slate-500 flex items-center gap-1.5 mt-1"><CalendarClock className="w-4 h-4"/> {camp.date}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-700">{camp.venueName}</p>
                    <p className="text-xs text-slate-500">{camp.city}, {camp.state}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div className="bg-slate-50 p-3 rounded-lg"><p className="text-xs font-bold text-slate-400 uppercase mb-1">Mailed</p><p className="text-xl font-bold text-slate-800">{camp.stats.mailed}</p></div>
                  <div className="bg-blue-50 p-3 rounded-lg"><p className="text-xs font-bold text-blue-500 uppercase mb-1">Responses</p><p className="text-xl font-bold text-blue-700">{camp.stats.responses}</p></div>
                  <div className="bg-purple-50 p-3 rounded-lg"><p className="text-xs font-bold text-purple-500 uppercase mb-1">Attendees</p><p className="text-xl font-bold text-purple-700">{camp.stats.attendees}</p></div>
                  <div className="bg-amber-50 p-3 rounded-lg"><p className="text-xs font-bold text-amber-500 uppercase mb-1">Appointments</p><p className="text-xl font-bold text-amber-700">{camp.stats.appointments}</p></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- FILTERED COMPLETED CAMPAIGNS ---
  const filteredCompleted = mockCompletedCampaigns.filter(c => {
    const q = searchQuery.toLowerCase();
    return c.city.toLowerCase().includes(q) 
        || c.state.toLowerCase().includes(q) 
        || c.repName.toLowerCase().includes(q)
        || (isFmo && c.company?.toLowerCase().includes(q));
  });

  return (
    <div className="w-full flex flex-col space-y-4 md:space-y-6 max-w-full overflow-x-hidden">
      
      {/* 1. Company Info */}
      <div className="w-full bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <AccordionHeader id="company" icon={Building2} title="Company Info" />
        {expanded.company && (
          <div className="p-6 md:p-8 bg-white animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-1">
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider pb-1.5 block">Company Rep Name</label>
                <input id="advisor-name" type="text" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white transition-colors" defaultValue={orgData?.contact_name || ''} placeholder="e.g. John Doe" />
              </div>
              <div className="lg:col-span-1">
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider pb-1.5 block">Title</label>
                <input id="advisor-title" type="text" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white transition-colors" defaultValue={orgData?.contact_job_title || ''} placeholder="e.g. Managing Partner" />
              </div>
              <div className="lg:col-span-1">
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider pb-1.5 block">Office / Company Phone</label>
                <input id="advisor-phone" type="text" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white transition-colors" defaultValue={orgData?.contact_phone || ''} placeholder="(555) 123-4567" />
              </div>
              <div className="lg:col-span-1">
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider pb-1.5 block">Direct Phone</label>
                <input type="text" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white transition-colors" placeholder="(555) 987-6543" />
              </div>
              <div className="lg:col-span-1 md:col-span-2 lg:col-span-1">
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider pb-1.5 block">Email</label>
                <input id="advisor-email" type="email" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white transition-colors" defaultValue={orgData?.contact_email || ''} placeholder="john@example.com" />
              </div>
              
              <div className="md:col-span-2 lg:col-span-5 pt-2">
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider pb-1.5 block">Notes</label>
                <textarea id="advisor-notes" className="w-full p-3 border border-slate-300 rounded-lg min-h-[100px] text-sm focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white transition-colors" defaultValue={orgData?.notes || ''} placeholder="Internal references, territory exclusions..."></textarea>
              </div>
            </div>
            <div className="mt-6 flex justify-end shrink-0">
              <button 
                onClick={async () => {
                  const btn = document.getElementById('save-info-btn') as HTMLButtonElement;
                  const original = btn.innerText;
                  btn.innerText = 'Saving...';
                  btn.disabled = true;
                  
                  const nameInput = document.getElementById('advisor-name') as HTMLInputElement;
                  const titleInput = document.getElementById('advisor-title') as HTMLInputElement;
                  const phoneInput = document.getElementById('advisor-phone') as HTMLInputElement;
                  const emailInput = document.getElementById('advisor-email') as HTMLInputElement;
                  const notesInput = document.getElementById('advisor-notes') as HTMLTextAreaElement;
                  
                  if (orgData?.id) {
                    const { error } = await supabase.from('orgs').update({
                      contact_name: nameInput?.value || null,
                      contact_job_title: titleInput?.value || null,
                      contact_phone: phoneInput?.value || null,
                      contact_email: emailInput?.value || null,
                      notes: notesInput?.value || null
                    }).eq('id', orgData.id);
                    
                    if (error) {
                      console.error('Save failed:', error);
                      alert('Failed to save: ' + error.message);
                      btn.innerText = 'Error!';
                      btn.classList.add('bg-red-600', 'hover:bg-red-700');
                      setTimeout(() => {
                        btn.innerText = original;
                        btn.disabled = false;
                        btn.classList.remove('bg-red-600', 'hover:bg-red-700');
                      }, 2000);
                      return;
                    }
                  }
                  
                  setTimeout(() => {
                    btn.innerText = 'Saved!';
                    btn.classList.add('bg-emerald-600', 'hover:bg-emerald-700');
                    setTimeout(() => {
                      btn.innerText = original;
                      btn.disabled = false;
                      btn.classList.remove('bg-emerald-600', 'hover:bg-emerald-700');
                    }, 2000);
                  }, 500);
                }}
                id="save-info-btn"
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-2.5 rounded-lg font-semibold text-sm transition-colors shadow-sm disabled:opacity-50"
              >
                Save Information
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. Campaigns */}
      <div className="w-full bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <AccordionHeader id="campaigns" icon={Mail} title="Campaigns" />
        {expanded.campaigns && (
          <div className="p-0 bg-slate-50/50 animate-in fade-in slide-in-from-top-2 duration-300">
            
            {/* ACTIVE CAMPAIGNS SUBSECTION */}
            <div className="p-6 md:p-8 border-b border-slate-200 space-y-6">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <CalendarClock className="w-6 h-6 text-indigo-500" />
                Active Campaigns
              </h3>
              
              <div className="space-y-4">
                {activeCampaigns.map(camp => (
                  <div key={camp.id} className="relative">
                    <div className="mb-2 text-sm font-bold text-red-600">JOB BOARD LIVE VERSION</div>
                    <CampaignCard
                      campaign={camp as any}
                      events={(Array.isArray(events) ? events.filter(e => e.campaign_id === camp.id) : []) as any}
                      responders={[] as any}
                      onUpdateResponder={async (_id: string, _updates: any) => { /* noop for now */ }}
                      onUpdateCampaign={(id: string, updates: any) => {
                        setActiveCampaigns(prev => prev.map(ac => ac.id === id ? { ...ac, ...updates } : ac));
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* COMPLETED CAMPAIGNS SUBSECTION */}
            <div className="p-6 md:p-8 space-y-6">
              
              {/* Header + Search Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <CalendarCheck className="w-6 h-6 text-indigo-500" />
                  Completed Campaigns
                </h3>
                <div className="relative w-full sm:w-80">
                  <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder={isFmo ? "Search by city, state, rep, or company..." : "Search by city, state, or rep..."} 
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm transition-shadow hover:shadow-md"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {filteredCompleted.length === 0 ? (
                <div className="text-center py-8 text-slate-500">No campaigns found matching your search.</div>
              ) : (
                <div className="space-y-4">
                  {filteredCompleted.map(camp => (
                    <div key={camp.id} className="flex flex-col xl:flex-row bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                      
                      {/* Info Block with Rep Info */}
                      <div className="p-5 lg:p-6 flex-shrink-0 min-w-[340px] xl:w-[380px] border-b xl:border-b-0 xl:border-r border-slate-100 flex flex-col justify-center bg-slate-50 xl:bg-white relative">
                        <h4 className="font-bold text-lg text-slate-900 leading-tight">{camp.title}</h4>
                        <p className="text-sm font-medium text-slate-500 mt-1">{camp.date}</p>
                        
                        <div className="mt-4 pt-4 border-t border-slate-200/60">
                          {isFmo && <p className="text-xs font-bold text-slate-400 mb-1">{camp.company}</p>}
                          <button onClick={() => setSelectedRep(camp)} className="text-sm font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5 transition-colors text-left group">
                            <User className="w-4 h-4 text-indigo-400 group-hover:text-indigo-600" /> {camp.repName} (View profile)
                          </button>
                          <div className="text-xs text-slate-600 mt-2 space-y-1.5">
                            <p className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-slate-400"/> {camp.repPhone} <span className="text-slate-300">|</span> {camp.repEmail}</p>
                            <p className="flex items-center gap-1.5"><Navigation className="w-3.5 h-3.5 text-slate-400"/> {camp.venueName} — {camp.city}, {camp.state}</p>
                          </div>
                        </div>
                      </div>
                      
                      {/* Horizontal Stats Block */}
                      <div className="flex-1 grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-slate-100">
                        <div className="p-4 md:p-6 flex flex-col items-center xl:items-start justify-center">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Mailed</span>
                          <span className="text-2xl font-bold text-slate-800">{camp.stats.mailed}</span>
                        </div>
                        <div className="p-4 md:p-6 flex flex-col items-center xl:items-start justify-center">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Responses</span>
                          <span className="text-2xl font-bold text-blue-600">{camp.stats.responses}</span>
                        </div>
                        <div className="p-4 md:p-6 flex flex-col items-center xl:items-start justify-center">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Attendees</span>
                          <span className="text-2xl font-bold text-purple-600">{camp.stats.attendees}</span>
                        </div>
                        <div className="p-4 md:p-6 flex flex-col items-center xl:items-start justify-center">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Appointments</span>
                          <span className="text-2xl font-bold text-amber-600">{camp.stats.appointments}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

            </div>

          </div>
        )}
      </div>

      {/* 3. List Builder */}
      <div className="w-full bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <AccordionHeader id="listBuilder" icon={Map} title="Campaign Planner" />
        {expanded.listBuilder && (
          <div className="p-0 border-t border-slate-100 animate-in fade-in slide-in-from-top-2 duration-300 w-full">
             {/* Use full-width container internal to AiQuery */}
             <div className="w-full bg-slate-50 p-4 md:p-8 overflow-hidden">
               <AiCampaignQuery onAcceptCampaign={handleAiAccept} />
             </div>
          </div>
        )}
      </div>

      {/* 4. Meetings Numbers */}
      <div className="w-full bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <AccordionHeader id="numbers" icon={BarChart3} title="Meetings Numbers" />
        {expanded.numbers && (
          <div className="p-6 md:p-8 border-t border-slate-100 animate-in fade-in slide-in-from-top-2 duration-300">
             
             {/* Horizontal full-width stats row */}
             <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 md:gap-6 mb-8">
               <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                 <Mail className="w-6 h-6 text-slate-400 mb-3 block" />
                 <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Mailed</div>
                 <div className="text-3xl font-black text-slate-900">0</div>
               </div>
               <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-100">
                 <Building2 className="w-6 h-6 text-indigo-400 mb-3 block" />
                 <div className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-1">Total Meetings</div>
                 <div className="text-3xl font-black text-indigo-900">0</div>
               </div>
               <div className="bg-blue-50 p-6 rounded-xl border border-blue-100">
                 <UsersRound className="w-6 h-6 text-blue-400 mb-3 block" />
                 <div className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">Responders</div>
                 <div className="flex items-baseline gap-2">
                   <div className="text-3xl font-black text-blue-900">0</div>
                 </div>
               </div>
               <div className="bg-purple-50 p-6 rounded-xl border border-purple-100">
                 <Users className="w-6 h-6 text-purple-400 mb-3 block" />
                 <div className="text-xs font-bold text-purple-600 uppercase tracking-wider mb-1">Total Attendees</div>
                 <div className="text-3xl font-black text-purple-900">0</div>
               </div>
               <div className="bg-amber-50 p-6 rounded-xl border border-amber-100 col-span-2 lg:col-span-1">
                 <CalendarCheck className="w-6 h-6 text-amber-400 mb-3 block" />
                 <div className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-1">Total Appointments</div>
                 <div className="text-3xl font-black text-amber-900">0</div>
               </div>
             </div>

             {/* ROI Calculator Row */}
             <div className="bg-slate-900 text-white rounded-xl p-6 flex flex-col md:flex-row items-center gap-6 shadow-xl mb-8">
               <div className="flex-1 flex items-center gap-4">
                 <div className="bg-indigo-500/20 p-3 rounded-lg text-indigo-400 border border-indigo-500/30">
                   <DollarSign className="w-6 h-6" />
                 </div>
                 <div>
                   <h4 className="text-lg font-bold">Return on Investment</h4>
                   <p className="text-slate-400 text-sm mt-1">Calculate revenue generated across all completed meetings to track your multiplier.</p>
                 </div>
               </div>
               <div className="w-full md:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                 <div className="relative w-full sm:w-64">
                   <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">$</span>
                   <input type="number" placeholder="Enter products sold..." className="w-full pl-8 pr-4 py-3 bg-slate-800 border gap-2 border-slate-700 rounded-lg text-white font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder-slate-500" />
                 </div>
                 <button className="bg-indigo-500 hover:bg-indigo-400 text-white px-8 py-3 rounded-lg font-bold whitespace-nowrap transition-colors shadow-lg shadow-indigo-500/25">Calculate</button>
               </div>
             </div>
             
             {/* THE SALES BOARD LEADERBOARD */}
             <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="p-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-amber-500" />
                    Top Performers Leaderboard
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-xs border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-4">{isFmo ? "Company & Representatives" : "Representative Name"}</th>
                        <th className="px-6 py-4">Location</th>
                        <th className="px-6 py-4 text-center">Meetings</th>
                        <th className="px-6 py-4 text-center">Attendees</th>
                        <th className="px-6 py-4 text-center">Appointments</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {isFmo ? (
                        // FMO View: Grouped by Company
                        topPerformersFMO.map((compGroup, i) => (
                          <React.Fragment key={i}>
                            <tr className="bg-slate-50/50">
                              <td colSpan={5} className="px-6 py-3 font-bold text-indigo-900 border-l-4 border-indigo-500">
                                {compGroup.company}
                              </td>
                            </tr>
                            {compGroup.reps.map((rep, j) => (
                              <tr key={j} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 pl-10">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">{rep.name.charAt(0)}</div>
                                    <span className="font-semibold text-slate-800">{rep.name}</span>
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-slate-500 font-medium">{rep.city}, {rep.state}</td>
                                <td className="px-6 py-4 text-center font-bold text-slate-700">{rep.meetings}</td>
                                <td className="px-6 py-4 text-center font-bold text-purple-600">{rep.attendees}</td>
                                <td className="px-6 py-4 text-center font-bold text-amber-600">{rep.appointments}</td>
                              </tr>
                            ))}
                          </React.Fragment>
                        ))
                      ) : (
                        // Company View: Plain Rep List
                        topPerformersCompany.map((rep, i) => (
                          <tr key={i} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-sm">{rep.name.charAt(0)}</div>
                                <div>
                                  <div className="font-bold text-slate-800">{rep.name}</div>
                                  {i === 0 && <span className="text-[10px] uppercase tracking-wider font-bold text-amber-500 bg-amber-50 px-2 py-0.5 rounded">#1 Performer</span>}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-slate-500 font-medium"><MapPin className="w-3 h-3 inline mr-1 text-slate-400"/>{rep.city}, {rep.state}</td>
                            <td className="px-6 py-4 text-center"><span className="bg-slate-100 px-3 py-1 rounded text-slate-700 font-bold">{rep.meetings}</span></td>
                            <td className="px-6 py-4 text-center"><span className="bg-purple-50 text-purple-700 px-3 py-1 rounded font-bold">{rep.attendees}</span></td>
                            <td className="px-6 py-4 text-center"><span className="bg-amber-50 text-amber-700 px-3 py-1 rounded font-bold">{rep.appointments}</span></td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
             </div>

          </div>
        )}
      </div>

    </div>
  );
}