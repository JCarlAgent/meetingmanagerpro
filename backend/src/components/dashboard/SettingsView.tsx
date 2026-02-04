import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Check, Copy, KeyRound, Plug, Save, Shield, TestTube2 } from 'lucide-react';

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

const SettingsView: React.FC = () => {
  const { user } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<'id' | 'email' | null>(null);

  const saveCredentials = async () => {
    setStatus(null);
    setIsSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setStatus('Not logged in. Please log in again.');
        return;
      }

      const resp = await fetch('/api/integrations/workthelead/credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setStatus(data?.error || 'Failed to save credentials');
        return;
      }

      setPassword('');
      setStatus('Saved.');
    } finally {
      setIsSaving(false);
    }
  };

  const testConnection = async () => {
    setStatus(null);
    setIsTesting(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setStatus('Not logged in. Please log in again.');
        return;
      }

      const resp = await fetch('/api/integrations/workthelead/test', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setStatus(data?.error || 'Test failed');
        return;
      }

      setStatus(`Success. XML received: ${data?.looksXml ? 'yes' : 'unknown'}.`);
    } finally {
      setIsTesting(false);
    }
  };

  const copyToClipboard = async (value: string, field: 'id' | 'email') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1200);
    } catch {
      // ignore
    }
  };

  const updatePassword = async () => {
    setPasswordStatus(null);

    const next = newPassword.trim();
    if (next.length < 8) {
      setPasswordStatus('Password must be at least 8 characters.');
      return;
    }
    if (next !== confirmPassword.trim()) {
      setPasswordStatus('Passwords do not match.');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) {
        setPasswordStatus(error.message || 'Failed to update password');
        return;
      }
      setNewPassword('');
      setConfirmPassword('');
      setPasswordStatus('Password updated. You can now log in with email + password.');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
        <p className="text-slate-600 mt-1">Configure integrations for your account.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm mb-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-slate-900/5 rounded-lg flex items-center justify-center">
            <Shield className="w-5 h-5 text-slate-900" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-900">Account</h2>
            <p className="text-sm text-slate-600 mt-1">Useful for verifying master admin access and debugging login.</p>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">User ID</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <div className="font-mono text-xs text-slate-900 truncate">{user?.id || '—'}</div>
                  {user?.id && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(user.id, 'id')}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                    >
                      {copiedField === 'id' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copiedField === 'id' ? 'Copied' : 'Copy'}
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <div className="text-xs text-slate-900 truncate">{user?.email || '—'}</div>
                  {user?.email && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(user.email, 'email')}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                    >
                      {copiedField === 'email' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copiedField === 'email' ? 'Copied' : 'Copy'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-3 text-sm text-slate-700">
              <span className="font-semibold">Master admin:</span>{' '}
              <span className={user?.is_master_admin ? 'text-emerald-700' : 'text-slate-600'}>
                {user?.is_master_admin ? 'Yes' : 'No'}
              </span>
            </div>

            <div className="mt-5 rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900">Password</h3>
              <p className="text-sm text-slate-600 mt-1">
                Supabase recovery links log you in first (magic-link style). After you’re logged in, you can set a new password here.
              </p>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">New password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Confirm</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                  />
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={updatePassword}
                  disabled={isUpdatingPassword}
                  className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  <KeyRound className="w-4 h-4" />
                  {isUpdatingPassword ? 'Updating…' : 'Update password'}
                </button>
                {passwordStatus && (
                  <div className="text-sm text-slate-700">{passwordStatus}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-red-600/10 rounded-lg flex items-center justify-center">
            <Plug className="w-5 h-5 text-red-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-900">Teledirect — Work The Lead</h2>
            <p className="text-sm text-slate-600 mt-1">
              Enter your Teledirect API login. Stored securely server-side; never saved in the browser.
            </p>

            <div className="mt-5 grid gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  UserName
                </label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Your WorkTheLead UserName"
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Password
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password to save/update"
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  For security, the password is not displayed once saved.
                </p>
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={saveCredentials}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? 'Saving…' : 'Save credentials'}
                </button>
                <button
                  type="button"
                  onClick={testConnection}
                  disabled={isTesting}
                  className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-700 font-medium px-4 py-2 rounded-lg transition-colors border border-slate-200"
                >
                  <TestTube2 className="w-4 h-4" />
                  {isTesting ? 'Testing…' : 'Test connection'}
                </button>
              </div>

              {status && (
                <div className="mt-3 text-sm text-slate-700 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  {status}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 text-xs text-slate-500">
        Note: This integration currently tests the `get_Campaigns.asp` endpoint. We’ll wire `get_Leads.asp` / `get_Calls.asp` into reporting next.
      </div>
    </div>
  );
};

export default SettingsView;
