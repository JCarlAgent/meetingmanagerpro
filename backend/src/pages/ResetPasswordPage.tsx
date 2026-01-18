import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';

const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<'idle' | 'ready' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');

  const urlHash = useMemo(() => window.location.hash || '', []);

  useEffect(() => {
    // Supabase recovery/magiclink arrives with tokens in the URL hash.
    // We don't want to rely on our app routing to keep those tokens.
    const hasAccessToken = urlHash.includes('access_token=');
    const isRecovery = urlHash.includes('type=recovery');

    if (hasAccessToken && isRecovery) {
      setStatus('ready');
      setMessage('Enter a new password.');
      return;
    }

    // If the user lands here without tokens, guide them.
    setStatus('error');
    setMessage('This reset link is missing or expired. Please request a new password reset email.');
  }, [urlHash]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');

    if (password.length < 8) {
      setStatus('error');
      setMessage('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirm) {
      setStatus('error');
      setMessage('Passwords do not match.');
      return;
    }

    setStatus('saving');

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setStatus('error');
      setMessage(error.message || 'Failed to reset password.');
      return;
    }

    setStatus('done');
    setMessage('Password updated. You can now sign in.');

    // Give the user a moment to read, then send them home.
    setTimeout(() => navigate('/'), 1000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-8 shadow-2xl">
        <h1 className="text-2xl font-semibold text-white mb-2">Reset password</h1>
        <p className="text-slate-400 mb-6 text-sm">
          Use this page after clicking the email link from Supabase.
        </p>

        {message && (
          <div
            className={
              status === 'error'
                ? 'mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-300 text-sm'
                : 'mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-300 text-sm'
            }
          >
            {message}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">New password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 transition-all"
              placeholder="Enter a new password"
              disabled={status !== 'ready' && status !== 'error'}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Confirm password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 transition-all"
              placeholder="Re-enter password"
              disabled={status !== 'ready' && status !== 'error'}
              required
            />
          </div>

          <button
            type="submit"
            disabled={status === 'saving' || (status !== 'ready' && status !== 'error')}
            className="w-full bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 text-white font-semibold py-3 rounded-lg transition-all duration-200"
          >
            {status === 'saving' ? 'Saving…' : 'Set new password'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => navigate('/')}
          className="mt-6 w-full text-sm text-slate-400 hover:text-white transition-colors"
        >
          Back to sign in
        </button>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
