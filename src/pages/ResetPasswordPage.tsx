import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

const ResetPasswordPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Process the URL that Supabase sends for recovery links.
    // This extracts the access_token from the URL and creates a session in the client.
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // supabase-js v2: getSessionFromUrl parses the URL and stores the session
        const { data, error } = await supabase.auth.getSessionFromUrl();
        if (error) {
          // No session created from the URL (maybe missing token or expired)
          setError(error.message || 'Unable to process the recovery link.');
          setReady(false);
        } else if (data?.session) {
          // Session present — allow the user to set a new password
          setReady(true);
        } else {
          setError('No recovery token found in the URL.');
          setReady(false);
        }
      } catch (err: any) {
        setError(err?.message || String(err));
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
          </div>
        )}
      </div>
    </div>
  );
};

export default ResetPasswordPage;
