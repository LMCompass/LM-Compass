"use client";

import { useSession } from "@clerk/nextjs";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { useMemo } from "react";

/**
 * Hook to create a Supabase client for client-side use with Clerk authentication.
 * This client automatically injects the Clerk session token into all requests.
 * 
 * @returns A Supabase client configured with Clerk JWT tokens
 */
export function useSupabaseClient() {
  const { session } = useSession();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables");
  }

  const client = useMemo(() => {
    return createSupabaseClient(supabaseUrl, supabaseKey, {
      global: {
        fetch: async (url, options = {}) => {
          const token = await session?.getToken();
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
  }, [session]);

  return client;
}
