import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Create a dummy client if environment variables are not set
// This prevents errors but the app won't work until Supabase is configured
let supabase: SupabaseClient;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Supabase environment variables are not set.');
  console.warn('Please create a .env.local file with:');
  console.warn('  VITE_SUPABASE_URL=your-project-url');
  console.warn('  VITE_SUPABASE_ANON_KEY=your-anon-key');
  console.warn('See SUPABASE_SETUP.md for instructions.');
  
  // Create a dummy client with placeholder values to prevent errors
  // The app will show errors when trying to use Supabase, but won't crash on load
  supabase = createClient('https://placeholder.supabase.co', 'placeholder-key');
} else {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

export { supabase };

