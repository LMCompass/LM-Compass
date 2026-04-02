import { OpenAI } from 'openai';
import { auth } from '@clerk/nextjs/server';
import { createClient, createAdminClient } from '@/utils/supabase/server';
import { decrypt } from '@/lib/encryption';
import { NextResponse } from 'next/server';
import { GradeHITLEvaluator, type GradeResult, type HITLExample, type QuestionsAndDrafts } from '@/lib/evaluation';

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const { data: userSettings, error: dbError } = await supabase
      .from('user_settings')
      .select('openrouter_api_key')
      .eq('user_id', userId)
      .single();

    if (dbError || !userSettings?.openrouter_api_key) {
      return NextResponse.json(
        { error: 'OpenRouter API key not found. Please add it in the settings.' },
        { status: 404 }
      );
    }

    let apiKey: string;
    try {
      apiKey = decrypt(userSettings.openrouter_api_key);
    } catch {
      return NextResponse.json(
        { error: 'Failed to decrypt API key. Please try again.' },
        { status: 500 }
      );
    }

    const llmClient = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey,
      defaultHeaders: {
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
        'X-Title': 'LM Compass',
      },
    });

    const body = await req.json();
    const {
      example,
      rubric,
      firstGraderName,
      firstGraderResult,
      questionsAndDrafts,
      humanAnswers,
      modelNames,
      saveRubric,
      rubricTitle,
    } = body as {
      example: HITLExample;
      rubric: string;
      firstGraderName: string;
      firstGraderResult: GradeResult;
      questionsAndDrafts: QuestionsAndDrafts;
      humanAnswers: Record<string, string>;
      modelNames: string[];
      saveRubric?: boolean;
      rubricTitle?: string;
    };

    if (
      !example?.prompt ||
      !example?.response ||
      !rubric ||
      !firstGraderName ||
      !firstGraderResult ||
      !questionsAndDrafts ||
      !humanAnswers ||
      !Array.isArray(modelNames) ||
      modelNames.length === 0
    ) {
      return NextResponse.json(
        { error: 'Missing or invalid body: example, rubric, firstGraderName, firstGraderResult, questionsAndDrafts, humanAnswers, modelNames required.' },
        { status: 400 }
      );
    }

    const evaluator = new GradeHITLEvaluator(llmClient, ...modelNames);
    const result = await evaluator.phase2(
      example,
      rubric,
      firstGraderName,
      firstGraderResult,
      questionsAndDrafts,
      humanAnswers
    );

    // Optionally persist the updated rubric for later reuse.
    if (saveRubric) {
      const titleFromUser = typeof rubricTitle === "string" ? rubricTitle.trim() : "";
      const title =
        titleFromUser.length > 0
          ? titleFromUser
          : `HITL rubric ${new Date().toISOString()}`;
      
      const adminSupabase = createAdminClient();
      const { data: saved, error: saveError } = await adminSupabase
        .from("rubrics")
        .insert({
          rubric_title: title,
          rubric_content: result.updatedRubric,
          user_id: userId,
          mode: "custom",
          category: "hitl",
        })
        .select("id, rubric_title")
        .single();

      if (saveError) {
        return NextResponse.json({
          ...result,
          saveRubricError: saveError.message,
        });
      }

      return NextResponse.json({
        ...result,
        savedRubricId: saved?.id ? String(saved.id) : undefined,
        savedRubricTitle:
          typeof saved?.rubric_title === "string" ? saved.rubric_title : title,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('HITL phase2 failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'HITL phase 2 failed' },
      { status: 500 }
    );
  }
}
