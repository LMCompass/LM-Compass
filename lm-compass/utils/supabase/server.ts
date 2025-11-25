import { auth } from "@clerk/nextjs/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase environment variables");
}

/**
 * Creates a Supabase client for server-side use with Clerk authentication.
 * This client automatically injects the Clerk session token into all requests.
 * 
 * @returns A Supabase client configured with Clerk JWT tokens
 */
export const createClient = async () => {
  const { getToken } = await auth();
  
  return createSupabaseClient(supabaseUrl, supabaseKey, {
    global: {
      fetch: async (url, options = {}) => {
        const token = await getToken();
        const headers = new Headers(options.headers);
        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        return fetch(url, {
          ...options,
          headers,
        });
      },
    },
  });
};
