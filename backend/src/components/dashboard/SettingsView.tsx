import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { KeyRound, Plug, Save, TestTube2 } from 'lucide-react';

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

const SettingsView: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

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

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
        <p className="text-slate-600 mt-1">Configure integrations for your account.</p>
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
