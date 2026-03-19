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
  connected: boolean;
}

const initialPlatforms: Platform[] = [
  {
    id: 'linkedin',
    name: 'LinkedIn',
    description: 'Connect your professional profile or company page to auto-publish meeting invites.',
    icon: Linkedin,
    color: 'text-[#0A66C2]',
    bgColor: 'bg-[#0A66C2]/10',
    connected: false
  },
  {
    id: 'facebook',
    name: 'Facebook',
    description: 'Post directly to your firm\'s Facebook Page to reach the 65+ demographic.',
    icon: Facebook,
    color: 'text-[#1877F2]',
    bgColor: 'bg-[#1877F2]    bgColor: 'bg-[#1877F2]    bgColor: 'bg-[#1877F2]    bgColor: 'bg-[#1877F2]    bgColor: 'bg-[#1877F2]    bgColor: 'bg-[#1877F2]    bgColor: 'bg-[#1877rs    bgColor: 'bg-[#1877F2]    bgColor: xt-[#E4405F]',
    bgColor: 'bg-[#E4405F]/10',
    connected: false
  },
  {
    id: 'twitter',
    name: 'X (Twitter)',
    description: 'Broadcast short updates and links to your RSVP page.',
    icon: Twitter,
    color: 'text-[#1DA1F2]',
    bgColor: 'bg-[#1DA1F2]/10',
    connected: false
  }
];

const SocialMediaconst SocialMediaconst SocialMediac{
    ns    ns    ns    nsla    ns    ns    ns  latform[]>(initialPlatforms);
  const [isConnecting, setIsConnecting] = useState<string | null>(null);

  const toggleConnection = (id: string) => {
    const platform = platforms.find(p => p.id === id);
    if (!platform) return;

    if (platform.connected    if (platform.connected    if (platform.connected    if (platform.connected    if (platfod:    if (platform    } else {
      // Simulate OAuth connection flow
      setIsConnecting(id);
      setTimeout(() => {
        setPlatforms(platforms.map(p => p.id === id ? { ...p, connected: true } : p));
        setIsConnecting(null);
      }, 1000);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bo        <h1 className="text-3xl font-bo        <h1 className="text-3xl ="w-8 h-8 text-indigo-600" />
          Social Med          Social Med                      Social Me"t  t-slate-600 mt-2 text-lg">
          Connect your social accounts to automatically generate and publish AI-crafted meeting invitations.
          Connect your social accounts to automaticallyte rounded-xl border border-slate-200 shadow-sm overflow-hidden           Connect your social accounts to automaticalr-b border-indigo-100 flex items-start gap-4">
          <AlertCircle className="w-6 h-6 text-indigo-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-indigo-900 mb-1">Omnichannel Automation</h3>
            <p className="text-indigo-800 text-sm">
              Once connected, the AI will automatically generate compliant, engaging social media copy tailored to your target platform whenever a new meeting campaign is finalized. You will have full approval control before anything is posted.
            </p>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {platforms.map(platform => {
              const Icon = platform.icon;
              return (
                <div 
                  key={platform.id} 
                  className={`border rounded-xl p-5 flex flex-col transition-all border-slate-200 hover:border-slate-300 hover:shadow-md`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-3 rounded-lg ${platform.bgColor}`}>
                                                                                                                                                                                                                                                                                                                                                                                                                     
                      </span>
                    )                    )      <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-200">
                        Not Connected
                      </span>
                    )}
                  </div>
                  
                  <h3 className="text-lg font-bold text-slate-900 mb-2">{platform.name}</h3>
                  <p                  <p                  <p                  <p            }</p>
                  
                  <Button 
                    variant={platform.connected ? "outline" : "default"}
                    className={platform.connected ? "text-slate-600" : "bg-indigo-600 hover:bg-indigo-700"}
                    onClick={() => toggleConnection(platform.id)}
                    disabled={isConnecting === platform.id}
                  >
                    {isConnecting === platform.id ? "Connecting..." : platform.connected ? "Disconnect" : `Connect ${platform.name}`}
                  </Button>
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
