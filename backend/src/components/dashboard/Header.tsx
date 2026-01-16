import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Menu, 
  Bell, 
  Search, 
  ChevronDown, 
  LogOut, 
  Settings, 
  User,
  Share2,
  HelpCircle,
  Shield
} from 'lucide-react';

interface HeaderProps {
  onMenuClick: () => void;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const notifications = [
    { id: 1, message: 'New responder for Campaign 54890', time: '5 min ago', unread: true },
    { id: 2, message: 'Campaign 54912 artwork approved', time: '1 hour ago', unread: true },
    { id: 3, message: 'Event capacity reached for 1/14 dinner', time: '3 hours ago', unread: false },
  ];

  return (
    <header className="bg-slate-900/80 backdrop-blur-xl border-b border-white/10 sticky top-0 z-40">
      <div className="flex items-center justify-between px-4 lg:px-6 py-3">
        {/* Left Section */}
        <div className="flex items-center gap-4">
          <button 
            onClick={onMenuClick}
            className="lg:hidden p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <Menu className="w-6 h-6" />
          </button>
          
          <div className="hidden md:block">
            <h1 className="text-lg font-semibold text-white">{user?.company_name || 'Dashboard'}</h1>
            <p className="text-sm text-slate-400">{currentDate}</p>
          </div>
        </div>

        {/* Center - Search (hidden on mobile) */}
        <div className="hidden lg:flex items-center flex-1 max-w-xl mx-8">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search campaigns, responders..."
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 transition-all"
            />
          </div>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-2">
          {/* Share Button */}
          <button className="hidden sm:flex items-center gap-2 px-3 py-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
            <Share2 className="w-5 h-5" />
            <span className="text-sm">Share</span>
          </button>

          {/* Help */}
          <button className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
            <HelpCircle className="w-5 h-5" />
          </button>

          {/* Notifications */}
          <div className="relative">
            <button 
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>

            {showNotifications && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)}></div>
                <div className="absolute right-0 mt-2 w-80 bg-slate-800 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/10">
                    <h3 className="font-semibold text-white">Notifications</h3>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.map((notif) => (
                      <div 
                        key={notif.id}
                        className={`px-4 py-3 border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors ${notif.unread ? 'bg-red-500/5' : ''}`}
                      >
                        <p className="text-sm text-white">{notif.message}</p>
                        <p className="text-xs text-slate-500 mt-1">{notif.time}</p>
                      </div>
                    ))}
                  </div>
                  <div className="px-4 py-2 bg-slate-900/50">
                    <button className="text-sm text-red-400 hover:text-red-300 transition-colors">
                      View all notifications
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* User Menu */}
          <div className="relative">
            <button 
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-red-500 to-red-700 rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-semibold">
                  {user?.company_name?.charAt(0) || 'U'}
                </span>
              </div>
              <ChevronDown className="w-4 h-4 hidden sm:block" />
            </button>

            {showUserMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)}></div>
                <div className="absolute right-0 mt-2 w-56 bg-slate-800 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/10">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-white truncate">{user?.company_name}</p>
                      {user?.is_admin && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded text-xs">
                          <Shield className="w-3 h-3" />
                          Admin
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-400 truncate">{user?.email}</p>
                  </div>
                  <div className="py-2">
                    <button className="w-full flex items-center gap-3 px-4 py-2 text-slate-300 hover:bg-white/5 transition-colors">
                      <User className="w-4 h-4" />
                      <span>Profile</span>
                    </button>
                    <button className="w-full flex items-center gap-3 px-4 py-2 text-slate-300 hover:bg-white/5 transition-colors">
                      <Settings className="w-4 h-4" />
                      <span>Settings</span>
                    </button>
                  </div>
                  <div className="border-t border-white/10 py-2">
                    <button 
                      onClick={logout}
                      className="w-full flex items-center gap-3 px-4 py-2 text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>

              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
