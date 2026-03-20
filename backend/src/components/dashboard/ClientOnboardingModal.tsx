import React, { useState } from 'react';
import { X, Building2, User, ChevronRight, Activity, TrendingUp, CheckCircle2 } from 'lucide-react';

type Step = 'type' | 'engine' | 'details' | 'confirm';

type ClientTargetType = 'medicare' | 'wealth' | null;
type ClientEntityType = 'fmo' | 'advisor' | null;

interface ClientOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function ClientOnboardingModal({ isOpen, onClose, onSuccess }: ClientOnboardingModalProps) {
  const [step, setStep] = useState<Step>('type');
  const [entityType, setEntityType] = useState<ClientEntityType>(null);
  const [targetType, setTargetType] = useState<ClientTargetType>(null);
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  
  const [isDeploying, setIsDeploying] = useState(false);

  if (!isOpen) return null;

  const handleNext = () => {
    if (step === 'type') setStep('engine');
    else if (step === 'engine') setStep('details');
    else if (step === 'details') setStep('confirm');
  };

  const handleBack = () => {
    if (step === 'engine') setStep('type');
    else if (step === 'details') setStep('engine');
    else if (step === 'confirm') setStep('details');
  };

  const handleDeploy = async () => {
    setIsDeploying(true);
    setTimeout(() => {
      setIsDeploying(false);
      if (onSuccess) onSuccess();
      onClose();
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Master System Onboarding</h2>
            <p className="text-sm text-slate-500">Deploy a new dedicated environment</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          {/* Progress bar and UI placeholder text */}
          <div className="flex items-center justify-between mb-8 relative">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-100 rounded-full -z-10"></div>
            <div 
              className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-indigo-600 rounded-full -z-10 transition-all duration-300"
              style={{ width: step === 'type' ? '0%' : step === 'engine' ? '33%' : step === 'details' ? '66%' : '100%' }}
            ></div>
            {[{ id: 'type', label: 'Entity' }, { id: 'engine', label: 'Engine' }, { id: 'details', label: 'Details' }, { id: 'confirm', label: 'Deploy' }].map((s, idx) => {
              const stages = ['type', 'engine', 'details', 'confirm'];
              const currentIdx = stages.indexOf(step);
              const isPast = idx < currentIdx;
              const isCurrent = idx === currentIdx;
              
              return (
                <div key={s.id} className="flex flex-col items-center bg-white px-2">
                  <div className={"w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors " + (
                    isPast ? 'bg-indigo-600 border-indigo-600 text-white' :
                    isCurrent ? 'bg-white border-indigo-600 text-indigo-600' :
                    'bg-slate-50 border-slate-200 text-slate-400'
                  )}>
                    {isPast ? <CheckCircle2 className="w-5 h-5" /> : idx + 1}
                  </div>
                  <span className={"text-xs mt-2 font-medium " + (isCurrent ? 'text-indigo-900' : 'text-slate-500')}>{s.label}</span>
                </div>
              );
            })}
          </div>

          {step === 'type' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <h3 className="text-lg font-medium text-slate-900 mb-4">What type of client are you onboarding?</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => setEntityType('fmo')}
                  className={"p-6 rounded-xl border-2 text-left transition-all " + (
                    entityType === 'fmo' 
                      ? 'border-indigo-600 bg-indigo-50/50 shadow-md ring-1 ring-indigo-500/20' 
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  )}
                >
                  <Building2 className={"w-8 h-8 mb-3 " + (entityType === 'fmo' ? 'text-indigo-600' : 'text-slate-500')} />
                  <h4 className={"text-base font-semibold " + (entityType === 'fmo' ? 'text-indigo-900' : 'text-slate-900')}>FMO / Enterprise</h4>
                  <p className="text-sm text-slate-500 mt-1">Large organization managing multiple downstream agents and advisors.</p>
                </button>

                <button
                  onClick={() => setEntityType('advisor')}
                  className={"p-6 rounded-xl border-2 text-left transition-all " + (
                    entityType === 'advisor' 
                      ? 'border-indigo-600 bg-indigo-50/50 shadow-md ring-1 ring-indigo-500/20' 
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  )}
                >
                  <User className={"w-8 h-8 mb-3 " + (entityType === 'advisor' ? 'text-indigo-600' : 'text-slate-500')} />
                  <h4 className={"text-base font-semibold " + (entityType === 'advisor' ? 'text-indigo-900' : 'text-slate-900')}>Independent Advisor</h4>
                  <p className="text-sm text-slate-500 mt-1">Solo practitioner or small firm running their own direct campaigns.</p>
                </button>
              </div>
            </div>
          )}

          {step === 'engine' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <h3 className="text-lg font-medium text-slate-900 mb-4">Select the Target Pipeline Engine</h3>
              <p className="text-sm text-slate-500 mb-6">This dictates which UI dashboards, APIs, and demographic filters the client will access.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => setTargetType('medicare')}
                  className={"p-6 rounded-xl border-2 text-left transition-all " + (
                    targetType === 'medicare' 
                      ? 'border-blue-600 bg-blue-50/50 shadow-md ring-1 ring-blue-500/20' 
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  )}
                >
                  <Activity className={"w-8 h-8 mb-3 " + (targetType === 'medicare' ? 'text-blue-600' : 'text-slate-500')} />
                  <h4 className={"text-base font-semibold " + (targetType === 'medicare' ? 'text-blue-900' : 'text-slate-900')}>Medicare Engine</h4>
                  <ul className="text-xs text-slate-500 mt-3 space-y-1.5 list-disc list-inside ml-1">
                    <li>Radius-based targeting</li>
                    <li>Age 64-72 pipeline</li>
                    <li>API: DataAxle + HomeData</li>
                    <li>Lower unit cost / High volume</li>
                  </ul>
                </button>

                <button
                  onClick={() => setTargetType('wealth')}
                  className={"p-6 rounded-xl border-2 text-left transition-all " + (
                    targetType === 'wealth' 
                      ? 'border-emerald-600 bg-emerald-50/50 shadow-md ring-1 ring-emerald-500/20' 
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  )}
                >
                  <TrendingUp className={"w-8 h-8 mb-3 " + (targetType === 'wealth' ? 'text-emerald-600' : 'text-slate-500')} />
                  <h4 className={"text-base font-semibold " + (targetType === 'wealth' ? 'text-emerald-900' : 'text-slate-900')}>Financial / Wealth Engine</h4>
                  <ul className="text-xs text-slate-500 mt-3 space-y-1.5 list-disc list-inside ml-1">
                    <li>Target: Net Worth &amp; Liquid Assets</li>
                    <li>Age 55+ &amp; Income $150k+</li>
                    <li>API: Experian + Acxiom + Epsilon</li>
                    <li>Predictive Algorithm Scoring</li>
                  </ul>
                </button>
              </div>
            </div>
          )}

          {step === 'details' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <h3 className="text-lg font-medium text-slate-900 mb-4">Client Contact Details</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {entityType === 'fmo' ? 'Organization Name' : 'Advisor Name'}
                  </label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="w-full rounded-lg border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 px-4 py-2"
                    placeholder="e.g. Acme Financial"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Admin / Owner Email
                  </label>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    className="w-full rounded-lg border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 px-4 py-2"
                    placeholder="admin@example.com"
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    They will receive an invitation link to set their password.
                  </p>
                </div>
              </div>
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
                <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-indigo-600" />
                  Ready to Deploy Tenant
                </h3>
                
                <div className="space-y-3">
                  <div className="grid grid-cols-3 text-sm">
                    <span className="col-span-1 text-slate-500 font-medium">Client Type:</span>
                    <span className="col-span-2 text-slate-900 font-medium capitalize">{entityType === 'fmo' ? 'FMO Enterprise' : 'Independent Advisor'}</span>
                  </div>
                  <div className="grid grid-cols-3 text-sm">
                    <span className="col-span-1 text-slate-500 font-medium">Pipeline Eng.:</span>
                    <span className="col-span-2 flex items-center gap-2 font-medium">
                      {targetType === 'medicare' ? (
                        <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-md bg-blue-100 text-blue-800"><Activity className="w-3.5 h-3.5"/> Medicare Engine</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-md bg-emerald-100 text-emerald-800"><TrendingUp className="w-3.5 h-3.5"/> Wealth Engine</span>
                      )}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 text-sm pt-2 border-t border-slate-200">
                    <span className="col-span-1 text-slate-500 font-medium">Name:</span>
                    <span className="col-span-2 text-slate-900">{clientName || 'N/A'}</span>
                  </div>
                  <div className="grid grid-cols-3 text-sm">
                    <span className="col-span-1 text-slate-500 font-medium">Admin:</span>
                    <span className="col-span-2 text-slate-900">{clientEmail || 'N/A'}</span>
                  </div>
                </div>
              </div>
              
              <div className="text-sm text-slate-600 bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                <p><strong>Next steps:</strong> Generating this workspace will automatically configure the correct UI filters, setup the appropriate Data API connections (DataAxle vs Experian), and send an invite bridge link to the client.</p>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between mt-auto">
          {step !== 'type' ? (
            <button
              onClick={handleBack}
              disabled={isDeploying}
              className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
            >
              Back
            </button>
          ) : <div></div>}
          
          {step !== 'confirm' ? (
            <button
              onClick={handleNext}
              disabled={(step === 'type' && !entityType) || (step === 'engine' && !targetType) || (step === 'details' && (!clientName || !clientEmail))}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleDeploy}
              disabled={isDeploying}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {isDeploying ? (
                <span>Deploying...</span>
              ) : (
                'Deploy Client Workspace'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
