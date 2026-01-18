import { createClient } from '@supabase/supabase-js';

// IMPORTANT: This runs in the browser. Only use the public anon key.
// Configure via Vercel env vars / local .env:
// - VITE_SUPABASE_URL
// - VITE_SUPABASE_ANON_KEY
const env = (import.meta as any).env as Record<string, string | undefined> | undefined;
const supabaseUrl = env?.VITE_SUPABASE_URL;
const supabaseAnonKey = env?.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	// Fail fast so misconfigured deploys are obvious.
	throw new Error(
		'Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
	);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);