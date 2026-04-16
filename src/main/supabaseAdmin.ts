import { createClient } from '@supabase/supabase-js';

// Main process Supabase client with service role key (backend-only)
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn(
    'Supabase not configured. Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env to enable cloud sync.'
  );
}

export const supabaseAdmin =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      })
    : null;

/**
 * Get the anon key from environment (passed from electron context)
 */
export function getSupabaseAnonKey(): string | null {
  return process.env.VITE_SUPABASE_ANON_KEY || null;
}
