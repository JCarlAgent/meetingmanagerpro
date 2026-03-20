import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { ChevronDown, ChevronRight, Building2, Map, BarChart3, Mail, CheckCircle2, XCircle } from 'lucide-react';
import AiCampaignQuery from './AiCampaignQuery';

interface ClientDashboardProps {
  orgId: string;
  isFmo: boolean;
  onNavigate?: (view: string) => void;
}

export default function ClientDashboard({ orgId, isFmo, onNavigate }: ClientDashboardProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    company: true,
    campaigns: true,
    listBuilder: true,
    numbers: true,
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl mx-auto">
      {/* 1. Company Info */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm self-start">
        <button onClick={() => toggle('company')} className="w-full flex items-center justify-between p-4 bg-slate-50 border-b border-slate-200 hover:bg-slate-100 transition-colors">
          <div className="flex items-center gap-2 font-semibold text-slate-800"><Building2 className="w-5 h-5 text-indigo-600" /> Company Info</div>
          {expanded.company ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
        </button>
        {expanded.company && (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-500 font-medium pb-1 block">Company Rep Name</label>
                <input type="text" className="w-full p-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500" defaultValue={orgData?.contact_name || ''} placeholder="e.g. John Doe" />
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium pb-1 block">Title</label>
                <input type="text" className="w-full p-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500" defaultValue={orgData?.contact_job_title || ''} placeholder="e.g. Managing Partner" />
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium pb-1 block">Office/Company Phone</label>
                <input type="text" className="w-full p-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500" defaultValue={orgData?.contact_phone || ''} placeholder="(555) 123-4567" />
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium pb-1 block">Direct Phone</label>
                <input type="text" className="w-full p-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500" placeholder="(555) 987-6543" />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium pb-1 block">Email</label>
              <input type="email" className="w-full p-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500" defaultValue={orgData?.contact_email || ''} placeholder="john@example.com" />
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium pb-1 block">Notes / Preferences</label>
              <textarea className="w-full p-2 border border-slate-300 rounded-md h-24 text-sm focus:ring-2 focus:ring-indigo-500" placeholder="Preferred target demographics, internal notes..."></textarea>
            </div>
            <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md font-medium text-sm transition-colors">Save Details</button>
          </div>
        )}
      </div>

      {/* 2. Campaigns */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm self-start">
        <button onClick={() => toggle('campaigns')} className="w-full flex items-center justify-between p-4 bg-slate-50 border-b border-slate-200 hover:bg-slate-100 transition-colors">
          <div className="flex items-center gap-2 font-semibold text-slate-800"><Mail className="w-5 h-5 text-indigo-600" /> Active Campaigns</div>
          {expanded.campaigns ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
        </button>
        {expanded.campaigns && (
          <div className="p-4 space-y-4">
            
            {/* Mock Active Campaign (Red Highlight for < 7 days) */}
            <div className="border border-red-200 bg-red-50/50 rounded-lg p-4 relative overflow-hidden shadow-sm">
               <div className="absolute right-0 top-0 bottom-0 w-1.5 bg-red-500"></div>
               <h4 className="font-bold text-slate-800 flex items-center justify-between">
                 Retirement Strategy Dinner
                 <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-1 rounded-full">IN 5 DAYS</span>
               </h4>
               <p className="text-sm text-slate-600 mb-4 mt-1 font-medium">May 15th, 2026</p>
               
               <div className="space-y-2.5 text-sm p-3 bg-white rounded-md border border-red-100">
                 <div className="flex items-center justify-between font-medium text-slate-700"><span>Demographics Completed</span> <CheckCircle2 className="w-5 h-5 text-green-500"/></div>
                 <div className="flex items-center justify-between font-medium text-slate-700"><span>List Purchased</span> <CheckCircle2 className="w-5 h-5 text-green-500"/></div>
                 <div className="flex items-center justify-between font-medium text-slate-700"><span>Mail Piece Design</span> <CheckCircle2 className="w-5 h-5 text-green-500"/></div>
                 <div className="flex items-center justify-between font-medium text-slate-700"><span>Mailhouse Paid</span> <CheckCircle2 className="w-5 h-5 text-green-500"/></div>
                 <div className="flex items-center justify-between font-medium text-slate-700"><span>Mail Sent</span> <XCircle className="w-5 h-5 text-red-400"/></div>
               </div>
            </div>

            {/* Mock Past Campaign */}
            <div className="border border-slate-200 rounded-lg p-4 bg-white shadow-sm">
               <h4 className="font-bold text-slate-800">Past Meeting: Tax Planning</h4>
               <p className="text-sm text-slate-500 mb-4">February 10th, 2026</p>
               
               <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Final Stats</h5>
               <div className="grid grid-cols-2 gap-2 text-sm">
                 <div className="bg-slate-50 p-2 rounded border border-slate-100 flex justify-between">
                   <span className="text-slate-500">Mailed:</span> <strong className="text-slate-900">5,000</strong>
                 </div>
                 <div className="bg-blue-50 p-2 rounded border border-blue-100 flex justify-between">
                   <span className="text-slate-500">Responses:</span> <strong className="text-blue-900">42</strong>
                 </div>
                 <div className="bg-purple-50 p-2 rounded border border-purple-100 flex justify-between">
                   <span className="text-slate-500">Attendees:</span> <strong className="text-purple-900">38</strong>
                 </div>
                 <div className="bg-amber-50 p-2 rounded border border-amber-100 flex justify-between">
                   <span className="text-slate-500">Appointments:</span> <strong className="text-amber-900">12</strong>
                 </div>
               </div>
            </div>

          </div>
        )}
      </div>

      {/* 3. List Builder */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm self-start">
        <button onClick={() => toggle('listBuilder')} className="w-full flex items-center justify-between p-4 bg-slate-50 border-b border-slate-200 hover:bg-slate-100 transition-colors">
          <div className="flex items-center gap-2 font-semibold text-slate-800"><Map className="w-5 h-5 text-indigo-600" /> List Builder & AI Intelligence</div>
          {expanded.listBuilder ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
        </button>
        {expanded.listBuilder && (
          <div className="p-4 bg-slate-50/50">
             <AiCampaignQuery />
          </div>
        )}
      </div>

      {/* 4. Meetings Numbers */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm self-start">
        <button onClick={() => toggle('numbers')} className="w-full flex items-center justify-between p-4 bg-slate-50 border-b border-slate-200 hover:bg-slate-100 transition-colors">
          <div className="flex items-center gap-2 font-semibold text-slate-800"><BarChart3 className="w-5 h-5 text-indigo-600" /> Meeting Numbers (ROI)</div>
          {expanded.numbers ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
        </button>
        {expanded.numbers && (
          <div className="p-4 space-y-4">
             <div className="grid grid-cols-2 gap-3">
               <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                 <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Total Mailed</div>
                 <div className="text-2xl font-bold text-slate-900">10,000</div>
               </div>
               <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                 <div className="text-xs text-indigo-600 font-bold uppercase tracking-wider mb-1">Total Meetings</div>
                 <div className="text-2xl font-bold text-indigo-900">3</div>
               </div>
               <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                 <div className="text-xs text-blue-600 font-bold uppercase tracking-wider mb-1">Total Responders</div>
                 <div className="flex items-baseline gap-2">
                   <div className="text-2xl font-bold text-blue-900">114</div>
                   <div className="text-sm font-medium text-blue-600/70">1.14% rate</div>
                 </div>
               </div>
               <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
                 <div className="text-xs text-purple-600 font-bold uppercase tracking-wider mb-1">Total Attendees</div>
                 <div className="text-2xl font-bold text-purple-900">92</div>
               </div>
               <div className="bg-amber-50 p-4 rounded-lg border border-amber-100 col-span-2">
                 <div className="text-xs text-amber-600 font-bold uppercase tracking-wider mb-1">Scheduled Appointments</div>
                 <div className="text-3xl font-bold text-amber-900">28</div>
               </div>
             </div>
             
             <div className="mt-6 pt-5 border-t border-slate-200">
               <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center justify-between">
                 Return on Investment
                 <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded">Future Feature</span>
               </h4>
               <div className="flex gap-2">
                 <div className="relative flex-1">
                   <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium">$</span>
                   <input type="number" placeholder="Amount of products sold" className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500" />
                 </div>
                 <button className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-colors">Calculate</button>
               </div>
             </div>
          </div>
        )}
      </div>

    </div>
  );
}