import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const DebugAuthPage: React.FC = () => {
  const [href, setHref] = useState('');
  const [search, setSearch] = useState('');
  const [hash, setHash] = useState('');
  const [parsed, setParsed] = useState<Record<string, string>>({});
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [userInfo, setUserInfo] = useState<any>(null);

  useEffect(() => {
    setHref(window.location.href);
    setSearch(window.location.search);
    setHash(window.location.hash);

    const params = new URLSearchParams(window.location.search);
    // also parse hash if present
    if (window.location.hash) {
      const raw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
      new URLSearchParams(raw).forEach((v, k) => params.set(k, v));
    }

    const obj: Record<string, string> = {};
    params.forEach((v, k) => (obj[k] = v));
    setParsed(obj);

    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s: any = await supabase.auth.getSession();
        setSessionInfo(s);
      } catch (err) {
        setSessionInfo({ error: String(err) });
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const u: any = await supabase.auth.getUser();
        setUserInfo(u);
      } catch (err) {
        setUserInfo({ error: String(err) });
      }
    })();
  }, []);

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <h1 className="text-xl font-bold mb-4">Debug Auth Page</h1>
      <div className="mb-4">
        <strong>window.location.href:</strong>
        <div className="mt-1 p-2 bg-white border rounded">{href}</div>
      </div>
      <div className="mb-4">
        <strong>window.location.search:</strong>
        <div className="mt-1 p-2 bg-white border rounded">{search}</div>
      </div>
      <div className="mb-4">
        <strong>window.location.hash:</strong>
        <div className="mt-1 p-2 bg-white border rounded">{hash}</div>
      </div>

      <div className="mb-4">
        <strong>Parsed params (query + hash):</strong>
        <pre className="mt-1 p-2 bg-white border rounded">{JSON.stringify(parsed, null, 2)}</pre>
      </div>

      <div className="mb-4">
        <strong>supabase.auth.getSession() result:</strong>
        <pre className="mt-1 p-2 bg-white border rounded">{JSON.stringify(sessionInfo, null, 2)}</pre>
      </div>

      <div className="mb-4">
        <strong>supabase.auth.getUser() result:</strong>
        <pre className="mt-1 p-2 bg-white border rounded">{JSON.stringify(userInfo, null, 2)}</pre>
      </div>

      <div className="text-sm text-gray-600">
        Use this page by clicking the reset link in your email and then immediately opening this page (or paste the reset link into the address bar and then open this page).
      </div>
    </div>
  );
};

export default DebugAuthPage;
