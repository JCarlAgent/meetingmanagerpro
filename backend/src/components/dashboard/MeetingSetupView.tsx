import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, FileText, Mail, MapPin, Phone, QrCode, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import FinalizeSummaryModal from './FinalizeSummaryModal';
import { loadSetupState, patchSetupState, type DemographicsMode, type RsvpMethod } from '@/lib/setupState';

interface MeetingSetupViewProps {
  onNewCampaign: () => void;
  onNavigate: (view: string) => void;
}

const MeetingSetupView: React.FC<MeetingSetupViewProps> = ({ onNewCampaign, onNavigate }) => {
  const { user } = useAuth();
  const [rsvpMethods, setRsvpMethods] = useState<Record<RsvpMethod, boolean>>({
    call_center: true,
    qr_code: true,
  });
  const [demographicsNotes, setDemographicsNotes] = useState('');
  const [demographicsMode, setDemographicsMode] = useState<DemographicsMode>('printer');

  const [initials, setInitials] = useState<Record<string, string>>({
    locations: '',
    template: '',
    rsvp: '',
    demographics: '',
    finalize: '',
  });

  const [isFinalizeOpen, setIsFinalizeOpen] = useState(false);
  const [isSavingFinalize, setIsSavingFinalize] = useState(false);

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

  type Step = {
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    primaryLabel: string;
    onPrimary: () => void;
    secondaryLabel?: string;
    onSecondary?: () => void;
    extra?: React.ReactNode;
    stageKey: 'locations' | 'template' | 'rsvp' | 'demographics' | 'finalize';
  };

  const saveStageInitials = async (stage: Step['stageKey']) => {
    if (!user?.id) {
      alert('You must be logged in to save initials.');
      return;
    }

    const jobId = loadSetupState().selectedJobId || window.localStorage.getItem('mmp_selected_job_id') || '';
    const stageInitials = (initials[stage] || '').trim().toUpperCase();

    if (!jobId) {
      alert('Pick/create a job in Demographics Upload first so we can save initials to that job.');
      return;
    }
    if (!stageInitials) {
      alert('Enter initials first.');
      return;
    }

    const summary: Record<string, unknown> = {
      rsvpMethods,
      demographics: {
        mode: demographicsMode,
        notes: demographicsNotes,
        listName: loadSetupState().demographicsUploadedListName ?? null,
      },
    };

    // Derive org_id from current jobs row (RLS allows select)
    const { data: jobRow, error: jobErr } = await supabase
      .from('jobs')
      .select('id, org_id')
      .eq('id', jobId)
      .maybeSingle();
    if (jobErr || !jobRow?.id) {
      alert('Unable to load job for signoff.');
      return;
    }

    const orgId = (jobRow as unknown as { org_id?: string | null }).org_id;
    if (!orgId) {
      alert('Job is missing org_id.');
      return;
    }

    const { error } = await supabase
      .from('job_stage_signoffs')
      .upsert(
        {
          job_id: jobId,
          org_id: orgId,
          stage,
          initials: stageInitials,
          signed_by_user_id: user?.id,
          signed_by_email: user?.email,
          summary,
        },
        { onConflict: 'job_id,stage' }
      );

    if (error) {
      alert(`Failed to save initials: ${error.message}`);
      return;
    }
  };

  const handleFinalize = async () => {
    setIsSavingFinalize(true);
    try {
      await saveStageInitials('finalize');
      setIsFinalizeOpen(false);
      // For now, route to reports after finalize.
      onNavigate('reports');
    } finally {
      setIsSavingFinalize(false);
    }
  };

  const steps: Step[] = useMemo(
    () => [
      {
        title: '1) Locations',
        description:
          'Decide where meetings will be held. Over time, we can save your venues for quick reuse.',
        icon: MapPin,
        primaryLabel: 'Choose locations + dates',
        onPrimary: () => onNavigate('events'),
        secondaryLabel: 'New campaign',
        onSecondary: onNewCampaign,
        stageKey: 'locations',
      },
      {
        title: '2) Message / mail template',
        description:
          'Select the approved template your FMO provides. Your locations/dates will be inserted into the mail piece.',
        icon: FileText,
        primaryLabel: 'Select template',
        onPrimary: () => onNavigate('templates'),
        secondaryLabel: 'View campaigns',
        onSecondary: () => onNavigate('campaigns'),
        stageKey: 'template',
      },
      {
        title: '3) RSVP method',
        description:
          'Enable call center, QR code, or both for responses.',
        icon: Phone,
        primaryLabel: 'Go to reports',
        onPrimary: () => onNavigate('reports'),
        stageKey: 'rsvp',
        extra: (
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
            <p className="mt-2 text-xs text-slate-500">Saved locally for now; next step is persisting this per campaign.</p>
          </div>
        ),
      },
      {
        title: '4) Demographics',
        description:
          'Choose the audience you want to mail. We can connect an API later to search/select targeting automatically.',
        icon: Users,
        primaryLabel: 'Upload mailing list',
        onPrimary: () => onNavigate('uploads'),
        secondaryLabel: 'Reports',
        onSecondary: () => onNavigate('reports'),
        stageKey: 'demographics',
        extra: (
          <div className="mt-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
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
              <p className="mt-2 text-xs text-slate-500">
                If you upload, use the Demographics CSV screen.
              </p>
            </div>

            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Demographics notes (temporary)
            </label>
            <textarea
              value={demographicsNotes}
              onChange={(e) => setDemographicsNotes(e.target.value)}
              rows={3}
              placeholder="Example: age 55-74, homeowner, $250k+ assets, within 10 miles..."
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/30"
            />
            <p className="mt-2 text-xs text-slate-500">Next up: demographics CSV upload attached to the job.</p>
          </div>
        ),
      },
      {
        title: '5) Finalize + launch',
        description:
          'Confirm your pieces are ready, launch the campaign, and monitor RSVPs/results.',
        icon: Mail,
        primaryLabel: 'Review + finalize',
        onPrimary: () => setIsFinalizeOpen(true),
        secondaryLabel: 'Campaigns',
        onSecondary: () => onNavigate('campaigns'),
        stageKey: 'finalize',
      },
    ],
    [demographicsMode, demographicsNotes, onNavigate, onNewCampaign, rsvpMethods]
  );

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Meeting setup</h1>
        <p className="text-slate-600 mt-1">
          Work through the 5 parts below to set up a meeting campaign.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-stretch">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <div key={step.title} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col h-full">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 bg-red-600/10 rounded-lg flex items-center justify-center">
                  <Icon className="w-4 h-4 text-red-600" />
                </div>
                <div className="flex-1">
                  <h2 className="text-sm font-semibold text-slate-900">{step.title}</h2>
                  <p className="text-xs text-slate-600 mt-1 leading-snug">{step.description}</p>

                  {step.extra}

                </div>
              </div>

              <div className="mt-auto pt-4">
                <div className="flex items-center gap-2">
                  <input
                    value={initials[step.stageKey] || ''}
                    onChange={(e) => setInitials((prev) => ({ ...prev, [step.stageKey]: e.target.value }))}
                    placeholder="Initials"
                    className="w-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                  />
                  <button
                    type="button"
                    onClick={() => saveStageInitials(step.stageKey)}
                    className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-medium px-3 py-2 rounded-lg transition-colors border border-slate-200 text-sm"
                  >
                    Save initials
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={step.onPrimary}
                    className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-3 py-2 rounded-lg transition-colors text-sm"
                  >
                    {step.primaryLabel} <ArrowRight className="w-4 h-4" />
                  </button>

                  {step.secondaryLabel && step.onSecondary && (
                    <button
                      type="button"
                      onClick={step.onSecondary}
                      className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-medium px-3 py-2 rounded-lg transition-colors border border-slate-200 text-sm"
                    >
                      {step.secondaryLabel}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <FinalizeSummaryModal
        open={isFinalizeOpen}
        onClose={() => setIsFinalizeOpen(false)}
        onConfirm={handleFinalize}
        isConfirming={isSavingFinalize}
        locations={[]}
        template={null}
        rsvpMethods={rsvpMethods}
        demographics={
          demographicsMode === 'printer'
            ? { mode: 'printer', notes: demographicsNotes }
            : { mode: 'upload', listName: loadSetupState().demographicsUploadedListName }
        }
      />
    </div>
  );
};

export default MeetingSetupView;
