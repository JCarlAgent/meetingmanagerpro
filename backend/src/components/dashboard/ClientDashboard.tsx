import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { ChevronDown, ChevronRight, Building2, Map, BarChart3, Mail, CheckCircle2, XCircle, CalendarClock, DollarSign, CalendarCheck, Users, UsersRound } from 'lucide-react';
import AiCampaignQuery from './AiCampaignQuery';

interface ClientDashboardProps {
  orgId: string;
  isFmo: boolean;
  onNavigate?: (view: string) => void;
}

export default function ClientDashboard({ orgId, isFmo, onNavigate }: ClientDashboardProps) {
  // All sections contracted by default.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    company: false,
    campaigns: false,
    listBuilder: false,
    numbers: false,
  });

  const toggle = (section: string) => {
    setExpanded(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const [orgData, setOrgData] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      const { data: org } = await supabase.from('orgs').select('*').eq('id', orgId).single();
      setOrgData(org || {});
      
      const { data: camps } = await supabase.from('jobs').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
      if (camps) {
        setCampaigns(camps);
      }
    }
    load();
  }, [orgId]);

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
                <input type="text" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white transition-colors" defaultValue={orgData?.contact_name || ''} placeholder="e.g. John Doe" />
              </div>
              <div className="lg:col-span-1">
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider pb-1.5 block">Title</label>
                <input type="text" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white transition-colors" defaultValue={orgData?.contact_job_title || ''} placeholder="e.g. Managing Partner" />
              </div>
              <div className="lg:col-span-1">
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider pb-1.5 block">Office / Company Phone</label>
                <input type="text" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white transition-colors" defaultValue={orgData?.contact_phone || ''} placeholder="(555) 123-4567" />
              </div>
              <div className="lg:col-span-1">
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider pb-1.5 block">Direct Phone</label>
                <input type="text" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white transition-colors" placeholder="(555) 987-6543" />
              </div>
              <div className="lg:col-span-1 md:col-span-2 lg:col-span-1">
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider pb-1.5 block">Email</label>
                <input type="email" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white transition-colors" defaultValue={orgData?.contact_email || ''} placeholder="john@example.com" />
              </div>
              
              <div className="md:col-span-2 lg:col-span-5 pt-2">
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider pb-1.5 block">Notes</label>
                <textarea className="w-full p-3 border border-slate-300 rounded-lg min-h-[100px] text-sm focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white transition-colors" defaultValue={orgData?.notes || ''} placeholder="Internal references, territory exclusions..."></textarea>
              </div>
            </div>
            <div className="mt-6 flex justify-end shrink-0">
              <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-2.5 rounded-lg font-semibold text-sm transition-colors shadow-sm">Save Information</button>
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
            <div className="p-6 md:p-8 border-b border-slate-200">
              <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                <CalendarClock className="w-6 h-6 text-indigo-500" />
                Active Campaigns
              </h3>
              
              {/* Active Campaign horizontal row design */}
              <div className="flex flex-col xl:flex-row xl:items-center bg-white border border-red-200 rounded-xl overflow-hidden shadow-sm relative pr-4 lg:pr-6 hover:shadow-md transition-shadow">
                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-red-500"></div>
                
                {/* Info Block */}
                <div className="p-5 lg:p-6 flex-shrink-0 min-w-[280px] xl:w-[320px] xl:border-r border-slate-100 flex flex-col justify-center bg-slate-50 xl:bg-white">
                  <div className="mb-2"><span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-600 uppercase tracking-widest border border-red-200">In 5 Days</span></div>
                  <h4 className="font-bold text-lg text-slate-900 leading-tight">Retirement Strategy Dinner</h4>
                  <p className="text-sm font-medium text-slate-500 mt-1">May 15th, 2026</p>
                </div>
                
                {/* Horizontal Checklist Block */}
                <div className="p-5 lg:p-6 flex-1 bg-white xl:bg-transparent border-t xl:border-t-0 border-slate-100 flex items-center">
                  <div className="flex flex-wrap lg:flex-nowrap items-center w-full justify-between gap-y-4 gap-x-2 text-sm">
                    <div className="flex items-center gap-2.5 font-medium text-slate-700 w-[calc(50%-0.5rem)] lg:w-auto"><CheckCircle2 className="w-5 h-5 text-green-500 shrink-0"/> <span>Demo Data Done</span></div>
                    <div className="flex items-center gap-2.5 font-medium text-slate-700 w-[calc(50%-0.5rem)] lg:w-auto"><CheckCircle2 className="w-5 h-5 text-green-500 shrink-0"/> <span>List Purchased</span></div>
                    <div className="flex items-center gap-2.5 font-medium text-slate-700 w-[calc(50%-0.5rem)] lg:w-auto"><CheckCircle2 className="w-5 h-5 text-green-500 shrink-0"/> <span>Design Chosen</span></div>
                    <div className="flex items-center gap-2.5 font-medium text-slate-700 w-[calc(50%-0.5rem)] lg:w-auto"><CheckCircle2 className="w-5 h-5 text-green-500 shrink-0"/> <span>Mailhouse Paid</span></div>
                    <div className="flex items-center gap-2.5 font-medium text-slate-700 w-[calc(50%-0.5rem)] lg:w-auto"><XCircle className="w-5 h-5 text-red-400 shrink-0"/> <span>Mail Sent</span></div>
                  </div>
                </div>
              </div>
            </div>

            {/* COMPLETED CAMPAIGNS SUBSECTION */}
            <div className="p-6 md:p-8">
              <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                <CalendarCheck className="w-6 h-6 text-indigo-500" />
                Completed Campaigns
              </h3>

              {/* Completed Campaign horizontal row design */}
              <div className="flex flex-col xl:flex-row bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                
                {/* Info Block */}
                <div className="p-5 lg:p-6 flex-shrink-0 min-w-[280px] xl:w-[320px] border-b xl:border-b-0 xl:border-r border-slate-100 flex flex-col justify-center bg-slate-50 xl:bg-white">
                  <h4 className="font-bold text-lg text-slate-900 leading-tight">Tax Planning Seminar</h4>
                  <p className="text-sm font-medium text-slate-500 mt-1">February 10th, 2026</p>
                </div>
                
                {/* Horizontal Stats Block */}
                <div className="flex-1 grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-slate-100">
                  <div className="p-4 md:p-6 flex flex-col items-center xl:items-start justify-center">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Mailed</span>
                    <span className="text-2xl font-bold text-slate-800">5,000</span>
                  </div>
                  <div className="p-4 md:p-6 flex flex-col items-center xl:items-start justify-center">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Responses</span>
                    <span className="text-2xl font-bold text-blue-600">42</span>
                  </div>
                  <div className="p-4 md:p-6 flex flex-col items-center xl:items-start justify-center">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Attendees</span>
                    <span className="text-2xl font-bold text-purple-600">38</span>
                  </div>
                  <div className="p-4 md:p-6 flex flex-col items-center xl:items-start justify-center">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Appointments</span>
                    <span className="text-2xl font-bold text-amber-600">12</span>
                  </div>
                </div>
              </div>

            </div>

          </div>
        )}
      </div>

      {/* 3. List Builder */}
      <div className="w-full bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <AccordionHeader id="listBuilder" icon={Map} title="List Builder" />
        {expanded.listBuilder && (
          <div className="p-0 border-t border-slate-100 animate-in fade-in slide-in-from-top-2 duration-300 w-full">
             {/* Use full-width container internal to AiQuery */}
             <div className="w-full bg-slate-50 p-4 md:p-8 overflow-hidden">
               <AiCampaignQuery />
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
                 <div className="text-3xl font-black text-slate-900">10,000</div>
               </div>
               <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-100">
                 <Building2 className="w-6 h-6 text-indigo-400 mb-3 block" />
                 <div className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-1">Total Meetings</div>
                 <div className="text-3xl font-black text-indigo-900">3</div>
               </div>
               <div className="bg-blue-50 p-6 rounded-xl border border-blue-100">
                 <UsersRound className="w-6 h-6 text-blue-400 mb-3 block" />
                 <div className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">Responders</div>
                 <div className="flex items-baseline gap-2">
                   <div className="text-3xl font-black text-blue-900">114</div>
                   <div className="text-sm font-semibold text-blue-600/80">1.14% avg</div>
                 </div>
               </div>
               <div className="bg-purple-50 p-6 rounded-xl border border-purple-100">
                 <Users className="w-6 h-6 text-purple-400 mb-3 block" />
                 <div className="text-xs font-bold text-purple-600 uppercase tracking-wider mb-1">Total Attendees</div>
                 <div className="text-3xl font-black text-purple-900">92</div>
               </div>
               <div className="bg-amber-50 p-6 rounded-xl border border-amber-100 col-span-2 lg:col-span-1">
                 <CalendarCheck className="w-6 h-6 text-amber-400 mb-3 block" />
                 <div className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-1">Total Appointments</div>
                 <div className="text-3xl font-black text-amber-900">28</div>
               </div>
             </div>
             
             {/* ROI Calculator Row */}
             <div className="bg-slate-900 text-white rounded-xl p-6 flex flex-col md:flex-row items-center gap-6 shadow-xl">
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

          </div>
        )}
      </div>

    </div>
  );
}