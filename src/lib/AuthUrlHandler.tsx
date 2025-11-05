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
        // If supabase-js provides getSessionFromUrl, call it; otherwise skip to navigation.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const authAny: any = supabase.auth;
        if (authAny && typeof authAny.getSessionFromUrl === 'function') {
          try {
            await authAny.getSessionFromUrl();
          } catch (e) {
            // ignore parse errors — we'll still navigate to the reset page
          }
        }

        // Navigate to the reset page so the UI can show status or let the ResetPasswordPage handle tokens.
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
