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
import CampaignMapView from './map/CampaignMapView';
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
  const campaignsTableExistsRef = useRef<boolean | null>(null);
  const [debugInfo, setDebugInfo] = useState<any>(null);

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

  useEffect(() => {
    // Listen for navigate custom events dispatched by child components (e.g. CampaignCard "See full list")
    const handleNavigateEvent = (e: Event) => {
      const view = (e as CustomEvent<{ view: string }>).detail?.view;
      if (view) setActiveView(view);
    };
    window.addEventListener('navigate', handleNavigateEvent);
    return () => window.removeEventListener('navigate', handleNavigateEvent);
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Legacy tables may be absent in some Supabase projects; skip querying them to avoid 404s.
      const c: any[] | null = null;
      const e: any[] | null = null;

      // Probe whether legacy `campaigns` table exists so we can safely avoid writes.
      try {
        const probe = await supabase.from('campaigns').select('id').limit(1).maybeSingle();
        campaignsTableExistsRef.current = !probe.error;
      } catch (err) {
        campaignsTableExistsRef.current = false;
      }

      // Determine org scope (same pattern used elsewhere)
      const orgId = user?.is_master_admin ? (actingOrgId ?? null) : (user?.org_id ?? null);

      console.log('[DIAG] fetchData start', { userId: user?.id, orgId, isMaster: user?.is_master_admin, orgRole: (user as any)?.org_role, actingOrgId });

      // Try to fetch canonical jobs + job_meetings for this org. If found, prefer them for display.
      let jobsData: any[] | null = null;
      let jobMeetings: any[] = [];
      let jobMeetingsError: any = null;
      if (orgId) {
        const jobsRes = await supabase.from('jobs').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
        jobsData = jobsRes.data || null;
        console.log('[DIAG] jobs query', { orgId, count: jobsData?.length ?? 0, error: jobsRes.error, rows: (jobsData || []).map((j: any) => ({ id: j.id, job_number: j.job_number, org_id: j.org_id, status: j.status, created_by_user_id: j.created_by_user_id })) });
        if (jobsData && jobsData.length > 0) {
          const jobIds = jobsData.map((j: any) => j.id);
          const jmRes = await supabase.from('job_meetings').select('*').in('job_id', jobIds).order('starts_at', { ascending: true });
          jobMeetings = jmRes.data || [];
          jobMeetingsError = jmRes.error ?? null;
          console.log('[DIAG] job_meetings query', { jobIds, count: jobMeetings.length, error: jmRes.error, rows: jobMeetings.map((m: any) => ({ id: m.id, job_id: m.job_id, location_name: m.location_name, address1: m.address1, city: m.city, state: m.state, starts_at: m.starts_at, keys: Object.keys(m) })) });
        } else {
          console.log('[DIAG] jobs query returned 0 rows — skipping job_meetings query');
        }
      } else {
        console.log('[DIAG] orgId is null — skipping jobs + job_meetings queries', { user: user?.id, org_id: (user as any)?.org_id, is_master: user?.is_master_admin });
      }

      // Fetch org name and primary contact name for advisor display on job cards
      let orgName = '';
      let orgContactName = '';
      if (orgId) {
        try {
          const { data: orgRow } = await supabase.from('orgs').select('name, contact_name').eq('id', orgId).single();
          orgName = (orgRow as any)?.name ?? '';
          orgContactName = (orgRow as any)?.contact_name ?? '';
        } catch { /* non-critical, ignore */ }
      }

      if (jobsData && jobsData.length > 0) {
        // Enrichment: read supplemental tables to derive mail counts, delivery dates and stats.
        const jobIds = jobsData.map((j: any) => j.id);
        let mailingLists: any[] | null = null;
        let printOrders: any[] | null = null;
        let stats: any[] | null = null;

        try {
          const mlRes = await supabase.from('job_mailing_lists').select('job_id, row_count, uploaded_at').in('job_id', jobIds).order('uploaded_at', { ascending: false });
          mailingLists = mlRes.data || null;
        } catch (err) { mailingLists = null; }

        try {
          const poRes = await supabase.from('print_orders').select('job_id, mailed_at').in('job_id', jobIds).order('mailed_at', { ascending: false });
          printOrders = poRes.data || null;
        } catch (err) { printOrders = null; }

        try {
          const stRes = await supabase.from('job_stats').select('*').in('job_id', jobIds);
          stats = stRes.data || null;
        } catch (err) { stats = null; }

        // Build lookup maps for quick enrichment
        const mailingListByJobId = new Map<string, number>();
        // mailingLists ordered by uploaded_at desc; record first (most recent) per job
        (mailingLists || []).forEach((ml: any) => { if (!mailingListByJobId.has(ml.job_id)) mailingListByJobId.set(ml.job_id, ml.row_count); });

        const printOrdersByJobId = new Map<string, string | null>();
        // printOrders ordered by mailed_at desc; take first per job
        (printOrders || []).forEach((po: any) => {
          if (!printOrdersByJobId.has(po.job_id)) printOrdersByJobId.set(po.job_id, po.mailed_at);
        });

        const jobStatsByJobId = new Map<string, any>();
        (stats || []).forEach((s: any) => { jobStatsByJobId.set(s.job_id, s); });

        const jobsAsCampaigns = (jobsData || []).map((j: any) => {
          const mail_quantity = mailingListByJobId.get(j.id) ?? jobStatsByJobId.get(j.id)?.mailed_count ?? 0;
          const paid_at = printOrdersByJobId.get(j.id) ?? jobStatsByJobId.get(j.id)?.first_delivery_at ?? null;
          const delivered_quantity = jobStatsByJobId.get(j.id)?.delivered_count ?? 0;
          const responder_count = jobStatsByJobId.get(j.id)?.responses_total ?? 0;

          // Safely parse existing notes which we will use to persist checklist state.
          let notesObj: any = {};
          try {
            if (j.notes) {
              notesObj = typeof j.notes === 'string' ? JSON.parse(j.notes) : j.notes;
            }
          } catch (err) {
            notesObj = { text: j.notes || '' };
          }

          // Derived items (should be read-only): List Purchased (1), Mail Sent (4)
          const derivedListPurchased = (mailingListByJobId.get(j.id) ?? 0) > 0;
          const derivedMailSent = !!(printOrdersByJobId.get(j.id) || (jobStatsByJobId.get(j.id)?.mailed_count));

          // Stored checklist items (if any)
          const storedItems: any[] = (
            notesObj && typeof notesObj === 'object' &&
            notesObj.checklist && typeof notesObj.checklist === 'object' &&
            Array.isArray((notesObj.checklist as any).items)
          ) ? (notesObj.checklist as any).items : [];

          // Build final status array (6 items):
          // 0: Demo Data Done | 1: List Purchased | 2: Template Selected | 3: 800# Secured | 4: Mailhouse Paid | 5: Mail Sent
          const statusArray: boolean[] = [];
          // 0: Demo Data Done (manual)
          statusArray[0] = storedItems.length > 0 && typeof storedItems[0] === 'boolean' ? storedItems[0] : false;
          // 1: List Purchased (derived)
          statusArray[1] = derivedListPurchased;
          // 2: Template Selected (manual)
          statusArray[2] = storedItems.length > 2 && typeof storedItems[2] === 'boolean' ? storedItems[2] : false;
          // 3: 800# Secured (manual)
          statusArray[3] = storedItems.length > 3 && typeof storedItems[3] === 'boolean' ? storedItems[3] : false;
          // 4: Mailhouse Paid (manual)
          statusArray[4] = storedItems.length > 4 && typeof storedItems[4] === 'boolean' ? storedItems[4] : false;
          // 5: Mail Sent (derived from print_orders.mailed_at or job_stats.mailed_count)
          statusArray[5] = derivedMailSent;

          // Normalize to fixed-length boolean array to avoid undefined accesses elsewhere
          const normalizedStatus = [0, 1, 2, 3, 4, 5].map(i => !!statusArray[i]);

            return {
            id: j.id,
            user_id: j.created_by_user_id ?? null,
            project_id: j.job_number ?? '',
            status: normalizedStatus,
            mail_quantity,
            template_type: 'financial',
            mail_piece_size: '',
            mail_piece_type: '',
            toll_free_number: '',
            landing_page_url: '',
            artwork_status: 'pending',
            list_status: 'pending',
            prepped_status: false,
            produced_status: false,
            paid_at,
            delivered_quantity,
            responder_count,
            // Advisor / company identity fields
            org_name: orgName,
            rep_name: orgContactName,
            company: orgName,
            // Explicit mailed count (separate from purchased list quantity)
            mailed_count: jobStatsByJobId.get(j.id)?.mailed_count ?? 0,
            // Stats object for CampaignCard consumption
            stats: {
              mailed_count: jobStatsByJobId.get(j.id)?.mailed_count ?? 0,
              delivered_count: jobStatsByJobId.get(j.id)?.delivered_count ?? 0,
              responses_total: jobStatsByJobId.get(j.id)?.responses_total ?? 0,
              first_delivery_at: jobStatsByJobId.get(j.id)?.first_delivery_at ?? null,
            },
            created_at: j.created_at,
            updated_at: j.updated_at,
          };
        });

        // Map job_meetings -> event-like objects
        const jobMeetEvents = (jobMeetings || []).map((m: any) => {
          // starts_at is stored as UTC ISO. Extract display values in LOCAL time so the
          // meeting clock time shown matches what the admin originally entered.
          const d = m.starts_at ? new Date(m.starts_at) : null;
          const pad = (n: number) => String(n).padStart(2, '0');
          // Use getUTC* so the stored UTC value is read back as-is (no browser
          // timezone offset applied — meeting times are literal local times).
          const localDate = d
            ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
            : '';
          const localTime = d
            ? `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
            : '';
          return {
            id: m.id,
            campaign_id: m.job_id,
            venue_name: m.location_name || '',
            venue_address: m.address1 || '',
            venue_city: m.city || '',
            venue_state: m.state || '',
            event_date: localDate,
            event_time: localTime,
            event_type: '',
            max_capacity: 0,
            status: 'open',
            created_at: m.created_at,
          };
        });

        console.log('[DIAG] jobMeetEvents mapped', { count: jobMeetEvents.length, events: jobMeetEvents.map((ev: any) => ({ id: ev.id, campaign_id: ev.campaign_id, venue_name: ev.venue_name, event_date: ev.event_date, event_time: ev.event_time })) });
        setCampaigns(jobsAsCampaigns as unknown as Campaign[]);
        setEvents(jobMeetEvents as unknown as Event[]);

        setDebugInfo({
          userId: user?.id,
          orgId,
          orgRole: (user as any)?.org_role,
          isMaster: user?.is_master_admin,
          jobsCount: jobsAsCampaigns.length,
          jobs: jobsAsCampaigns.map((j: any) => ({ id: j.id, project_id: j.project_id })),
          jobMeetingsCount: jobMeetings.length,
          jobMeetingsError: jobMeetingsError ? { code: jobMeetingsError.code, message: jobMeetingsError.message, details: jobMeetingsError.details } : null,
          jobMeetingsRaw: jobMeetings.map((m: any) => ({ id: m.id, job_id: m.job_id, location_name: m.location_name, address1: m.address1, city: m.city, state: m.state, starts_at: m.starts_at })),
          eventsCount: jobMeetEvents.length,
          events: jobMeetEvents.map((ev: any) => ({ id: ev.id, campaign_id: ev.campaign_id, venue_name: ev.venue_name, event_date: ev.event_date })),
        });
      } else {
        console.log('[DIAG] No jobs found — falling back to legacy campaigns/events');
        // Fallback to legacy campaigns/events
        setCampaigns(c || []);
        setEvents(e || []);
        setDebugInfo({
          userId: user?.id,
          orgId,
          orgRole: (user as any)?.org_role,
          isMaster: user?.is_master_admin,
          jobsCount: 0,
          jobMeetingsCount: 0,
          jobMeetingsError: null,
          note: 'No jobs returned — orgId may be null or RLS blocking jobs query',
        });
      }

      // Responders unchanged
      const rRes = await supabase.from('responders').select('*').order('created_at', { ascending: false });
      const r = rRes.data;
      console.log('[DIAG] responders query', { count: r?.length ?? 0, error: rRes.error, sample: (r || []).slice(0, 5).map((x: any) => ({ id: x.id, first_name: x.first_name, last_name: x.last_name, campaign_id: x.campaign_id, event_id: x.event_id })) });
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
      if (campaignsTableExistsRef.current) {
        try {
          await supabase.from('campaigns').update(updates).eq('id', id);
        } catch (err) {
          console.warn('Legacy campaigns update failed, continuing with local state update', err);
        }
      } else {
        console.warn('Skipping legacy campaigns update: table not present');
      }
      setCampaigns(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    } catch (error) {
      console.error('Error:', error);
    }
  };

  // Persist checklist updates to canonical jobs.notes (JSON blob). Only manual indexes are written back.
  const handleUpdateCampaignStatus = async (id: string, newStatus: boolean[]) => {
    try {
      // Normalize incoming status and optimistically update local state
      const normalizedNew = (Array.isArray(newStatus) ? newStatus : []).slice(0,5).map(Boolean);
      setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: normalizedNew } : c));

      // Read existing job notes (capture Supabase response for diagnostics)
      const { data: job, error: jobErr } = await supabase.from('jobs').select('id, notes').eq('id', id).maybeSingle();
      // eslint-disable-next-line no-console
      console.log('[checklist] selected job', { id, job, jobErr });

      let notesObj: any = {};
      try {
        if (job && job.notes) notesObj = typeof job.notes === 'string' ? JSON.parse(job.notes) : job.notes;
      } catch (err) {
        notesObj = { text: job?.notes ?? '' };
      }

      if (!notesObj) notesObj = {};
      if (!notesObj.checklist || typeof notesObj.checklist !== 'object') notesObj.checklist = {};
      const existingItems = (notesObj && typeof notesObj === 'object' &&
        notesObj.checklist && typeof notesObj.checklist === 'object' &&
        Array.isArray((notesObj.checklist as any).items)) ? (notesObj.checklist as any).items : [];

      // Manual indexes we persist: 0 (Demo Data Done), 2 (Design Chosen), 3 (Mailhouse Paid)
      const manualIndexes = [0, 2, 3];
      manualIndexes.forEach(i => {
        existingItems[i] = !!normalizedNew[i];
      });
      notesObj.checklist.items = existingItems;

      // Write back to jobs.notes as JSON string (capture response)
      const { data: updatedRows, error: updateErr } = await supabase
        .from('jobs')
        .update({ notes: JSON.stringify(notesObj) })
        .eq('id', id)
        .select('id, notes');
      // eslint-disable-next-line no-console
      console.log('[checklist] update result', { id, updatedRows, updateErr });

      if (updateErr) {
        // Propagate error so callers (and UI) know persistence failed
        throw updateErr;
      }
      if (!updatedRows || (Array.isArray(updatedRows) && updatedRows.length === 0)) {
        // eslint-disable-next-line no-console
        console.warn('[checklist] update returned no rows', { id });
      }

      // Preserve legacy campaigns behavior (attempt update if legacy table exists)
      try {
        if (campaignsTableExistsRef.current) {
          await supabase.from('campaigns').update({ status: newStatus }).eq('id', id);
        }
      } catch (err) {
        console.warn('Legacy campaigns update failed (status), continuing', err);
      }
    } catch (err) {
      console.error('Error in handleUpdateCampaignStatus', err);
    }
  };

  const handleCreateCampaign = async (data: any) => {
    try {
      const projectId = Math.floor(50000 + Math.random() * 10000).toString();

      const orgId = user?.is_master_admin ? (actingOrgId ?? null) : (user?.org_id ?? null);
      if (!orgId) {
        throw new Error('No org found for your user. Ask an admin to add you to an org.');
      }

      // Allocate job number
      const { data: jobNumberData, error: allocErr } = await supabase.rpc('allocate_job_number', { p_org_id: orgId });
      if (allocErr) throw allocErr;
      const jobNumber = String(jobNumberData ?? '');
      if (!jobNumber) throw new Error('Failed to allocate job number');

      // Insert canonical job
      const { data: insertedJob, error: jobInsErr } = await supabase
        .from('jobs')
        .insert({
          org_id: orgId,
          created_by_user_id: user?.id,
          job_number: jobNumber,
          status: 'pending',
          title: `Campaign ${projectId}`,
        })
        .select('id')
        .single();
      if (jobInsErr) throw jobInsErr;
      const jobId = (insertedJob as any).id;

      // Insert job_meetings for each event
      for (const event of data.events || []) {
        if (event.venue_name && event.event_date) {
          // Treat entered time as a literal local business time — store as UTC
          // by appending Z directly (no JS timezone offset applied).
          const timeVal = (event.event_time || '00:00').substring(0, 5);
          const startsAt = `${event.event_date}T${timeVal}:00Z`;

          const { error: jmErr } = await supabase.from('job_meetings').insert({
            job_id: jobId,
            starts_at: startsAt,
            location_name: event.venue_name,
            address1: event.venue_address,
            city: event.venue_city,
            state: event.venue_state,
          });
          if (jmErr) throw jmErr;
        }
      }

      // Legacy campaigns/events insert (preserve backward compatibility)
      let newCampaign: any = null;
      if (campaignsTableExistsRef.current) {
        try {
          const res = await supabase.from('campaigns').insert({
            user_id: user?.id,
            project_id: projectId,
            status: 'pending',
            mail_quantity: data.mail_quantity,
            template_type: data.template_type,
            mail_piece_size: data.mail_piece_size,
            mail_piece_type: data.mail_piece_type,
            toll_free_number: '800-786-8104',
            landing_page_url: `https://rsvp.meetingmanagerpro.com/${projectId}`,
          }).select().single();
          newCampaign = res.data;
        } catch (err) {
          console.warn('Skipping legacy campaigns insert due to error', err);
          newCampaign = null;
        }

        if (newCampaign) {
          for (const event of data.events || []) {
            if (event.venue_name && event.event_date) {
              try {
                const { error: evErr } = await supabase.from('events').insert({
                  campaign_id: (newCampaign as any).id,
                  venue_name: event.venue_name,
                  venue_address: event.venue_address,
                  venue_city: event.venue_city,
                  venue_state: event.venue_state,
                  event_date: event.event_date,
                  event_time: event.event_time,
                  max_capacity: event.max_capacity,
                });
                if (evErr) throw evErr;
              } catch (err) {
                console.warn('Skipping legacy event insert due to error', err);
              }
            }
          }
        }
      } else {
        console.warn('Skipping legacy campaigns/events inserts: `campaigns` table not present');
      }

      // Refresh UI after successful save
      await fetchData();

    } catch (error) {
      console.error('Error creating campaign/job:', error);
      throw error;
    }
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
        return <HomeView onNavigate={(view) => setActiveView(view)} campaigns={campaigns} events={events} onUpdateCampaignStatus={handleUpdateCampaignStatus} />;
      case 'master-clients':
        if (user?.is_master_admin && actingOrgId) {
          return <HomeView onNavigate={(view) => setActiveView(view)} onUpdateCampaignStatus={handleUpdateCampaignStatus} />;
        }
        return <MasterClientsView onNavigate={(view) => setActiveView(view)} />;
      case 'master-orgs':
        if (user?.is_master_admin && actingOrgId) {
          return <HomeView onNavigate={(view) => setActiveView(view)} onUpdateCampaignStatus={handleUpdateCampaignStatus} />;
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
      default: {
        // campaign-map:<jobId> — full interactive map view for a specific campaign
        if (activeView.startsWith('campaign-map:')) {
          const mapJobId = activeView.slice('campaign-map:'.length);
          const mapCampaign = campaigns.find(c => c.id === mapJobId);
          const mapEvents = getCampaignEvents(mapJobId);
          const venueAddr = mapEvents[0]
            ? [mapEvents[0].venue_name, mapEvents[0].venue_city, mapEvents[0].venue_state]
                .filter(Boolean).join(', ')
            : undefined;
          return (
            <CampaignMapView
              jobId={mapJobId}
              campaignName={(mapCampaign as any)?.name ?? (mapCampaign as any)?.campaign_name ?? undefined}
              venueAddress={venueAddr}
              onBack={() => setActiveView('campaigns')}
            />
          );
        }
        return renderDashboard();
      }
    }
  };


  const renderDashboard = () => (
    <>
      {/* ── TEMPORARY DIAGNOSTIC BLOCK — remove after meetings confirmed working ── */}
      {debugInfo && (
        <details className="mb-4 rounded border border-amber-300 bg-amber-50 text-[10px] font-mono" open>
          <summary className="px-3 py-1.5 cursor-pointer font-semibold text-amber-800 select-none">🔍 DIAG: meeting/event load trace (click to collapse)</summary>
          <div className="px-3 pb-3 pt-1 space-y-1 overflow-auto max-h-96 text-amber-900">
            <div><b>userId:</b> {debugInfo.userId ?? '—'}</div>
            <div><b>orgId:</b> {debugInfo.orgId ?? '—'}</div>
            <div><b>orgRole:</b> {debugInfo.orgRole ?? '—'}</div>
            <div><b>isMaster:</b> {String(debugInfo.isMaster)}</div>
            <div><b>jobs loaded:</b> {debugInfo.jobsCount} — {JSON.stringify(debugInfo.jobs)}</div>
            <div><b>job_meetings loaded:</b> {debugInfo.jobMeetingsCount}</div>
            <div><b>job_meetings RLS error:</b> {debugInfo.jobMeetingsError ? JSON.stringify(debugInfo.jobMeetingsError) : 'none'}</div>
            <div><b>job_meetings rows:</b> {JSON.stringify(debugInfo.jobMeetingsRaw)}</div>
            <div><b>events mapped:</b> {debugInfo.eventsCount} — {JSON.stringify(debugInfo.events)}</div>
            <div><b>note:</b> {debugInfo.note ?? '—'}</div>
            <div><b>responders (first 5):</b> {JSON.stringify(responders.slice(0,5).map(r => ({ id: r.id, name: `${r.first_name} ${r.last_name}`, campaign_id: r.campaign_id, event_id: r.event_id })))}</div>
            <div><b>getCampaignEvents check:</b> {campaigns.map(c => `job ${c.id} → ${events.filter(e => e.campaign_id === c.id).length} events`).join(' | ')}</div>
          </div>
        </details>
      )}
      {/* ── END DIAGNOSTIC BLOCK ── */}
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
                onRefresh={fetchData}
                onOpenMap={(jobId) => setActiveView(`campaign-map:${jobId}`)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50 print:bg-white print:m-0 print:p-0">
      <div className="flex print:m-0 print:p-0">
        <div className="print:hidden">
          <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} activeView={activeView}
            onViewChange={(view) => { if (view === 'new-campaign') { setShowNewCampaign(true); } else { setActiveView(view); } setSidebarOpen(false); }} />
        </div>
        <div className="flex-1 min-h-screen print:min-h-0 print:m-0 print:p-0">
          <div className="print:hidden">
            <Header onMenuClick={() => setSidebarOpen(true)} />
          </div>
          <main className="p-4 lg:p-6 print:p-0 print:m-0">{renderContent()}</main>
        </div>
      </div>
      <NewCampaignModal isOpen={showNewCampaign} onClose={() => setShowNewCampaign(false)} onSubmit={handleCreateCampaign} />
      <AddResponderModal isOpen={showAddResponder} onClose={() => setShowAddResponder(false)} campaigns={campaigns} events={events} onSuccess={fetchData} />
    </div>
  );
};

export default Dashboard;
