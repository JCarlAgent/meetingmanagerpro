import React, { useEffect, useState } from 'react';
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
  const [previewCampaignId, setPreviewCampaignId] = useState('');
  const [isPreviewingLeads, setIsPreviewingLeads] = useState(false);
  const [leadsPreview, setLeadsPreview] = useState<string | null>(null);
  const [leadsPreviewError, setLeadsPreviewError] = useState<string | null>(null);

  const [seminarEdgeUsername, setSeminarEdgeUsername] = useState('');
  const [seminarEdgePassword, setSeminarEdgePassword] = useState('');
  const [isSavingSeminarEdge, setIsSavingSeminarEdge] = useState(false);
  const [isTestingSeminarEdge, setIsTestingSeminarEdge] = useState(false);
  const [seminarEdgeStatus, setSeminarEdgeStatus] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<'id' | 'email' | null>(null);

  // Saved credential preview (loaded on mount)
  const [credPreview, setCredPreview] = useState<{
    hasCredentials: boolean;
    usernamePreview?: string;
    savedAt?: string | null;
  } | null>(null);

  const [seminarEdgeCredPreview, setSeminarEdgeCredPreview] = useState<{
    hasCredentials: boolean;
    usernamePreview?: string;
    savedAt?: string | null;
  } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const resp = await fetch('/api/integrations/workthelead/credentials', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (resp.ok) {
          const data = await resp.json().catch(() => null);
          if (data) setCredPreview(data);
        }

        const seminarEdgeResp = await fetch('/api/integrations/seminaredge/credentials', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (seminarEdgeResp.ok) {
          const data = await seminarEdgeResp.json().catch(() => null);
          if (data) setSeminarEdgeCredPreview(data);
        }
      } catch { /* silently ignore */ }
    })();
  }, []);

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
        setStatus(`Error ${resp.status}: ${data?.error || 'Test failed'}`);
        return;
      }

      // Build a detailed status string so auth failures are unambiguous
      const lines: string[] = [];
      lines.push(`Status: ${data?.ok ? '✓ Connected' : '✗ Failed'}`);
      if (data?.usernamePreview) lines.push(`Username used: ${data.usernamePreview}`);
      if (data?.safeUrl) lines.push(`URL: ${data.safeUrl}`);
      if (data?.message) lines.push(data.message);
      if (data?.errorInBody) lines.push(`⚠ TeleDirect returned <Error> in body (HTTP ${data?.httpStatus ?? '?'}). Check credentials.`);
      if (data?.rawPreview) lines.push(`Response: ${data.rawPreview.slice(0, 300)}`);

      // Refresh credential preview after a successful save+test
      if (data?.ok && data?.usernamePreview) {
        setCredPreview(prev => ({ ...(prev ?? { hasCredentials: true }), hasCredentials: true, usernamePreview: data.usernamePreview }));
      }

      setStatus(lines.join('\n'));
    } finally {
      setIsTesting(false);
    }
  };

  const saveSeminarEdgeCredentials = async () => {
    setSeminarEdgeStatus(null);
    setIsSavingSeminarEdge(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setSeminarEdgeStatus('Not logged in. Please log in again.');
        return;
      }

      const resp = await fetch('/api/integrations/seminaredge/credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username: seminarEdgeUsername, password: seminarEdgePassword }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setSeminarEdgeStatus(data?.error || 'Failed to save Seminar Edge credentials');
        return;
      }

      setSeminarEdgePassword('');
      setSeminarEdgeStatus('Saved.');

      setSeminarEdgeCredPreview({
        hasCredentials: true,
        usernamePreview: seminarEdgeUsername.length > 4
          ? `${seminarEdgeUsername.slice(0, 2)}***${seminarEdgeUsername.slice(-2)}`
          : '***',
        savedAt: new Date().toISOString(),
      });
    } finally {
      setIsSavingSeminarEdge(false);
    }
  };

  const testSeminarEdgeConnection = async () => {
    setSeminarEdgeStatus(null);
    setIsTestingSeminarEdge(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setSeminarEdgeStatus('Not logged in. Please log in again.');
        return;
      }

      const resp = await fetch('/api/integrations/seminaredge/test', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        setSeminarEdgeStatus(`Error ${resp.status}: ${data?.error || 'Seminar Edge test failed'}`);
        return;
      }

      const lines: string[] = [];
      lines.push(`Status: ${data?.ok ? '✓ Ready' : '✗ Failed'}`);
      if (data?.usernamePreview) lines.push(`Username used: ${data.usernamePreview}`);
      if (typeof data?.usernamePresent === 'boolean') lines.push(`Username present: ${data.usernamePresent}`);
      if (typeof data?.passwordPresent === 'boolean') lines.push(`Password present: ${data.passwordPresent}`);
      if (data?.credentialSource) lines.push(`Credential source: ${data.credentialSource}`);
      if (data?.message) lines.push(data.message);

      setSeminarEdgeStatus(lines.join('\n'));
    } finally {
      setIsTestingSeminarEdge(false);
    }
  };

  const previewLeads = async () => {
    setLeadsPreview(null);
    setLeadsPreviewError(null);
    if (!previewCampaignId.trim()) {
      setLeadsPreviewError('Enter a TeleDirect Campaign ID first.');
      return;
    }
    setIsPreviewingLeads(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setLeadsPreviewError('Not logged in. Please log in again.');
        return;
      }
      const resp = await fetch('/api/integrations/workthelead/leads-preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ campaignId: previewCampaignId.trim() }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setLeadsPreviewError(data?.error || 'Leads preview failed');
        return;
      }
      setLeadsPreview(data?.bodyPreview ?? '(empty response)');
    } finally {
      setIsPreviewingLeads(false);
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
              Enter your TeleDirect <strong>Location Login</strong> credentials (used for lead syncing via <code>get_Leads</code>). Stored securely server-side; never saved in the browser.
            </p>

            {/* Saved credential preview */}
            {credPreview?.hasCredentials && (
              <div className="mt-4 flex items-center gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <Shield className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>
                  Saved credentials for: <strong className="text-slate-800">{credPreview.usernamePreview}</strong>
                  {credPreview.savedAt && (
                    <> &mdash; last updated {new Date(credPreview.savedAt).toLocaleString()}</>
                  )}
                </span>
              </div>
            )}
            {credPreview && !credPreview.hasCredentials && (
              <div className="mt-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                No credentials saved yet.
              </div>
            )}

            <div className="mt-5 grid gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  UserName
                </label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="TeleDirect Location Login UserName"
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
                <div className="mt-3 text-sm text-slate-700 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 whitespace-pre-wrap break-all">
                  {status}
                </div>
              )}

              {user?.is_master_admin && (
                <div className="mt-5 border-t border-slate-100 pt-5">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Preview Leads (Schema Probe)
                  </label>
                  <p className="mt-1 text-xs text-slate-500">Enter a TeleDirect CampaignID to inspect the raw get_Leads.asp XML response. No data is saved.</p>
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      value={previewCampaignId}
                      onChange={(e) => setPreviewCampaignId(e.target.value)}
                      placeholder="TeleDirect Campaign ID"
                      className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                    />
                    <button
                      type="button"
                      onClick={previewLeads}
                      disabled={isPreviewingLeads}
                      className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-700 font-medium px-4 py-2 rounded-lg transition-colors border border-slate-200 whitespace-nowrap"
                    >
                      <TestTube2 className="w-4 h-4" />
                      {isPreviewingLeads ? 'Fetching…' : 'Preview Leads'}
                    </button>
                  </div>
                  {leadsPreviewError && (
                    <div className="mt-3 text-sm text-red-700 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                      {leadsPreviewError}
                    </div>
                  )}
                  {leadsPreview && (
                    <pre className="mt-3 text-xs text-slate-700 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 overflow-x-auto whitespace-pre-wrap break-all">
                      {leadsPreview}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm mt-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-emerald-600/10 rounded-lg flex items-center justify-center">
            <Plug className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-900">TeleDirect Seminar Edge Credentials</h2>
            <p className="text-sm text-slate-600 mt-1">
              Enter your Seminar Edge credentials. Stored securely server-side and kept separate from Work The Lead credentials.
            </p>

            {seminarEdgeCredPreview?.hasCredentials && (
              <div className="mt-4 flex items-center gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <Shield className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>
                  Saved credentials for: <strong className="text-slate-800">{seminarEdgeCredPreview.usernamePreview}</strong>
                  {seminarEdgeCredPreview.savedAt && (
                    <> &mdash; last updated {new Date(seminarEdgeCredPreview.savedAt).toLocaleString()}</>
                  )}
                </span>
              </div>
            )}
            {seminarEdgeCredPreview && !seminarEdgeCredPreview.hasCredentials && (
              <div className="mt-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                No Seminar Edge credentials saved yet.
              </div>
            )}

            <div className="mt-5 grid gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  UserName
                </label>
                <input
                  value={seminarEdgeUsername}
                  onChange={(e) => setSeminarEdgeUsername(e.target.value)}
                  placeholder="Seminar Edge UserName"
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
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
                    value={seminarEdgePassword}
                    onChange={(e) => setSeminarEdgePassword(e.target.value)}
                    placeholder="Enter password to save/update"
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  For security, the password is never shown after save.
                </p>
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={saveSeminarEdgeCredentials}
                  disabled={isSavingSeminarEdge}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {isSavingSeminarEdge ? 'Saving…' : 'Save Seminar Edge credentials'}
                </button>
                <button
                  type="button"
                  onClick={testSeminarEdgeConnection}
                  disabled={isTestingSeminarEdge}
                  className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-700 font-medium px-4 py-2 rounded-lg transition-colors border border-slate-200"
                >
                  <TestTube2 className="w-4 h-4" />
                  {isTestingSeminarEdge ? 'Testing…' : 'Test Seminar Edge credentials'}
                </button>
              </div>

              {seminarEdgeStatus && (
                <div className="mt-3 text-sm text-slate-700 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 whitespace-pre-wrap break-all">
                  {seminarEdgeStatus}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 text-xs text-slate-500">
        Note: Use "Preview Leads" above to inspect the raw get_Leads.asp XML schema for a given TeleDirect CampaignID. Full responder sync coming next.
      </div>
    </div>
  );
};

export default SettingsView;
