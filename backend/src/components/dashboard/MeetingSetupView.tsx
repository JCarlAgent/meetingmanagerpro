import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, FileText, Mail, MapPin, Phone, QrCode, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/use-toast';
import { useActingOrg } from '@/lib/actingOrg';
import OrderListModal from "./OrderListModal";
import FinalizeSummaryModal from './FinalizeSummaryModal';
import AiCampaignQuery, { AiProposal } from './AiCampaignQuery';
import {
  clearSetupState,
  loadSetupState,
  patchSetupState,
  saveSetupState,
  type DemographicsMode,
  type MeetingDraft,
  type RsvpMethod,
} from '@/lib/setupState';

function formatUnknownError(err: unknown, fallback: string): string {
  if (!err) return fallback;
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === 'string') return err;

  if (typeof err === 'object') {
    const anyErr = err as any;
    const message = anyErr?.message || anyErr?.error || anyErr?.error_description;
    const code = anyErr?.code;
    const details = anyErr?.details;
    const hint = anyErr?.hint;

    const parts = [
      typeof message === 'string' ? message : null,
      typeof code === 'string' ? `code=${code}` : null,
      typeof details === 'string' ? details : null,
      typeof hint === 'string' ? `hint: ${hint}` : null,
    ].filter(Boolean);

    if (parts.length) return parts.join(' • ');

    try {
      return JSON.stringify(err);
    } catch {
      return fallback;
    }
  }

  return fallback;
}

interface MeetingSetupViewProps {
  onNewCampaign: () => void;
  onNavigate: (view: string) => void;
}

