import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from './supabase';

/**
 * Detect Supabase auth callback URLs (recovery, invite, etc.) on any route.
 * If a recovery token or `type=recovery` is present, call getSessionFromUrl()
 * to let supabase-js parse/store the session, then navigate to the reset page.
 */
export function AuthUrlHandler() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const qs = new URLSearchParams(location.search);
    const hasRecovery = qs.get('type') === 'recovery' || qs.get('access_token');
    const hash = location.hash || '';
    const hasHashToken = hash.includes('access_token') || hash.includes('type=recovery');

    if (!hasRecovery && !hasHashToken) return;

    (async () => {
      try {
        // Parse session from URL (works for hash or query-based tokens)
        // supabase-js typing may not expose getSessionFromUrl; cast to any to be resilient.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = await (supabase.auth as any).getSessionFromUrl();
        // Regardless of whether parsing succeeded, navigate to the reset page so the UI can show status.
        navigate('/reset-password', { replace: true });
      } catch (err) {
        navigate('/reset-password', { replace: true });
      }
    })();
  // Only run when the URL changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  return null;
}

export default AuthUrlHandler;
