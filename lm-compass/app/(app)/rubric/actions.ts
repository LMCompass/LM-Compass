"use server";

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/utils/supabase/server";
import {
  buildRubricFromWeights,
  loadDefaultRubricText,
  parseDefaultRubric,
} from "@/lib/rubrics";
import type {
  RubricCategory,
  RubricEvaluationMethod,
} from "@/lib/rubrics";

type CreateRubricFromDefaultPayload = {
  mode: "weight-adjusted-default";
  title: string;
  weights: Record<string, number>;
  evaluationMethods: RubricEvaluationMethod[];
};

type CreateCustomRubricPayload = {
  mode: "custom";
  title: string;
  content: string;
  evaluationMethods: RubricEvaluationMethod[];
};

type LegacyCreateRubricPayload = {
  name: string;
  description: string;
};

export async function createRubric(
  input:
    | CreateRubricFromDefaultPayload
    | CreateCustomRubricPayload
    | LegacyCreateRubricPayload
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { error: "Unauthorized", success: false };
    }

    let mode: "weight-adjusted-default" | "custom";
    let title: string;
    let content: string;
    let weightsJson: Record<string, number> | null = null;
    let evaluationMethods: RubricEvaluationMethod[] = ["prompt-based"];

    if ("mode" in input) {
      title = input.title?.trim() ?? "";
      if (!title) {
        return { error: "Name is required", success: false };
      }

      if (Array.isArray(input.evaluationMethods) && input.evaluationMethods.length > 0) {
        evaluationMethods = input.evaluationMethods;
      }

      if (input.mode === "weight-adjusted-default") {
        mode = "weight-adjusted-default";

        const rawWeights = input.weights ?? {};

        const defaultText = loadDefaultRubricText();
        const categories = parseDefaultRubric(defaultText);

        if (!categories.length) {
          return {
            error: "Default rubric is not configured correctly.",
            success: false,
          };
        }

        const categoryKeys = new Set(categories.map((c) => c.key));

        for (const key of Object.keys(rawWeights)) {
          if (!categoryKeys.has(key)) {
            return {
              error: `Unknown rubric category: ${key}`,
              success: false,
            };
          }
        }

        const normalizedWeights: Record<string, number> = {};
        for (const category of categories) {
          const value = rawWeights[category.key];
          if (
            typeof value !== "number" ||
            !Number.isFinite(value) ||
            value <= 0
          ) {
            return {
              error: `Invalid weight for category "${category.key}".`,
              success: false,
            };
          }
          normalizedWeights[category.key] = value;
        }

        const total = Object.values(normalizedWeights).reduce(
          (sum, v) => sum + v,
          0
        );
        if (total !== 100) {
          return {
            error: `Total points must be 100, got ${total}.`,
            success: false,
          };
        }

        weightsJson = normalizedWeights;
        content = buildRubricFromWeights(categories, normalizedWeights);
      } else {
        mode = "custom";
        content = input.content?.trim() ?? "";
        if (!content) {
          return { error: "Description is required", success: false };
        }
      }
    } else {
      mode = "custom";
      title = input.name?.trim() ?? "";
      content = input.description?.trim() ?? "";

      if (!title || !content) {
        return {
          error: "Name and description are required",
          success: false,
        };
      }
      evaluationMethods = ["prompt-based"];
    }

    const evaluationCategoryString = evaluationMethods.join(",");

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("rubrics")
      .insert({
        rubric_title: title,
        rubric_content: content,
        user_id: userId,
        mode,
        weights_json: weightsJson,
        category: evaluationCategoryString,
      })
      .select()
      .single();

    if (error) {
      return { error: error.message, success: false };
    }

    return { data, success: true };
  } catch (error) {
    console.error("Error creating rubric:", error);
    return {
      error: error instanceof Error ? error.message : "Internal server error",
      success: false,
    };
  }
}

export async function getRubrics() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { error: "Unauthorized", success: false, data: null };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("rubrics")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      return { error: error.message, success: false, data: null };
    }

    return { data, success: true };
  } catch (error) {
    console.error("Error fetching rubrics:", error);
    return {
      error: error instanceof Error ? error.message : "Internal server error",
      success: false,
      data: null,
    };
  }
}

export async function deleteRubric(id: string) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("rubrics")
      .delete()
      .eq("id", id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error("Error deleting rubric:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Internal server error",
    };
  }
}

export async function getDefaultRubricCategories(): Promise<{
  success: boolean;
  data?: RubricCategory[];
  error?: string;
}> {
  try {
    const text = loadDefaultRubricText();
    const categories = parseDefaultRubric(text);

    if (!categories.length) {
      return {
        success: false,
        error: "Default rubric is not configured correctly.",
      };
    }

    return { success: true, data: categories };
  } catch (error) {
    console.error("Error loading default rubric categories:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to load default rubric categories",
    };
  }
}


