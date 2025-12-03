import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

const ResetPasswordPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [ready, setReady] = useState(false);
  const [resendEmail, setResendEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const navigate = useNavigate();
  // read Vite site URL env if present
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SITE_URL = ((import.meta as any).env?.VITE_SITE_URL as string) || 'https://meetingmanagerpro.com';

  useEffect(() => {
    // Process the URL that Supabase sends for recovery links.
    // This extracts the access_token from the URL and creates a session in the client.
    (async () => {
      setLoading(true);
      setError(null);
      // parse query + hash early so we can detect error params like otp_expired
      const { hash: initialHash, search: initialSearch } = window.location;
      const earlyParams = new URLSearchParams(initialSearch);
      if (initialHash) {
        const raw = initialHash.startsWith('#') ? initialHash.slice(1) : initialHash;
        new URLSearchParams(raw).forEach((v, k) => earlyParams.set(k, v));
      }
      if (earlyParams.get('error')) {
        const desc = earlyParams.get('error_description') || earlyParams.get('error');
        setError(decodeURIComponent(String(desc)) || 'Recovery link is invalid or expired.');
        setReady(false);
        setLoading(false);
        return;
      }
      try {
        // Prefer built-in helper if available
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const authAny: any = supabase.auth;
        if (authAny && typeof authAny.getSessionFromUrl === 'function') {
          const { data, error } = await authAny.getSessionFromUrl();
          if (error) {
            setError(error.message || 'Unable to process the recovery link.');
            setReady(false);
          } else if (data?.session) {
            setReady(true);
          } else {
            setError('No recovery token found in the URL.');
            setReady(false);
          }
        } else {
          // Fallback: manually parse token from hash or query and set session
          const { hash, search } = window.location;
          // hash may contain #access_token=...&refresh_token=...
          const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
          for (const [k, v] of new URLSearchParams(search)) {
            if (!params.has(k)) params.set(k, v);
          }

          // If Supabase set an error in the URL (verify endpoint), surface that message
          if (params.get('error')) {
            const desc = params.get('error_description') || params.get('error');
            setError(decodeURIComponent(String(desc)) || 'Recovery link is invalid or expired.');
            setReady(false);
            return;
          }

          const access_token = params.get('access_token') || params.get('token');
          const refresh_token = params.get('refresh_token') || params.get('refreshToken');

          if (access_token) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const setRes: any = await (supabase.auth as any).setSession({ access_token, refresh_token });
            if (setRes?.error) {
              setError(setRes.error.message || 'Unable to set session from recovery token.');
              setReady(false);
            } else {
              setReady(true);
            }
          } else {
            setError('No recovery token found in the URL.');
            setReady(false);
          }
        }
      } catch (err: any) {
        // Avoid showing low-level runtime messages (like "getSessionFromUrl is not a function") to users.
        // Log the detailed error for debugging and show a friendly message in the UI.
        // eslint-disable-next-line no-console
        console.error('Error processing recovery link:', err);
        setError('Unable to process the recovery link. It may be expired or malformed.');
        setReady(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!password || password.length < 8) {
        setError('Password must be at least 8 characters long.');
        return;
      }

      const { data, error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      // Password updated — navigate to admin login
      navigate('/admin-login', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Unable to update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Reset your password</h1>

        {loading && <p className="text-sm text-gray-600">Processing link...</p>}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm mb-4">
            {error}
          </div>
        )}

        {!loading && ready && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                New password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-600 focus:border-transparent"
                placeholder="At least 8 characters"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-red-600 text-white py-3 rounded-md font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Updating…' : 'Set new password'}
            </button>
          </form>
        )}

        {!loading && !ready && (
          <div className="mt-4 text-sm text-gray-700">
            <p>If you followed a password recovery link, it may have expired or be malformed.</p>
            <p className="mt-2">Request another password reset from the Supabase dashboard or re-initiate password recovery from the admin login screen.</p>

            <div className="mt-4 p-4 bg-gray-50 border rounded">
              <p className="text-sm font-medium mb-2">Send a new reset email</p>
              <div className="space-y-2">
                <input
                  type="email"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                />
                {resendMessage && (<div className="text-sm text-gray-700">{resendMessage}</div>)}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      setResendMessage(null);
                      setResendLoading(true);
                      try {
                        const emailToSend = resendEmail || '';
                        if (!emailToSend) {
                          setResendMessage('Enter an email address to send the reset link.');
                          return;
                        }
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const res: any = await (supabase.auth as any).resetPasswordForEmail(emailToSend, {
                          redirectTo: `${SITE_URL}/reset-password`,
                        });
                        if (res?.error) {
                          setResendMessage(res.error.message || 'Unable to send reset email');
                        } else {
                          setResendMessage('Reset email sent — check your inbox.');
                        }
                      } catch (err: any) {
                        setResendMessage(err?.message || String(err));
                      } finally {
                        setResendLoading(false);
                      }
                    }}
                    disabled={resendLoading}
                    className="bg-blue-600 text-white px-4 py-2 rounded"
                  >
                    {resendLoading ? 'Sending…' : 'Resend reset email'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResetPasswordPage;