const MeetingSetupView: React.FC<MeetingSetupViewProps> = ({ onNewCampaign, onNavigate }) => {
  const { user } = useAuth();
  const { actingOrg } = useActingOrg();
  const [advisorOptions, setAdvisorOptions] = useState<Array<{ user_id: string; label: string }>>([]);
  const [assignedAdvisorUserId, setAssignedAdvisorUserId] = useState<string>('');
  const [jobs, setJobs] = useState<Array<{ id: string; job_number: string; title: string | null; status: string; org_id: string }>>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [newJobTitle, setNewJobTitle] = useState('');
  const [isCreatingJob, setIsCreatingJob] = useState(false);

  const [templates, setTemplates] = useState<Array<{ id: string; name: string; thumbnail_url: string | null }>>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  const [mailQuantity, setMailQuantity] = useState<number>(5000);

  const [rsvpMethods, setRsvpMethods] = useState<Record<RsvpMethod, boolean>>({
    call_center: true,
    qr_code: true,
  });
  const [demographicsNotes, setDemographicsNotes] = useState('');
  const [demographicsMode, setDemographicsMode] = useState<DemographicsMode>('printer');

  const [meetings, setMeetings] = useState<MeetingDraft[]>([]);
  const [meetingDraft, setMeetingDraft] = useState<MeetingDraft>(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return { location_name: '', address1: '', city: '', state: '', date: `${yyyy}-${mm}-${dd}`, time: '18:00' };
  });

  const [initials, setInitials] = useState<Record<string, string>>({
    locations: '',
    template: '',
    rsvp: '',
    demographics: '',
    finalize: '',
  });

  const [isFinalizeOpen, setIsFinalizeOpen] = useState(false);
  const [isSavingFinalize, setIsSavingFinalize] = useState(false);
  const [isOrderListOpen, setIsOrderListOpen] = useState(false);
  const isHydratedRef = useRef(false);
  const setupWindowRef = useRef<HTMLDivElement>(null);

  const resetFormState = () => {
    setSelectedTemplateId('');
    setMailQuantity(5000);
    setMeetings([]);
    setMeetingDraft(() => {
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return { location_name: '', address1: '', city: '', state: '', date: `${yyyy}-${mm}-${dd}`, time: '18:00' };
    });
    setRsvpMethods({ call_center: true, qr_code: true });
    setDemographicsNotes('');
    setDemographicsMode('printer');
    setInitials({ locations: '', template: '', rsvp: '', demographics: '', finalize: '' });

    clearSetupState();
    try {
      window.localStorage.removeItem('mmp_rsvp_methods');
      window.localStorage.removeItem('mmp_demographics_notes');
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    try {
      const saved = loadSetupState();

      const storedRsvp = window.localStorage.getItem('mmp_rsvp_methods');
      if (storedRsvp) {
        const parsed = JSON.parse(storedRsvp);
        if (
          parsed &&
          typeof parsed === 'object' &&
          typeof parsed.call_center === 'boolean' &&
          typeof parsed.qr_code === 'boolean'
        ) {
          setRsvpMethods({ call_center: parsed.call_center, qr_code: parsed.qr_code });
        }
      }

      if (saved.rsvpMethods && typeof saved.rsvpMethods.call_center === 'boolean' && typeof saved.rsvpMethods.qr_code === 'boolean') {
        setRsvpMethods({ call_center: saved.rsvpMethods.call_center, qr_code: saved.rsvpMethods.qr_code });
      }

      const storedDemo = window.localStorage.getItem('mmp_demographics_notes');
      if (typeof storedDemo === 'string') {
        setDemographicsNotes(storedDemo);
      }

      if (typeof saved.demographicsNotes === 'string') {
        setDemographicsNotes(saved.demographicsNotes);
      }

      if (saved.demographicsMode === 'printer' || saved.demographicsMode === 'upload') {
        setDemographicsMode(saved.demographicsMode);
      }

      if (typeof saved.selectedJobId === 'string' && saved.selectedJobId) {
        setSelectedJobId(saved.selectedJobId);
      } else {
        const storedJobId = window.localStorage.getItem('mmp_selected_job_id');
        if (storedJobId) setSelectedJobId(storedJobId);
      }
      
      // Auto-populate new campaign title from setup state if provided (e.g., from AI accept)
      if (typeof saved.campaignTitle === 'string' && saved.campaignTitle) {
        setNewJobTitle(saved.campaignTitle);
        // We will trigger auto-creation via another effect once org data loads
        window.localStorage.setItem('mmp_auto_create_job', 'true');
      }

      if (typeof saved.templateId === 'string') setSelectedTemplateId(saved.templateId);
      if (Array.isArray(saved.meetings)) setMeetings(saved.meetings as MeetingDraft[]);
      if (typeof saved.mailQuantity === 'number') setMailQuantity(saved.mailQuantity);

      isHydratedRef.current = true;
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('mmp_rsvp_methods', JSON.stringify(rsvpMethods));
      patchSetupState({ rsvpMethods });
    } catch {
      // ignore
    }
  }, [rsvpMethods]);

  const toggleRsvpMethod = (method: RsvpMethod) => {
    setRsvpMethods((prev) => {
      const next = { ...prev, [method]: !prev[method] };
      // Require at least one method enabled.
      if (!next.call_center && !next.qr_code) {
        return prev;
      }
      return next;
    });
  };

  useEffect(() => {
    try {
      window.localStorage.setItem('mmp_demographics_notes', demographicsNotes);
      patchSetupState({ demographicsNotes });
    } catch {
      // ignore
    }
  }, [demographicsNotes]);

  useEffect(() => {
    patchSetupState({ demographicsMode });
  }, [demographicsMode]);

  useEffect(() => {
    if (!isHydratedRef.current) return;
    patchSetupState({ selectedJobId });
    try {
      if (selectedJobId) window.localStorage.setItem('mmp_selected_job_id', selectedJobId);
    } catch {
      // ignore
    }
  }, [selectedJobId]);

  useEffect(() => {
    if (!isHydratedRef.current) return;
    patchSetupState({ meetings });
  }, [meetings]);

  useEffect(() => {
    if (!isHydratedRef.current) return;
    patchSetupState({ mailQuantity });
  }, [mailQuantity]);

  const loadJobs = async () => {
    setIsLoadingJobs(true);
    try {
      const effectiveOrgId = user?.is_master_admin ? (actingOrg?.id ?? null) : (user?.org_id ?? null);

      let query = supabase
        .from('jobs')
        .select('id, job_number, title, status, org_id')
        .order('created_at', { ascending: false })
        .limit(100);

      if (effectiveOrgId) {
        query = query.eq('org_id', effectiveOrgId);
      }

      const { data, error } = await query;
      if (error) throw error;
      const rows = ((data ?? []) as unknown as Array<{ id: string; job_number: string; title: string | null; status: string; org_id: string }>);
      setJobs(rows);
      if (!selectedJobId && rows.length) {
        setSelectedJobId(rows[0].id);
      }
    } finally {
      setIsLoadingJobs(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const effectiveOrgId = user?.is_master_admin ? (actingOrg?.id ?? null) : (user?.org_id ?? null);

      if (!effectiveOrgId) {
        setTemplates([]);
        return;
      }

      let query = supabase
        .from('mail_templates')
        .select('id, name, thumbnail_url')
        .eq('is_active', true)
        .order('industry', { ascending: true })
        .order('template_number', { ascending: true })
        .limit(200);

      query = query.eq('org_id', effectiveOrgId);

      const { data, error } = await query;
      if (error) {
        const code = (error as any)?.code;
        if (code === '42703') {
          const fallback = await supabase
            .from('mail_templates')
            .select('id, name, thumbnail_url')
            .eq('is_active', true)
            .order('industry', { ascending: true })
            .order('template_number', { ascending: true })
            .limit(200);
          if (fallback.error) throw fallback.error;
          setTemplates(((fallback.data ?? []) as unknown as Array<{ id: string; name: string; thumbnail_url: string | null }>));
          return;
        }
        throw error;
      }

      setTemplates(((data ?? []) as unknown as Array<{ id: string; name: string; thumbnail_url: string | null }>));
    } catch {
      setTemplates([]);
    }
  };

  useEffect(() => {
    loadJobs();
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
  
  useEffect(() => {
    const effectiveOrgId = user?.is_master_admin ? (actingOrg?.id ?? null) : (user?.org_id ?? null);
    const canAssign = Boolean(user?.is_admin || user?.is_master_admin);
    if (!effectiveOrgId || !canAssign) return;

    let isMounted = true;
    const loadAdvisors = async () => {
      try {
        const { data: members, error } = await supabase
          .from('org_members')
          .select('user_id, role')
          .eq('org_id', effectiveOrgId)
          .in('role', ['advisor', 'member'])
          .limit(2000);
        if (error) throw error;

        const ids = Array.from(new Set(((members ?? []) as any[]).map((m) => String(m.user_id))));
        let profileRows: any[] = [];
        if (ids.length) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('user_id, full_name, email')
            .in('user_id', ids)
            .limit(2000);
          profileRows = (profiles ?? []) as any[];
        }

        const byId = new Map(profileRows.map((p) => [String(p.user_id), p] as const));
        const options = ids
          .map((id) => {
            const p = byId.get(id);
            const label = (p?.full_name || p?.email || id) as string;
            return { user_id: id, label };
          })
          .sort((a, b) => a.label.localeCompare(b.label));

        if (!isMounted) return;
        setAdvisorOptions(options);
        setAssignedAdvisorUserId((prev) => prev || user?.id || '');
      } catch {
        if (!isMounted) return;
        setAdvisorOptions([]);
        setAssignedAdvisorUserId((prev) => prev || user?.id || '');
      }
    };

    loadAdvisors();
    return () => {
      isMounted = false;
    };
  }, [actingOrg?.id, user?.id, user?.is_admin, user?.is_master_admin, user?.org_id]);

  const createJob = async () => {
    const orgId = user?.is_master_admin ? (actingOrg?.id ?? null) : (user?.org_id ?? null);
    const title = newJobTitle.trim();
    if (!orgId) {
      alert('No org found for your user. Ask an admin to add you to an org.');
      return;
    }
    if (!title) {
      alert('Enter a campaign title.');
      return;
    }

    setIsCreatingJob(true);
    try {
      const { data: jobNumberData, error: allocErr } = await supabase.rpc('allocate_job_number', { p_org_id: orgId });
      if (allocErr) throw allocErr;
      const jobNumber = String(jobNumberData ?? '');
      if (!jobNumber) throw new Error('Failed to allocate job number');

      const { data: inserted, error: insErr } = await supabase
        .from('jobs')
        .insert({
          org_id: orgId,
          created_by_user_id:
            (user?.is_admin || user?.is_master_admin) && assignedAdvisorUserId
              ? assignedAdvisorUserId
              : user?.id,
          job_number: jobNumber,
          status: 'pending',
          title,
        })
        .select('id')
        .single();
      if (insErr) throw insErr;

      setNewJobTitle('');
      await loadJobs();
      setSelectedJobId((inserted as unknown as { id: string }).id);
    } catch (err: unknown) {
      alert(formatUnknownError(err, 'Failed to create job'));
    } finally {
      setIsCreatingJob(false);
    }
  };

  useEffect(() => {
    const shouldAutoCreate = window.localStorage.getItem('mmp_auto_create_job') === 'true';
    if (shouldAutoCreate && newJobTitle && user && (user.is_master_admin ? actingOrg : user.org_id)) {
      window.localStorage.removeItem('mmp_auto_create_job');
      patchSetupState({ campaignTitle: undefined });
      createJob();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, actingOrg, newJobTitle]);

  const getSelectedJob = () => jobs.find((j) => j.id === selectedJobId) || null;

  const requireJob = () => {
    if (!selectedJobId) {
      alert('Select or create a campaign first.');
      return null;
    }
    return getSelectedJob();
  };

  const upsertSignoff = async (stage: 'locations' | 'template' | 'rsvp' | 'demographics' | 'finalize', summary: Record<string, unknown>) => {
    if (!user?.id) throw new Error('Not logged in');
    const job = requireJob();
    if (!job) throw new Error('Missing job');

    const stageInitials = (initials[stage] || '').trim().toUpperCase();
    if (!stageInitials) throw new Error('Enter initials for this stage');

    const { error } = await supabase
      .from('job_stage_signoffs')
      .upsert(
        {
          job_id: job.id,
          org_id: job.org_id,
          stage,
          initials: stageInitials,
          signed_by_user_id: user.id,
          signed_by_email: user.email,
          summary,
        },
        { onConflict: 'job_id,stage' }
      );
    if (error) throw error;
  };

  const handleAiAccept = (proposal: AiProposal) => {
    // 1. Populate Meetings (Venues)
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
        time: ''
      };
    });
    setMeetings(newMeetings);

    // 2. Populate Mail Quantity
    const qtyMatch = proposal.mailStrategy.headline.replace(/,/g, '').match(/\d+/);
    if (qtyMatch) {
       setMailQuantity(parseInt(qtyMatch[0], 10));
    }

    // 3. Populate Demographics Notes
    setDemographicsNotes(`${proposal.targetAudience.headline}\n\n${proposal.targetAudience.subtext}\n\nVenue Context:\n${proposal.recommendedVenue.subtext}`);
    
    // Optional: We can also show a toast notification here
    toast({ title: 'Success', description: 'Campaign Strategy accepted and populated into Meeting Setup!' });
    
    // Scroll down to the form
    setTimeout(() => {
      setupWindowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const patchJobNotes = async (patch: Record<string, unknown>) => {
    const job = requireJob();
    if (!job) return;

    const current = loadSetupState();
    const nextNotes = {
      ...(typeof current === 'object' ? current : {}),
      ...patch,
    };

    // Store a compact JSON snapshot in jobs.notes for quick retrieval (optional)
    await supabase.from('jobs').update({ notes: JSON.stringify(nextNotes) }).eq('id', job.id);
  };

  const handleFinalize = async () => {
    setIsSavingFinalize(true);
    try {
      const state = loadSetupState();
      const job = requireJob();
      if (!job) return;

      const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) || null;

      const summary = {
        job: { id: job.id, job_number: job.job_number, title: job.title, status: job.status },
        meetings,
        template: selectedTemplate,
        rsvpMethods,
        demographics: {
          mode: demographicsMode,
          notes: demographicsNotes,
          listName: state.demographicsUploadedListName ?? null,
        },
        campaign: { mailQuantity },
      };

      await patchJobNotes({
        templateId: selectedTemplate?.id ?? null,
        templateName: selectedTemplate?.name ?? null,
        rsvpMethods,
        demographicsMode,
        demographicsNotes,
        demographicsUploadedListName: state.demographicsUploadedListName ?? null,
        mailQuantity,
        meetings,
      });

      await upsertSignoff('finalize', summary);

      // Send confirmation email (best-effort)
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (token) {
        fetch('/api/notifications/setupComplete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ jobId: job.id, summary }),
        }).catch(() => undefined);
      }

      setIsFinalizeOpen(false);
      resetFormState();
      // For now, route to reports after finalize.
      onNavigate('reports');
    } catch (err: unknown) {
      alert(formatUnknownError(err, 'Failed to finalize'));
    } finally {
      setIsSavingFinalize(false);
    }
  };

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) || null,
    [templates, selectedTemplateId]
  );

  const locationsForSummary = useMemo(() => {
    return meetings.map((m, idx) => ({
      label: `Meeting ${idx + 1}`,
      value: `${m.location_name} • ${m.address1} • ${m.city}, ${m.state} • ${m.date} ${m.time}`,
    }));
  }, [meetings]);

  if (user?.is_master_admin && !actingOrg?.id) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">Meeting Setup</h1>
          <p className="text-slate-600 mt-2">Select a client first to continue onboarding.</p>
          <button
            type="button"
            onClick={() => onNavigate('master-clients')}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-sm font-semibold transition-colors"
          >
            Go to Clients
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Meeting setup</h1>
        <p className="text-slate-600 mt-1">
          Confirm each step below. Your initials are saved per stage.
        </p>
      </div>

      {/* Campaign selector */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm mb-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700">Campaign</label>
            <select
              value={selectedJobId}
              onChange={(e) => {
                setSelectedJobId(e.target.value);
                const job = jobs.find((j) => j.id === e.target.value);
                if (job) {
                  patchSetupState({ selectedJobId: job.id, selectedJobNumber: job.job_number, campaignTitle: job.title ?? undefined });
                }
              }}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
            >
              <option value="">Select a campaign…</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.job_number}{j.title ? ` — ${j.title}` : ''}
                </option>
              ))}
            </select>
            <div className="mt-2 text-xs text-slate-500">
              {isLoadingJobs ? 'Loading campaigns…' : 'This links all confirmations + emails to the selected campaign.'}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">New campaign title</label>
            <div className="mt-2 flex gap-2">
              <input
                value={newJobTitle}
                onChange={(e) => setNewJobTitle(e.target.value)}
                placeholder="Example: Raleigh Dinner Seminar – March"
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/30"
              />
              <button
                type="button"
                onClick={createJob}
                disabled={isCreatingJob}
                className="inline-flex items-center justify-center bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold px-3 py-2 rounded-lg transition-colors"
              >
                {isCreatingJob ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>

          {(user?.is_admin || user?.is_master_admin) && (
            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-slate-700">Assign to advisor</label>
              <select
                value={assignedAdvisorUserId || user?.id || ''}
                onChange={(e) => setAssignedAdvisorUserId(e.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
              >
                <option value={user?.id || ''}>Me</option>
                {advisorOptions
                  .filter((o) => o.user_id !== user?.id)
                  .map((o) => (
                    <option key={o.user_id} value={o.user_id}>
                      {o.label}
                    </option>
                  ))}
              </select>
              <div className="mt-2 text-xs text-slate-500">
                The assigned advisor will see this meeting + mailer results on their Home dashboard.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AI Magic Query Bar (MeetingManagerPRO 2.0 Layer) */}
      <AiCampaignQuery onAcceptCampaign={handleAiAccept} />

      <div ref={setupWindowRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-stretch mt-6">
        {/* 1) Locations */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-red-600/10 rounded-lg flex items-center justify-center">
              <MapPin className="w-4 h-4 text-red-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-slate-900">1) Locations</h2>
              <p className="text-xs text-slate-600 mt-1">Enter meeting locations + times.</p>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            <input
              value={meetingDraft.location_name}
              onChange={(e) => setMeetingDraft((p) => ({ ...p, location_name: e.target.value }))}
              placeholder="Meeting name (example: Ruth’s Chris)"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            />
            <input
              value={meetingDraft.address1}
              onChange={(e) => setMeetingDraft((p) => ({ ...p, address1: e.target.value }))}
              placeholder="Street address"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={meetingDraft.city}
                onChange={(e) => setMeetingDraft((p) => ({ ...p, city: e.target.value }))}
                placeholder="City"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <input
                value={meetingDraft.state}
                onChange={(e) => setMeetingDraft((p) => ({ ...p, state: e.target.value.toUpperCase() }))}
                placeholder="State"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={meetingDraft.date}
                onChange={(e) => setMeetingDraft((p) => ({ ...p, date: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <input
                type="time"
                value={meetingDraft.time}
                onChange={(e) => setMeetingDraft((p) => ({ ...p, time: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                const m = { ...meetingDraft };
                if (!m.location_name || !m.address1 || !m.city || !m.state || !m.date || !m.time) {
                  alert('Fill out all location fields first.');
                  return;
                }
                setMeetings((prev) => [...prev, m]);
              }}
              className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-medium px-3 py-2 rounded-lg transition-colors border border-slate-200 text-sm"
            >
              Add meeting
            </button>

            {meetings.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Meetings</p>
                <ul className="mt-2 space-y-1">
                  {meetings.map((m, idx) => (
                    <li key={idx} className="text-xs text-slate-700 flex items-start justify-between gap-2">
                      <span>{m.location_name} • {m.city}, {m.state} • {m.date} {m.time}</span>
                      <button
                        type="button"
                        onClick={() => setMeetings((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-xs text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="mt-auto pt-4">
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Initials</label>
                <input
                  value={initials.locations}
                  onChange={(e) => setInitials((p) => ({ ...p, locations: e.target.value }))}
                  placeholder="Initials"
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const job = requireJob();
                    if (!job) return;
                    if (meetings.length === 0) {
                      alert('Add at least one meeting.');
                      return;
                    }

                    // Replace meetings for this job
                    const { error: delErr } = await supabase.from('job_meetings').delete().eq('job_id', job.id);
                    if (delErr) throw delErr;

                    const payload = meetings.map((m) => ({
                      job_id: job.id,
                      location_name: m.location_name,
                      address1: m.address1,
                      city: m.city,
                      state: m.state,
                      starts_at: new Date(`${m.date}T${m.time}:00`).toISOString(),
                    }));

                    const { error: insErr } = await supabase.from('job_meetings').insert(payload);
                    if (insErr) throw insErr;

                    await patchJobNotes({ meetings });
                    await upsertSignoff('locations', { meetings });
                    alert('Locations confirmed.');
                  } catch (err: unknown) {
                    alert(formatUnknownError(err, 'Failed to confirm locations'));
                  }
                }}
                className="w-full h-12 inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-3 rounded-lg transition-colors text-sm"
              >
                Confirm locations and dates <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* 2) Template */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-red-600/10 rounded-lg flex items-center justify-center">
              <FileText className="w-4 h-4 text-red-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-slate-900">2) Template</h2>
              <p className="text-xs text-slate-600 mt-1">Choose the mail piece template.</p>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">Select a template…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>

            {selectedTemplate && (
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="w-14 h-14 rounded-lg bg-white border border-slate-200 overflow-hidden flex items-center justify-center">
                  {selectedTemplate.thumbnail_url ? (
                    <img src={selectedTemplate.thumbnail_url} alt={selectedTemplate.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-xs text-slate-400">No image</div>
                  )}
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">{selectedTemplate.name}</div>
                  <div className="text-xs text-slate-500">Selected template</div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-auto pt-4">
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Initials</label>
                <input
                  value={initials.template}
                  onChange={(e) => setInitials((p) => ({ ...p, template: e.target.value }))}
                  placeholder="Initials"
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const job = requireJob();
                    if (!job) return;
                    if (!selectedTemplate) {
                      alert('Select a template first.');
                      return;
                    }
                    patchSetupState({ templateId: selectedTemplate.id, templateName: selectedTemplate.name, templateThumbnailUrl: selectedTemplate.thumbnail_url });
                    await patchJobNotes({ templateId: selectedTemplate.id, templateName: selectedTemplate.name, templateThumbnailUrl: selectedTemplate.thumbnail_url });
                    await upsertSignoff('template', { template: selectedTemplate });
                    alert('Template confirmed.');
                  } catch (err: unknown) {
                    alert(formatUnknownError(err, 'Failed to confirm template'));
                  }
                }}
                className="w-full h-12 inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-3 rounded-lg transition-colors text-sm"
              >
                Confirm template <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* 3) Confirmation Method(s) */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-red-600/10 rounded-lg flex items-center justify-center">
              <Phone className="w-4 h-4 text-red-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-slate-900">3) Confirmation method(s)</h2>
              <p className="text-xs text-slate-600 mt-1">Enable call center, QR code, or both.</p>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={rsvpMethods.call_center}
                  onChange={() => toggleRsvpMethod('call_center')}
                  className="h-4 w-4 accent-red-600"
                />
                <span className="inline-flex items-center gap-2">
                  <Phone className="h-4 w-4 text-slate-600" /> Call center
                </span>
              </label>
              <label className="flex items-center gap-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={rsvpMethods.qr_code}
                  onChange={() => toggleRsvpMethod('qr_code')}
                  className="h-4 w-4 accent-red-600"
                />
                <span className="inline-flex items-center gap-2">
                  <QrCode className="h-4 w-4 text-slate-600" /> QR code
                </span>
              </label>
            </div>
          </div>

          <div className="mt-auto pt-4">
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Initials</label>
                <input
                  value={initials.rsvp}
                  onChange={(e) => setInitials((p) => ({ ...p, rsvp: e.target.value }))}
                  placeholder="Initials"
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const job = requireJob();
                    if (!job) return;
                    await patchJobNotes({ rsvpMethods });
                    await upsertSignoff('rsvp', { rsvpMethods });
                    alert('Confirmation methods confirmed.');
                  } catch (err: unknown) {
                    alert(formatUnknownError(err, 'Failed to confirm confirmation methods'));
                  }
                }}
                className="w-full h-12 inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-3 rounded-lg transition-colors text-sm"
              >
                Confirm confirmation method(s) <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* 4) Mailing list details */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-red-600/10 rounded-lg flex items-center justify-center">
              <Users className="w-4 h-4 text-red-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-slate-900">4) Mailing list details</h2>
              <p className="text-xs text-slate-600 mt-1">Send to printer or upload your own list.</p>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">List source</p>
            <label className="mt-2 flex items-start gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={demographicsMode === 'printer'}
                onChange={() => setDemographicsMode('printer')}
                className="h-4 w-4 mt-0.5 accent-red-600"
              />
              <span>
                <span className="font-medium text-slate-900">Send demographics to printer</span>
                <span className="block text-xs text-slate-500">Printer orders/provides the list.</span>
              </span>
            </label>
            <label className="mt-2 flex items-start gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={demographicsMode === 'upload'}
                onChange={() => setDemographicsMode('upload')}
                className="h-4 w-4 mt-0.5 accent-red-600"
              />
              <span>
                <span className="font-medium text-slate-900">Upload my own list</span>
                <span className="block text-xs text-slate-500">Upload a CSV and track “times mailed”.</span>
              </span>
            </label>

            {demographicsMode === 'upload' && (
              <div className="mt-2 text-xs text-slate-600">
                Uploaded list: <span className="font-semibold">{loadSetupState().demographicsUploadedListName || 'None yet'}</span>
                <button
                  type="button"
                  onClick={() => onNavigate('uploads')}
                  className="ml-2 text-red-600 hover:text-red-700 font-medium"
                >
                  Upload now
                </button>
              </div>
            )}
          </div>

          <div className="mt-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Notes</label>
              <button
                type="button"
                onClick={() => setIsOrderListOpen(true)}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded transition-colors"
              >
                Order List From Provider
              </button>
            </div>
            <textarea
              value={demographicsNotes}
              onChange={(e) => setDemographicsNotes(e.target.value)}
              rows={3}
              placeholder="Example: age 55-74, homeowner, $250k+ assets, within 10 miles..."
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </div>

          <div className="mt-auto pt-4">
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Initials</label>
                <input
                  value={initials.demographics}
                  onChange={(e) => setInitials((p) => ({ ...p, demographics: e.target.value }))}
                  placeholder="Initials"
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const job = requireJob();
                    if (!job) return;
                    const state = loadSetupState();
                    if (demographicsMode === 'upload' && !state.demographicsUploadedListName) {
                      alert('Upload a list (or switch to printer-provided demographics) before confirming.');
                      return;
                    }
                    await patchJobNotes({ demographicsMode, demographicsNotes, demographicsUploadedListName: state.demographicsUploadedListName ?? null });
                    await upsertSignoff('demographics', {
                      demographicsMode,
                      demographicsNotes,
                      demographicsUploadedListName: state.demographicsUploadedListName ?? null,
                    });
                    alert('Mailing list details confirmed.');
                  } catch (err: unknown) {
                    alert(formatUnknownError(err, 'Failed to confirm mailing list details'));
                  }
                }}
                className="w-full h-12 inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-3 rounded-lg transition-colors text-sm"
              >
                Confirm mailing list details <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 5) Campaign details (compact) */}
      <div className="mt-3 bg-white rounded-xl border border-slate-200 p-4 shadow-sm max-w-3xl">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 bg-red-600/10 rounded-lg flex items-center justify-center">
            <Mail className="w-4 h-4 text-red-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-slate-900">5) Campaign details</h2>
            <p className="text-xs text-slate-600 mt-1">Final confirmation + send emails.</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Mail quantity</label>
            <input
              type="number"
              min={0}
              value={mailQuantity}
              onChange={(e) => setMailQuantity(Number(e.target.value || 0))}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Initials</label>
            <input
              value={initials.finalize}
              onChange={(e) => setInitials((p) => ({ ...p, finalize: e.target.value }))}
              placeholder="Initials"
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              // Persist some values in setup state for summary continuity
              const job = getSelectedJob();
              saveSetupState({
                ...loadSetupState(),
                selectedJobId: selectedJobId || undefined,
                selectedJobNumber: job?.job_number,
                campaignTitle: job?.title ?? undefined,
                mailQuantity,
                templateId: selectedTemplate?.id,
                templateName: selectedTemplate?.name,
                templateThumbnailUrl: selectedTemplate?.thumbnail_url ?? null,
                meetings,
                rsvpMethods,
                demographicsNotes,
                demographicsMode,
              });
              setIsFinalizeOpen(true);
            }}
            className="w-full inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-3 py-2.5 rounded-lg transition-colors text-sm"
          >
            Confirm campaign details <ArrowRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => onNewCampaign()}
            className="w-full inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-medium px-3 py-2.5 rounded-lg transition-colors border border-slate-200 text-sm"
          >
            New campaign
          </button>
        </div>
      </div>

      <FinalizeSummaryModal
        open={isFinalizeOpen}
        onClose={() => setIsFinalizeOpen(false)}
        onConfirm={handleFinalize}
        isConfirming={isSavingFinalize}
        locations={locationsForSummary}
        template={selectedTemplate ? { name: selectedTemplate.name, thumbnail_url: selectedTemplate.thumbnail_url } : null}
        rsvpMethods={rsvpMethods}
        demographics={
          demographicsMode === 'printer'
            ? { mode: 'printer', notes: demographicsNotes }
            : { mode: 'upload', listName: loadSetupState().demographicsUploadedListName }
        }
      />

      <OrderListModal
        open={isOrderListOpen}
        onClose={() => setIsOrderListOpen(false)}
        demographicsNotes={demographicsNotes}
      />
    </div>
  );
};

export default MeetingSetupView;
