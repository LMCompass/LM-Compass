"use server";

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/utils/supabase/server";
import { encrypt } from "@/lib/encryption";

export async function saveOpenRouterKey(apiKey: string) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { error: "Unauthorized", success: false };
    }

    const encryptedKey = encrypt(apiKey);

    const supabase = await createClient();

    const { error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: userId,
        openrouter_api_key: encryptedKey,
        updated_at: new Date().toISOString()
      });

    if (error) {
      return { error: error.message, success: false };
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to save API key:", error);
    return {
      error: error instanceof Error ? error.message : "Internal server error",
      success: false,
    };
  }
}