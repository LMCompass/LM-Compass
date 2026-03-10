import { auth } from "@clerk/nextjs/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Creates a Supabase client for server-side use with Clerk authentication.
 * This client automatically injects the Clerk session token into all requests.
 *
 * NOTE: Clerk JWTs are short-lived (~60 s). Do NOT use this client for
 * operations that run after a long async task (e.g. saving a chat after a
 * multi-model eval). Use createAdminClient() for those instead.
 *
 * @returns A Supabase client configured with Clerk JWT tokens
 */
export const createClient = async () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables");
  }

  const { getToken } = await auth();

  return createSupabaseClient(supabaseUrl, supabaseKey, {
    global: {
      fetch: async (url, options = {}) => {
        const token = await getToken();
        const headers = new Headers(options.headers);
        if (token) {
          headers.set("Authorization", `Bearer ${token}`);
        }
        return fetch(url, {
          ...options,
          headers,
        });
      },
    },
  });
};

/**
 * Creates a Supabase admin client using the service role key.
 *
 * This client bypasses Row Level Security and is NOT tied to a short-lived
 * Clerk JWT, so it is safe to use after long-running operations.
 *
 * ⚠️  Only call this from server-side code (API routes, Server Actions).
 *     Never import/use this anywhere that runs in the browser.
 */
export const createAdminClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing env vars: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};
