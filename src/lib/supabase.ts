import { createClient } from '@supabase/supabase-js';

// Read Supabase values from Vite environment variables.
// Add these to a local .env file for development and set them in Vercel for production.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseKey) {
	// Don't fail the build here; surface a clear console message so you can add env values.
	// In production you should ensure these are set in Vercel's environment settings.
	// eslint-disable-next-line no-console
	console.warn(
		'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Create a .env file or set these in your hosting provider.'
	);
}

const supabase = createClient(supabaseUrl ?? '', supabaseKey ?? '');

export { supabase };