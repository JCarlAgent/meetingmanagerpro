import React, { useEffect, useState } from 'react';
import { 
  Home,
  LayoutDashboard, 
  FolderKanban, 
  Users, 
  Calendar, 
  FileText, 
  Upload, 
  Mail,
  ClipboardCheck,
  BarChart3, 
  Settings,
  Plus,
  X,
  Shield,
  Building2,
  FileImage,
  Share2
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useActingOrg } from '@/lib/actingOrg';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeView: string;
  onViewChange: (view: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, activeView, onViewChange }) => {
  const { user } = useAuth();
  const { actingOrgId } = useActingOrg();

  const [showFmoLogo, setShowFmoLogo] = useState(false);
  const [fmoLogoUrl, setFmoLogoUrl] = useState<string | null>(null);
  const [fmoName, setFmoName] = useState<string>('');

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      const orgId = (user as any)?.org_id ? String((user as any).org_id) : null;
      const role = (user as any)?.org_role ? String((user as any).org_role) : null;
      const isAdvisorLevel = role === 'advisor' || role === 'member';

      if (!orgId || !isAdvisorLevel) {
        if (!isMounted) return;
        setShowFmoLogo(false);
        setFmoLogoUrl(null);
        setFmoName('');
        return;
      }

      try {
        // Only show the FMO logo if this org has an FMO/org admin.
        const { data: adminRows, error: adminErr } = await supabase
          .from('org_members')
          .select('user_id, role')
          .eq('org_id', orgId)
          .in('role', ['fmo_admin', 'org_admin'])
          .limit(1);

        if (adminErr) throw adminErr;
        const underFmo = (adminRows ?? []).length > 0;
        if (!isMounted) return;
        setShowFmoLogo(underFmo);
        if (!underFmo) {
          setFmoLogoUrl(null);
          setFmoName('');
          return;
        }

        // Best-effort: logo_url may not exist yet in some environments.
        const orgResult = await supabase.from('orgs').select('name, logo_url').eq('id', orgId).maybeSingle();
        if (orgResult.error) {
          const code = (orgResult.error as any)?.code;
          if (code === '42703') {
            const fallback = await supabase.from('orgs').select('name').eq('id', orgId).maybeSingle();
            if (!fallback.error) {
              if (!isMounted) return;
              setFmoName(String((fallback.data as any)?.name ?? ''));
              setFmoLogoUrl(null);
            }
            return;
          }
          throw orgResult.error;
        }

        if (!isMounted) return;
        setFmoName(String((orgResult.data as any)?.name ?? ''));
        setFmoLogoUrl(((orgResult.data as any)?.logo_url as string | null) ?? null);
      } catch {
        if (!isMounted) return;
        setShowFmoLogo(false);
        setFmoLogoUrl(null);
        setFmoName('');
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [user]);

  const isViewOnlyAdvisor = (user as any)?.org_role === 'member';

  const menuSections = [
    ...(user?.is_master_admin && !actingOrgId
      ? [
          {
            title: 'Master',
            items: [
              { id: 'master-clients', label: 'Clients', icon: Shield },
              { id: 'master-orgs', label: 'Organizations', icon: Building2 },
            ],
          },
        ]
      : []),
    {
      title: 'Plan',
      // Reduced to only Home to remove duplicated/legacy entries.
      items: [
        { id: 'home', label: 'Home', icon: Home },
      ],
    },
    {
      title: 'Track + Report',
      items: [
        { id: 'responders', label: 'Responders', icon: Users },
        { id: 'mailings', label: 'Mailings', icon: Mail },
        ...(user?.is_admin ? [{ id: 'approvals', label: 'Approvals', icon: ClipboardCheck }] : []),
        { id: 'reports', label: 'Reports', icon: BarChart3 },
      ],
    },
  ];

  // Admin-only menu items
  const adminMenuItems = [
    { id: 'admin-users', label: 'User Management', icon: Shield },
    { id: 'admin-templates', label: 'Template Manager', icon: FileImage },
  ];

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-64 bg-white border-r border-slate-200
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        flex flex-col
      `}>
        {/* Logo */}
        <div className="p-4 border-b border-slate-200">
          {showFmoLogo && (
            <div className="mb-3">
              {fmoLogoUrl ? (
                <img
                  src={fmoLogoUrl}
                  alt={fmoName ? `${fmoName} logo` : 'FMO logo'}
                  className="w-full h-12 object-contain rounded-lg border border-slate-200 bg-white"
                />
              ) : (
                <div className="w-full h-12 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center text-xs font-semibold text-slate-600">
                  FMO Logo
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              </div>
              <div>
                <span className="text-lg font-bold text-slate-900">MMP</span>
                <span className="text-xs text-slate-500 block">Dashboard</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="lg:hidden p-1 text-slate-500 hover:text-slate-900 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* New Campaign Button */}
        {!isViewOnlyAdvisor && (
        <div className="p-4">
          <button 
            onClick={() => onViewChange('new-campaign')}
            className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>New Campaign</span>
          </button>
        </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 overflow-y-auto">
          {menuSections.map((section) => (
            <div key={section.title} className="mb-4">
              <div className="mt-2 mb-2 px-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {section.title}
                </p>
              </div>
              <ul className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeView === item.id;

                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => {
                          onViewChange(item.id);
                          onClose();
                        }}
                        className={`
                          w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all
                          ${isActive
                            ? 'bg-red-600/20 text-red-400 border-l-2 border-red-500'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                          }
                        `}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="font-medium">{item.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {/* Admin Section - Only visible to admins */}
          {user?.is_admin && (
            <>
              <div className="mt-6 mb-2 px-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Administration
                </p>
              </div>
              <ul className="space-y-1">
                {adminMenuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeView === item.id;
                  
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => {
                          onViewChange(item.id);
                          onClose();
                        }}
                        className={`
                          w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all
                          ${isActive 
                            ? 'bg-red-600/10 text-red-700 border-l-2 border-red-500' 
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                          }
                        `}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="font-medium">{item.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </nav>

        {/* Settings & Integrations */}
        <div className="p-3 border-t border-slate-200 space-y-1">
          <button
            onClick={() => onViewChange('integrations')}
            className={`
              w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all
              ${activeView === 'integrations'
                ? 'bg-red-600/10 text-red-700' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }
            `}
          >
            <Share2 className="w-5 h-5" />
            <span className="font-medium">Integrations</span>
          </button>
          
          <button
            onClick={() => onViewChange('settings')}
            className={`
              w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all
              ${activeView === 'settings' 
                ? 'bg-red-600/10 text-red-700' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }
            `}
          >
            <Settings className="w-5 h-5" />
            <span className="font-medium">Settings</span>
          </button>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200">
          <div className="flex items-center gap-2">
            <img 
              src="https://d64gsuwffb70l.cloudfront.net/6870115d9722f8859b7ed68f_1761371051469_dd208754.png" 
              alt="Meeting Manager Pro"
              className="h-6 object-contain"
            />
          </div>
          <p className="text-xs text-slate-500 mt-2">© {new Date().getFullYear()} Meeting Manager Pro</p>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
