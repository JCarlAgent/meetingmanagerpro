import React from 'react';
import { Calendar, FileText, FolderKanban, Mail, BarChart3, Users, ArrowRight } from 'lucide-react';

interface MeetingSetupViewProps {
  onNewCampaign: () => void;
  onNavigate: (view: string) => void;
}

const MeetingSetupView: React.FC<MeetingSetupViewProps> = ({ onNewCampaign, onNavigate }) => {
  const steps = [
    {
      title: '1) Create a campaign',
      description: 'Start a new meeting campaign and generate a project ID + RSVP link.',
      icon: FolderKanban,
      primaryLabel: 'New campaign',
      onPrimary: onNewCampaign,
      secondaryLabel: 'View campaigns',
      onSecondary: () => onNavigate('campaigns'),
    },
    {
      title: '2) Add event details',
      description: 'Add venues, dates, times, and capacity. Keep everything consistent for your advisors.',
      icon: Calendar,
      primaryLabel: 'Events',
      onPrimary: () => onNavigate('events'),
      secondaryLabel: 'Responders',
      onSecondary: () => onNavigate('responders'),
    },
    {
      title: '3) Upload mailing list',
      description: 'Upload CSVs tied to the campaign for tracking and reconciliation.',
      icon: Users,
      primaryLabel: 'Upload CSV',
      onPrimary: () => onNavigate('uploads'),
      secondaryLabel: 'Reports',
      onSecondary: () => onNavigate('reports'),
    },
    {
      title: '4) Select templates',
      description: 'Pick or manage print/mail templates aligned with your organization brand.',
      icon: FileText,
      primaryLabel: 'Templates',
      onPrimary: () => onNavigate('templates'),
    },
    {
      title: '5) Launch + track',
      description: 'Send to print/mail and monitor delivery and response activity as it happens.',
      icon: Mail,
      primaryLabel: 'Reports',
      onPrimary: () => onNavigate('reports'),
    },
    {
      title: '6) Report outcomes',
      description: 'See RSVPs, appointments, and results by advisor or branch.',
      icon: BarChart3,
      primaryLabel: 'Reporting',
      onPrimary: () => onNavigate('reports'),
    },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Meeting setup</h1>
        <p className="text-slate-400 mt-1">
          Follow the phases below to launch a meeting campaign from start to finish.
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
