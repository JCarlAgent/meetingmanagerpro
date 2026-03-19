import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useActingOrg } from '@/lib/actingOrg';
import { Campaign, Event, Responder } from '@/types';
import Header from './Header';
import Sidebar from './Sidebar';
import StatsOverview from './StatsOverview';
import CampaignCard from './CampaignCard';
import NewCampaignModal from './NewCampaignModal';
import AddResponderModal from './AddResponderModal';
import ReportsView from './ReportsView';
import EventsView from './EventsView';
import RespondersView from './RespondersView';
import AdminUsersView from './AdminUsersView';
import TemplateManagerView from './TemplateManagerView';
import TemplatesView from './TemplatesView';
import MasterClientsView from './MasterClientsView';
import MasterOrganizationsView from './MasterOrganizationsView';
import MeetingSetupView from './MeetingSetupView';
import OrgMeetingsView from './OrgMeetingsView';
import SettingsView from './SettingsView';
import SocialMediaIntegrationsView from './SocialMediaIntegrationsView';
import DemographicsUploadView from './DemographicsUploadView';
import MailingsReportView from './MailingsReportView';
import ApprovalsArchiveView from './ApprovalsArchiveView';
import HomeView from './HomeView';
import { RefreshCw, Plus, Search, FolderKanban, UserPlus } from 'lucide-react';

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { actingOrgId } = useActingOrg();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeView, setActiveView] = useState('home');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [responders, setResponders] = useState<Responder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [showAddResponder, setShowAddResponder] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pending' | 'closed'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const prevActingOrgIdRef = useRef<string | null>(actingOrgId);

  useEffect(() => { fetchData(); }, [user]);

  useEffect(() => {
    if (!user) return;
    // Default master admins to the Clients view (onboarding workflow).
    setActiveView((prev) => {
      if (prev !== 'home') return prev;
      return user.is_master_admin && !actingOrgId ? 'master-clients' : 'home';
    });
  }, [user, actingOrgId]);

  useEffect(() => {
    // When a master admin begins viewing-as an org, behave like that org's dashboard.
    if (!user?.is_master_admin) return;
    if (actingOrgId) {
      setActiveView('home');
    }
  }, [actingOrgId, user?.is_master_admin]);

  useEffect(() => {
    // When a master admin exits a view-as org, route them back to the super-admin workflow.
    const prev = prevActingOrgIdRef.current;
    prevActingOrgIdRef.current = actingOrgId;

    if (!user?.is_master_admin) return;
    if (prev && !actingOrgId) {
      setActiveView('master-clients');
    }
  }, [actingOrgId, user?.is_master_admin]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const { data: c } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false });
      setCampaigns(c || []);
      const { data: e } = await supabase.from('events').select('*').order('event_date', { ascending: true });
      setEvents(e || []);
      const { data: r } = await supabase.from('responders').select('*').order('created_at', { ascending: false });
      setResponders(r || []);
    } catch (error) { console.error('Error:', error); }
    finally { setIsLoading(false); }
  };

  const handleUpdateResponder = async (id: string, updates: Partial<Responder>) => {
    try {
      await supabase.from('responders').update(updates).eq('id', id);
      setResponders(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
    } catch (error) { console.error('Error:', error); }
  };

  const handleUpdateCampaign = async (id: string, updates: Partial<Campaign>) => {
    try {
      await supabase.from('campaigns').update(updates).eq('id', id);
      setCampaigns(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleCreateCampaign = async (data: any) => {
    try {
      const projectId = Math.floor(50000 + Math.random() * 10000).toString();
      const { data: newCampaign } = await supabase.from('campaigns').insert({
        user_id: user?.id, project_id: projectId, status: 'pending',
        mail_quantity: data.mail_quantity, template_type: data.template_type,
        mail_piece_size: data.mail_piece_size, mail_piece_type: data.mail_piece_type,
        toll_free_number: '800-786-8104', landing_page_url: `https://rsvp.meetingmanagerpro.com/${projectId}`,
      }).select().single();
      if (newCampaign) {
        for (const event of data.events) {
          if (event.venue_name && event.event_date) {
            await supabase.from('events').insert({
              campaign_id: newCampaign.id, venue_name: event.venue_name, venue_address: event.venue_address,
              venue_city: event.venue_city, venue_state: event.venue_state,
              event_date: event.event_date, event_time: event.event_time, max_capacity: event.max_capacity,
            });
          }
        }
      }
      fetchData();
    } catch (error) { console.error('Error:', error); }
  };

  const filteredCampaigns = campaigns.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return c.project_id.toLowerCase().includes(q) || c.template_type.toLowerCase().includes(q);
    }
    return true;
  });

  const getCampaignEvents = (id: string) => events.filter(e => e.campaign_id === id);
  const getCampaignResponders = (id: string) => responders.filter(r => r.campaign_id === id);

  const renderContent = () => {
    switch (activeView) {
      case 'home':
        return <HomeView onNavigate={(view) => setActiveView(view)} />;
      case 'master-clients':
        if (user?.is_master_admin && actingOrgId) {
          return <HomeView onNavigate={(view) => setActiveView(view)} />;
        }
        return <MasterClientsView onNavigate={(view) => setActiveView(view)} />;
      case 'master-orgs':
        if (user?.is_master_admin && actingOrgId) {
          return <HomeView onNavigate={(view) => setActiveView(view)} />;
        }
        return <MasterOrganizationsView />;
      case 'setup':
        // View-only advisors should not access meeting input.
        if ((user as any)?.org_role === 'member') {
          return (
            <div className="max-w-4xl mx-auto">
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <h1 className="text-xl font-semibold text-slate-900">Meeting Setup</h1>
                <p className="mt-2 text-slate-600">Your account is view-only. Contact your FMO to make meeting changes.</p>
              </div>
            </div>
          );
        }
        return (
          <MeetingSetupView
            onNewCampaign={() => setShowNewCampaign(true)}
            onNavigate={(view) => setActiveView(view)}
          />
        );
      case 'uploads':
        return <DemographicsUploadView />;
      case 'meetings':
        return <OrgMeetingsView onNavigate={(view) => setActiveView(view)} />;
      case 'mailings':
        return <MailingsReportView />;
      case 'approvals':
        return <ApprovalsArchiveView />;
      case 'reports':
        return <ReportsView campaigns={campaigns} events={events} responders={responders} />;
      case 'events':
        return <EventsView events={events} campaigns={campaigns} responders={responders} onUpdateResponder={handleUpdateResponder} />;
      case 'responders':
        return <RespondersView responders={responders} campaigns={campaigns} events={events} onUpdateResponder={handleUpdateResponder} />;
      case 'campaigns':
        return renderDashboard();
      case 'admin-users':
        // Only render admin view if user is admin
        if (user?.is_admin) {
          return <AdminUsersView />;
        }
        // Fallback to dashboard if not admin
        return renderDashboard();
      case 'admin-templates':
        // Only render template manager if user is admin
        if (user?.is_admin) {
          return <TemplateManagerView />;
        }
        // Fallback to dashboard if not admin
        return renderDashboard();
      case 'templates':
        return <TemplatesView />;
      case 'settings':
        return <SettingsView />;
      case 'integrations':
        return <SocialMediaIntegrationsView />;
      default:
        return renderDashboard();
    }
  };


  const renderDashboard = () => (
    <>
      <StatsOverview campaigns={campaigns} events={events} responders={responders} />
      <div className="mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <FolderKanban className="w-6 h-6 text-red-400" />
            <h2 className="text-xl font-semibold text-slate-900">Your Campaigns</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/30 w-40" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30">
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="closed">Closed</option>
            </select>
            <button onClick={() => setShowAddResponder(true)} className="flex items-center gap-2 px-3 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors" title="Add Responder">
              <UserPlus className="w-5 h-5" />
            </button>
            <button onClick={fetchData} className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors" title="Refresh">
              <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={() => setShowNewCampaign(true)} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-lg transition-colors">
              <Plus className="w-4 h-4" /><span className="hidden sm:inline">New Campaign</span>
            </button>
          </div>
        </div>
        {isLoading ? (
          <div className="grid gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-slate-800/50 rounded-xl border border-white/10 p-6 animate-pulse">
                <div className="flex items-center gap-4 mb-4"><div className="w-20 h-8 bg-slate-700 rounded-lg"></div><div className="w-16 h-6 bg-slate-700 rounded-full"></div></div>
                <div className="grid grid-cols-4 gap-4">{[1, 2, 3, 4].map((j) => (<div key={j} className="h-20 bg-slate-700 rounded-lg"></div>))}</div>
              </div>
            ))}
          </div>
        ) : filteredCampaigns.length === 0 ? (
          <div className="text-center py-12 bg-slate-800/30 rounded-xl border border-white/10">
            <FolderKanban className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 mb-4">No campaigns found</p>
            <button onClick={() => setShowNewCampaign(true)} className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-lg transition-colors">
              <Plus className="w-4 h-4" />Create Your First Campaign
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredCampaigns.map((campaign) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                events={getCampaignEvents(campaign.id)}
                responders={getCampaignResponders(campaign.id)}
                onUpdateResponder={handleUpdateResponder}
                onUpdateCampaign={handleUpdateCampaign}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} activeView={activeView}
          onViewChange={(view) => { if (view === 'new-campaign') { setShowNewCampaign(true); } else { setActiveView(view); } setSidebarOpen(false); }} />
        <div className="flex-1 min-h-screen">
          <Header onMenuClick={() => setSidebarOpen(true)} />
          <main className="p-4 lg:p-6">{renderContent()}</main>
        </div>
      </div>
      <NewCampaignModal isOpen={showNewCampaign} onClose={() => setShowNewCampaign(false)} onSubmit={handleCreateCampaign} />
      <AddResponderModal isOpen={showAddResponder} onClose={() => setShowAddResponder(false)} campaigns={campaigns} events={events} onSuccess={fetchData} />
    </div>
  );
};

export default Dashboard;
