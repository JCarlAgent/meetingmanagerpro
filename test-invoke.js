import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://lccfprbtmsphesudrpqb.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY; 

// We don't have the anon key easily available here without dotenv trickery, let's just grab it from supabase/config.toml? No, it's in backend/.env? We already saw we don't have backend/.env.
