"use server";

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/utils/supabase/server";

export async function createRubric(rubric: { name: string; description: string }) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return { error: "Unauthorized", success: false };
    }

    if (!rubric.name?.trim() || !rubric.description?.trim()) {
      return { error: "Name and description are required", success: false };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('rubrics')
      .insert({
        rubric_title: rubric.name,
        rubric_content: rubric.description,
        user_id: userId,
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
    const supabase = await createClient();
    const { data, error } = await supabase.from('rubrics').select('*');

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

