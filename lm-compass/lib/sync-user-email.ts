import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { createClient } from "@/utils/supabase/server";

/**
 * Persists the signed-in user's primary email into `user_settings.email`
 * so Supabase rows are human-readable alongside Clerk `user_id`.
 */
export async function syncUserEmailToDatabase() {
  const { userId } = await auth();
  if (!userId) return;

  const clerkUser = await currentUser();
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses?.[0]?.emailAddress;
  if (!email) return;

  const supabase = await createClient();

  const { error } = await supabase.from("user_settings").upsert(
    {
      user_id: userId,
      email,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("syncUserEmailToDatabase:", error.message);
  }
}
