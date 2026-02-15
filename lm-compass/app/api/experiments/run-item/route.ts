import { OpenAI } from 'openai';
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/utils/supabase/server";
import { decrypt } from "@/lib/encryption";
import { NextResponse } from 'next/server';
import { PromptBasedEvaluator, NPromptBasedEvaluator, type ModelResponse, type EvaluationMetadata } from '@/lib/evaluation';
import { readFile } from 'fs/promises';
import { join } from 'path';

/**
 * Loads the default rubric from the file system
 */
async function loadDefaultRubric(): Promise<string> {
  const rubricPath = join(process.cwd(), 'app', 'rubric', 'types', 'default.txt');
  const rubricContent = await readFile(rubricPath, 'utf-8');
  return rubricContent;
}

/**
 * Adjusts the rubric to include the expected output as the ground truth
 * @param rubric The base rubric criteria
 * @param expectedOutput The ground truth/expected answer
 * @returns Modified rubric that incorporates the expected output
 */
function adjustRubricWithExpectedOutput(rubric: string, expectedOutput: string): string {
  // Inject the expected output into the rubric
  const adjustedRubric = `${rubric} 
  ${expectedOutput}
  IMPORTANT: When evaluating responses, compare them against the above ground truth. Responses that align with or correctly produce the expected output should receive higher scores, especially in Correctness & Accuracy. Responses that deviate significantly from the ground truth should be penalized accordingly.`;

  return adjustedRubric;
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
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

    let apiKey;
    try {
      apiKey = decrypt(userSettings.openrouter_api_key);
    } catch (e) {
      return NextResponse.json(
        { error: 'Failed to decrypt API key. Please try again.' },
        { status: 500 }
      );
    }

    const llmClient = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: apiKey,
      defaultHeaders: {
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
        'X-Title': 'LM Compass',
      },
    });

    const { input_query, expected_output, models, rubric, evaluationMethod } = await req.json();

    // Validate required inputs
    if (!input_query) {
      return NextResponse.json(
        { error: 'input_query is required' },
        { status: 400 }
      );
    }

    // Normalize to models array - handle both single model (legacy) and multi-model cases
    let modelsToQuery: string[];

    if (Array.isArray(models) && models.length > 0) {
      modelsToQuery = models;
    } else if (models) {
      modelsToQuery = [models];
    } else {
      // No models provided - return error
      return NextResponse.json(
        { error: 'No models selected. Please select at least one model before querying.' },
        { status: 400 }
      );
    }

    // Create messages array for the model query
    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
      {
        role: 'user',
        content: input_query,
      },
    ];

    // Query all models
    const settled = await Promise.allSettled(
      modelsToQuery.map(async (modelId: string) => {
        const completion = await llmClient.chat.completions.create({
          model: modelId,
          messages: messages,
        });
        return {
          model: modelId,
          message: completion.choices[0].message,
        };
      })
    );

    // Process results
    const allResults = settled.map((res, idx) => {
      const modelId = modelsToQuery[idx];
      if (res.status === 'fulfilled') {
        return { model: modelId, message: res.value.message };
      }

      // Extract error message
      let errorMessage = res.reason instanceof Error ? res.reason.message : 'Request failed';

      // Check if error is related to invalid API key
      const errorMessageLower = errorMessage.toLowerCase();
      if (
        errorMessageLower.includes('401') ||
        errorMessageLower.includes('user not found') ||
        errorMessageLower.includes('invalid api key') ||
        errorMessageLower.includes('authentication failed') ||
        (res.reason instanceof Error && 'status' in res.reason && (res.reason as Error & { status: number }).status === 401)
      ) {
        errorMessage = 'The OpenRouter API key is invalid. Please update with a valid key in settings.';
      }

      return {
        model: modelId,
        error: errorMessage,
      };
    });

    // Filter successful responses for evaluation
    const successfulResults: ModelResponse[] = allResults
      .filter((r) => {
        if (r.error) return false;
        const content = r.message?.content;
        return content && content.trim().length > 0;
      })
      .map((r) => ({
        model: r.model,
        content: r.message?.content || '',
      }));

    // If we don't have at least 2 successful responses, return error
    if (successfulResults.length < 2) {
      return NextResponse.json(
        {
          error: 'Need at least 2 successful model responses for evaluation',
          results: allResults,
        },
        { status: 400 }
      );
    }

    // Load the base rubric (from provided rubric or default file)
    const baseRubric = rubric || await loadDefaultRubric();

    // Adjust rubric if expected_output is provided
    const finalRubric = expected_output
      ? adjustRubricWithExpectedOutput(baseRubric, expected_output)
      : baseRubric;

    // Create evaluator based on selected method
    let evaluator;
    if (evaluationMethod === 'n-prompt-based') {
      evaluator = new NPromptBasedEvaluator(llmClient);
    } else {
      // Default to n^2 prompt-based
      evaluator = new PromptBasedEvaluator(llmClient);
    }

    // Run evaluation
    const evaluationResult = await evaluator.evaluate(successfulResults, {
      userQuery: input_query,
      rubric: finalRubric,
    });

    // Aggregate reasoning for each model
    const modelReasoning: Record<string, string[]> = {};
    successfulResults.forEach((r) => {
      modelReasoning[r.model] = [];
    });
    evaluationResult.scores.forEach((score) => {
      if (score.reasoning !== null) {
        modelReasoning[score.evaluatedModel].push(score.reasoning);
      }
    });

    // Create evaluation metadata
    const evaluationMetadata: EvaluationMetadata = {
      winnerModel: evaluationResult.winner ? evaluationResult.winner.model : null,
      scores: evaluationResult.scores,
      meanScores: evaluationResult.meanScores,
      modelReasoning,
      tiedModels: evaluationResult.tiedModels,
    };

    // Return the evaluation results
    return NextResponse.json({
      success: true,
      evaluationMetadata,
      results: allResults,
    });

  } catch (error: unknown) {
    console.error('Error processing experiment item:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process experiment item' },
      { status: 500 }
    );
  }
}
