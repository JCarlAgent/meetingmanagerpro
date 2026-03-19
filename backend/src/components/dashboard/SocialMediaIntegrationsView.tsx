import React, { useState } from 'react';
import { Facebook, Instagram, Linkedin, Twitter, Share2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Platform {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  mode: 'manual' | 'oauth';
  oauthConnected: boolean;
}

const initialPlatforms: Platform[] = [
  {
    id: 'linkedin',
    name: 'LinkedIn',
    description: 'Professional networking platform ideal for corporate rollovers and high-net-worth individuals.',
    icon: Linkedin,
    color: 'text-[#0A66C2]',
    bgColor: 'bg-[#0A66C2]/10',
    mode: 'manual',
    oauthConnected: false
  },
  {
    id: 'facebook',
    name: 'Facebook',
    description: 'Massive reach for the 65+ demographic. Ideal for broad community seminar invites.',
    icon: Facebook,
    color: 'text-[#1877F2]',
    bgColor: 'bg-[#1877F2]/10',
    mode: 'manual',
    oauthConnected: false
  },
  {
    id: 'instagram',
    name: 'Instagram',
    description: 'Share visual invites and event photos to build brand trust with an evolving demographic.',
    icon: Instagram,
    color: 'text-[#E4405F]',
    bgColor: 'bg-[#E4405F]/10',
    mode: 'manual',
    oauthConnected: false
  },
  {
    id: 'twitter',
    name: 'X (Twitter)',
    description: 'Broadcast short updates and RSVP links for timely event reminders.',
    icon: Twitter,
    color: 'text-[#1DA1F2]',
    bgColor: 'bg-[#1DA1F2]/10',
    mode: 'manual',
    oauthConnected: false
  }
];

const SocialMediaIntegrationsView: React.FC = () => {
  const [platforms, setPlatforms] = useState<Platform[]>(initialPlatforms);
  const [isConnecting, setIsConnecting] = useState<string | null>(null);

  const setMode = (id: string, mode: 'manual' | 'oauth') => {
    setPlatforms(platforms.map(p => p.id === id ? { ...p, mode } : p));
  };

  const toggleConnection = (id: string) => {
    const platform = platforms.find(p => p.id === id);
    if (!platform) return;

    if (platform.oauthConnected) {
      // Disconnect
      setPlatforms(platforms.map(p => p.id === id ? { ...p, oauthConnected: false } : p));
    } else {
      // Simulate OAuth connection flow
      setIsConnecting(id);
      setTimeout(() => {
        setPlatforms(platforms.map(p => p.id === id ? { ...p, oauthConnected: true } : p));
        setIsConnecting(null);
      }, 1000);
    }
  };


  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3|e font-bold text-slate-900 flex items-center gap-3">
          <Share2 className="w-8 h-8 text-indigo-600" />
          Social Media Workflow
        </h1>
        <p className="text-slate-600 mt-2 text-lg">
          Manage how AI-crafted meeting invitations are distributed across your platforms.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
        <div className="p-6 bg-indigo-50 border-b border-indigo-100 flex items-start gap-4">
          <AlertCircle className="w-6 h-6 text-indigo-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-indigo-900 mb-1">Dual-Mode Distribution</h3>
            <p className="text-indigo-800 text-sm">
              You can choose to manually copy/paste AI-generated posts completely free of integrations, or connect your account via OAuth for fully automated posting and scheduling aligned with your physical events.
            </p>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {platforms.map(platform => {
              const Icon = platform.icon;
              return (
                <div 
                  key={platform.id} 
                    className={`border rounded-xl p-5 flex flex-col transition-all border-slate-200 hover:border-slate-300 hover:shadow-md ${platform.oauthConnected && platform.mode 
                    === 'oauth' ? 'ring-1 ring-indigo-500/20' : ''}`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-lg ${platform.bgColor}`}>
                          <Icon className={`w-6 h-6 ${platform.color}`} />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">{platform.name}</h3>
                      </div>
                    </div>
                    {platform.mode === 'oauth' && platform.oauthConnected && (
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 px-2.5 py-1 rounded-full border border-green-200">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        OAuth Connected
                      </span>
                    )}
                    {platform.mode === 'manual' && (
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
                        Ready for Manual Use
                      </span>
                    )}
                  </div>
                  
                  <p className="text-sm text-slate-600 mb-5 flex-grow">{platform.description}</p>
                  
                  <div className="space-y-3 mt-auto">
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Select Operating Mode</div>
                    
                    {/* Manual Mode Option */}
                    <div 
                      onClick={() => setMode(platform.id, 'manual')}
                      className={`p-3.5 border rounded-lg cursor-pointer transition-all ${
                        platform.mode === 'manual' 
                          ? 'border-indigo-600 bg-indigo-50/50 shadow-sm' 
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`font-semibold text-sm ${platform.mode === 'manual' ? 'text-indigo-900' : 'text-slate-700'}`}>1. Manual (Copy/Paste)</span>
                        <div className={`xw-4 h-4 rounded-full border flex items-center justify-center ${platform.mode === 'manual' ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'}`}>
                          {platform.mode === 'manual' && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                        </div>
                      </div>
                      <p className="text-xs text-slate-600">AI generates ideal copy. You click to copy and paste it into {platform.name} yourself.</p>
                    </div>

                    {/* Auto-Publish Option */}
                    <div 
                      onClick={() => setMode(platform.id, 'oauth')}
                      className={`p-3.5 border rounded-lg cursor-pointer transition-all ${
                        platform.mode === 'oauth' 
                          ? 'border-indigo-600 bg-indigo-50/50 shadow-sm' 
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`font-semibold text-sm ${platform.mode === 'oauth' ? 'text-indigo-900' : 'text-slate-700'}`}>2. Auto-Publish & Schedule</span>
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${platform.mode === 'oauth' ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'}`}>
                          {platform.mode === 'oauth' && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                        </div>
                      </div>
                      <p className="text-xs text-slate-600 mb-3">Connect account to natively schedule posts to align with your meeting drops.</p>
                      
                      {platform.mode === 'oauth' && (
                        <Button 
                          variant={platform.oauthConnected ? "outline" : "default"}
                          size="sm"
                          className={`w-full font-medium ${platform.oauthConnected ? "text-slate-600 border-slate-300 bg-white hover:bg-slate-50" : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleConnection(platform.id);
                          }}
                          disabled={isConnecting === platform.id}
                        >
                          {isConnecting === platform.id ? "Connecting..." : platform.oauthConnected ? `Disconnect from ${platform.name}` : `Connect ${platform.name} Account`}
                        </Button>
                      )}
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SocialMediaIntegrationsView;
