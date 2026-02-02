import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Calendar, FileText, FolderKanban, Mail, MapPin, Phone, QrCode, Users } from 'lucide-react';

interface MeetingSetupViewProps {
  onNewCampaign: () => void;
  onNavigate: (view: string) => void;
}

const MeetingSetupView: React.FC<MeetingSetupViewProps> = ({ onNewCampaign, onNavigate }) => {
  const [rsvpMethod, setRsvpMethod] = useState<'call_center' | 'qr_code'>('qr_code');
  const [demographicsNotes, setDemographicsNotes] = useState('');

  useEffect(() => {
    try {
      const storedRsvp = window.localStorage.getItem('mmp_rsvp_method');
      if (storedRsvp === 'call_center' || storedRsvp === 'qr_code') {
        setRsvpMethod(storedRsvp);
      }
      const storedDemo = window.localStorage.getItem('mmp_demographics_notes');
      if (typeof storedDemo === 'string') {
        setDemographicsNotes(storedDemo);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('mmp_rsvp_method', rsvpMethod);
    } catch {
      // ignore
    }
  }, [rsvpMethod]);

  useEffect(() => {
    try {
      window.localStorage.setItem('mmp_demographics_notes', demographicsNotes);
    } catch {
      // ignore
    }
  }, [demographicsNotes]);

  type Step = {
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    primaryLabel: string;
    onPrimary: () => void;
    secondaryLabel?: string;
    onSecondary?: () => void;
    extra?: React.ReactNode;
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
      },
      {
        title: '3) RSVP method',
        description:
          'Choose whether you’ll use a call center or a simple QR code for responses.',
        icon: Phone,
        primaryLabel: 'Go to reports',
        onPrimary: () => onNavigate('reports'),
        extra: (
          <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-3 text-sm text-slate-200">
                <input
                  type="radio"
                  name="rsvp-method"
                  value="call_center"
                  checked={rsvpMethod === 'call_center'}
                  onChange={() => setRsvpMethod('call_center')}
                  className="h-4 w-4 accent-red-500"
                />
                <span className="inline-flex items-center gap-2">
                  <Phone className="h-4 w-4 text-slate-300" /> Call center
                </span>
              </label>
              <label className="flex items-center gap-3 text-sm text-slate-200">
                <input
                  type="radio"
                  name="rsvp-method"
                  value="qr_code"
                  checked={rsvpMethod === 'qr_code'}
                  onChange={() => setRsvpMethod('qr_code')}
                  className="h-4 w-4 accent-red-500"
                />
                <span className="inline-flex items-center gap-2">
                  <QrCode className="h-4 w-4 text-slate-300" /> QR code
                </span>
              </label>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Saved locally for now; we’ll persist this per campaign once the setup model is wired.
            </p>
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
        extra: (
          <div className="mt-4">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Demographics notes (placeholder)
            </label>
            <textarea
              value={demographicsNotes}
              onChange={(e) => setDemographicsNotes(e.target.value)}
              rows={3}
              placeholder="Example: age 55-74, homeowner, $250k+ assets, within 10 miles..."
              className="mt-2 w-full rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/40"
            />
            <p className="mt-2 text-xs text-slate-400">
              Once an API is connected, this becomes a searchable selector instead of free-form notes.
            </p>
          </div>
        ),
      },
      {
        title: '5) Finalize + launch',
        description:
          'Confirm your pieces are ready, launch the campaign, and monitor RSVPs/results.',
        icon: Mail,
        primaryLabel: 'Reports + tracking',
        onPrimary: () => onNavigate('reports'),
        secondaryLabel: 'Campaigns',
        onSecondary: () => onNavigate('campaigns'),
      },
    ],
    [demographicsNotes, onNavigate, onNewCampaign, rsvpMethod]
  );

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Meeting setup</h1>
        <p className="text-slate-400 mt-1">
          Work through the 5 parts below to set up a meeting campaign.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <div key={step.title} className="bg-slate-800/50 rounded-xl border border-white/10 p-6">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-red-600/20 rounded-lg flex items-center justify-center">
                  <Icon className="w-5 h-5 text-red-400" />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-white">{step.title}</h2>
                  <p className="text-sm text-slate-400 mt-1">{step.description}</p>

                  {step.extra}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={step.onPrimary}
                      className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
                    >
                      {step.primaryLabel} <ArrowRight className="w-4 h-4" />
                    </button>

                    {step.secondaryLabel && step.onSecondary && (
                      <button
                        type="button"
                        onClick={step.onSecondary}
                        className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 text-slate-200 font-medium px-4 py-2 rounded-lg transition-colors border border-white/10"
                      >
                        {step.secondaryLabel}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MeetingSetupView;
