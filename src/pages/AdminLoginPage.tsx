import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

// read Vite site URL env if present; `import.meta.env` may not be typed in some TS configs, so access safely
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DEFAULT_SITE = ((import.meta as any).env?.VITE_SITE_URL as string) || 'https://meetingmanagerpro.com';

export const AdminLoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.session) {
        navigate('/admin-panel');
      }
    } catch (err: any) {
      setError(err.message || 'Invalid credentials');
      setPassword('');
    } finally {
      setLoading(false);
    }
  };

  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const handleSendReset = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setResetMessage(null);
    setResetLoading(true);
    try {
      const emailToSend = resetEmail || email;
      if (!emailToSend) {
        setResetMessage('Enter an email to send the reset link.');
        return;
      }

      // Use redirectTo so the recovery link lands on our /reset-password page
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res: any = await (supabase.auth as any).resetPasswordForEmail(emailToSend, {
        redirectTo: `${DEFAULT_SITE}/reset-password`,
      });

      if (res?.error) {
        setResetMessage(res.error.message || 'Unable to send reset email');
      } else {
        setResetMessage('Reset email sent — check your inbox.');
      }
    } catch (err: any) {
      setResetMessage(err?.message || String(err));
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6 text-center">Admin Login</h1>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-600 focus:border-transparent"
              placeholder="admin@example.com"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-600 focus:border-transparent"
              placeholder="Enter admin password"
              required
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-red-600 text-white py-3 rounded-md font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div className="mt-4 text-center">
          {!forgotMode ? (
            <button
              type="button"
              onClick={() => setForgotMode(true)}
              className="text-sm text-blue-600 hover:underline"
            >
              Forgot password?
            </button>
          ) : (
            <form onSubmit={handleSendReset} className="mt-4 space-y-3">
              <p className="text-sm text-gray-600">Enter your admin email and we'll send a reset link.</p>
              <input
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="admin@example.com"
                className="w-full px-3 py-2 border rounded"
              />
              {resetMessage && (<div className="text-sm text-gray-700">{resetMessage}</div>)}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="flex-1 bg-blue-600 text-white py-2 rounded"
                >
                  {resetLoading ? 'Sending…' : 'Send reset email'}
                </button>
                <button
                  type="button"
                  onClick={() => { setForgotMode(false); setResetMessage(null); }}
                  className="flex-1 bg-gray-200 text-gray-800 py-2 rounded"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-xs text-blue-800">
              <strong>Note:</strong> Create an admin account in Supabase Authentication dashboard
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
