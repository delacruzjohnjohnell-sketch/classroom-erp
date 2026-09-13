import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  // Helpful console warning in dev if .env.local hasn't been set up yet.
  console.warn(
    "Supabase env vars are missing. Copy .env.example to .env.local and fill in your project's URL and anon key."
  );
}

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});
