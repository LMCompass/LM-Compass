"use server";

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/utils/supabase/server";
import {
  CURRENT_TOUR_VERSION,
  type OnboardingState,
  type OnboardingStatus,
} from "@/lib/onboarding";

type GetOnboardingStateResult = {
  shouldAutoStart: boolean;
  status?: OnboardingStatus;
  version?: number;
};

function isOnboardingStatus(value: unknown): value is OnboardingStatus {
  return value === "completed" || value === "skipped";
}

function parseOnboardingState(value: unknown): OnboardingState | null {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const version = record.version;
  const status = record.status;
  const updatedAt = record.updatedAt;

  if (
    typeof version !== "number" ||
    !isOnboardingStatus(status) ||
    typeof updatedAt !== "string"
  ) {
    return null;
  }

  return {
    version,
    status,
    updatedAt,
  };
}

export async function getOnboardingState(): Promise<GetOnboardingStateResult> {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { shouldAutoStart: false };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("user_settings")
      .select("onboarding_state")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Failed to load onboarding state:", error);
      return { shouldAutoStart: true };
    }

    const parsedState = parseOnboardingState(
      (data as { onboarding_state?: unknown } | null)?.onboarding_state
    );

    if (!parsedState) {
      return { shouldAutoStart: true };
    }

    const shouldAutoStart =
      parsedState.version !== CURRENT_TOUR_VERSION ||
      !isOnboardingStatus(parsedState.status);

    return {
      shouldAutoStart,
      status: parsedState.status,
      version: parsedState.version,
    };
  } catch (error) {
    console.error("Unexpected onboarding state error:", error);
    return { shouldAutoStart: true };
  }
}

export async function setOnboardingState(
  status: OnboardingStatus,
  version: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    if (!isOnboardingStatus(status)) {
      return { success: false, error: "Invalid onboarding status." };
    }

    if (!Number.isFinite(version) || version <= 0) {
      return { success: false, error: "Invalid onboarding version." };
    }

    const supabase = await createClient();
    const onboardingState: OnboardingState = {
      version,
      status,
      updatedAt: new Date().toISOString(),
    };

    const { error } = await supabase.from("user_settings").upsert(
      {
        user_id: userId,
        onboarding_state: onboardingState,
        updated_at: onboardingState.updatedAt,
      },
      { onConflict: "user_id" }
    );

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to persist onboarding state:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unexpected error",
    };
  }
}
