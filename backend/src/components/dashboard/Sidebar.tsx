import React from 'react';
import { 
  LayoutDashboard, 
  FolderKanban, 
  Users, 
  Calendar, 
  FileText, 
  Upload, 
  BarChart3, 
  Settings,
  Plus,
  X,
  Shield,
  FileImage
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeView: string;
  onViewChange: (view: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, activeView, onViewChange }) => {
  const { user } = useAuth();

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'campaigns', label: 'Campaigns', icon: FolderKanban },
    { id: 'responders', label: 'Responders', icon: Users },
    { id: 'events', label: 'Events', icon: Calendar },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'uploads', label: 'CSV Uploads', icon: Upload },
    { id: 'templates', label: 'Templates', icon: FileText },
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
        w-64 bg-slate-900 border-r border-white/10
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        flex flex-col
      `}>
        {/* Logo */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <span className="text-lg font-bold text-white">MMP</span>
              <span className="text-xs text-slate-400 block">Dashboard</span>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="lg:hidden p-1 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* New Campaign Button */}
        <div className="p-4">
          <button 
            onClick={() => onViewChange('new-campaign')}
            className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>New Campaign</span>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 overflow-y-auto">
          <ul className="space-y-1">
            {menuItems.map((item) => {
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
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
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
                            ? 'bg-red-600/20 text-red-400 border-l-2 border-red-500' 
                            : 'text-slate-400 hover:text-white hover:bg-white/5'
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

        {/* Settings */}
        <div className="p-3 border-t border-white/10">
          <button
            onClick={() => onViewChange('settings')}
            className={`
              w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all
              ${activeView === 'settings' 
                ? 'bg-red-600/20 text-red-400' 
                : 'text-slate-400 hover:text-white hover:bg-white/5'
              }
            `}
          >
            <Settings className="w-5 h-5" />
            <span className="font-medium">Settings</span>
          </button>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-2">
            <img 
              src="https://d64gsuwffb70l.cloudfront.net/6870115d9722f8859b7ed68f_1761371051469_dd208754.png" 
              alt="Meeting Manager Pro"
              className="h-6 object-contain"
            />
          </div>
          <p className="text-xs text-slate-500 mt-2">© 2025 Meeting Manager Pro</p>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
