import { OpenAI } from 'openai';
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/utils/supabase/server";
import { decrypt } from "@/lib/encryption";
import { NextResponse } from 'next/server';
import { PromptBasedEvaluator, NPromptBasedEvaluator, RL4FEvaluator, type ModelResponse, type EvaluationMetadata } from '@/lib/evaluation';
import {
  DEFAULT_EVAL_METHOD,
  MAX_EXPERIMENT_ITERATIONS,
  MIN_EXPERIMENT_ITERATIONS,
  isExperimentEvaluationMethod,
  resolveExperimentIterations,
} from '@/lib/experiments';
import { loadDefaultRubricText } from '@/lib/rubrics';

function adjustRubricWithExpectedOutput(rubric: string, expectedOutput: string): string {
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
    } catch {
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

    const { input_query, expected_output, models, rubric, evaluationMethod, iterations } = await req.json();

    if (!input_query) {
      return NextResponse.json(
        { error: 'input_query is required' },
        { status: 400 }
      );
    }

    let modelsToQuery: string[];

    if (Array.isArray(models) && models.length > 0) {
      modelsToQuery = models;
    } else if (models) {
      modelsToQuery = [models];
    } else {
      return NextResponse.json(
        { error: 'No models selected. Please select at least one model before querying.' },
        { status: 400 }
      );
    }

    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
      {
        role: 'user',
        content: input_query,
      },
    ];

    const allResults = await Promise.all(
      modelsToQuery.map(async (modelId: string) => {
        const startedAtMs = Date.now();
        try {
          const completion = await llmClient.chat.completions.create({
            model: modelId,
            messages: messages,
          });

          return {
            model: modelId,
            message: completion.choices[0].message,
            latencyMs: Date.now() - startedAtMs,
          };
        } catch (error) {
          let errorMessage = error instanceof Error ? error.message : 'Request failed';

          const errorMessageLower = errorMessage.toLowerCase();
          if (
            errorMessageLower.includes('401') ||
            errorMessageLower.includes('user not found') ||
            errorMessageLower.includes('invalid api key') ||
            errorMessageLower.includes('authentication failed') ||
            (error instanceof Error && 'status' in error && (error as Error & { status: number }).status === 401)
          ) {
            errorMessage = 'The OpenRouter API key is invalid. Please update with a valid key in settings.';
          }

          return {
            model: modelId,
            error: errorMessage,
            latencyMs: Date.now() - startedAtMs,
          };
        }
      })
    );

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

    if (successfulResults.length < 2) {
      return NextResponse.json(
        {
          error: 'Need at least 2 successful model responses for evaluation',
          results: allResults,
        },
        { status: 400 }
      );
    }

    const resolvedEvaluationMethod = (() => {
      if (evaluationMethod == null || evaluationMethod === '') {
        return DEFAULT_EVAL_METHOD;
      }

      if (!isExperimentEvaluationMethod(evaluationMethod)) {
        return null;
      }

      return evaluationMethod;
    })();

    if (!resolvedEvaluationMethod) {
      return NextResponse.json(
        { error: 'Unsupported evaluationMethod. Allowed values: prompt-based, n-prompt-based, rl4f.' },
        { status: 400 }
      );
    }

    const {
      iterations: resolvedIterations,
      isValidForMethod,
    } = resolveExperimentIterations(resolvedEvaluationMethod, iterations);
    if (!isValidForMethod) {
      return NextResponse.json(
        {
          error: `For rl4f evaluation, iterations must be an integer between ${MIN_EXPERIMENT_ITERATIONS} and ${MAX_EXPERIMENT_ITERATIONS}.`,
        },
        { status: 400 }
      );
    }

    const baseRubric =
      typeof rubric === 'string' && rubric.trim().length > 0
        ? rubric
        : loadDefaultRubricText();

    const finalRubric = expected_output
      ? adjustRubricWithExpectedOutput(baseRubric, expected_output)
      : baseRubric;

    let evaluator;
    if (resolvedEvaluationMethod === 'n-prompt-based') {
      evaluator = new NPromptBasedEvaluator(llmClient);
    } else if (resolvedEvaluationMethod === 'rl4f') {
      evaluator = new RL4FEvaluator(llmClient);
    } else {
      evaluator = new PromptBasedEvaluator(llmClient);
    }

    const evaluationResult = await evaluator.evaluate(successfulResults, {
      userQuery: input_query,
      rubric: finalRubric,
      iterations: resolvedIterations,
    });

    const modelReasoning: Record<string, string[]> = {};
    successfulResults.forEach((r) => {
      modelReasoning[r.model] = [];
    });
    evaluationResult.scores.forEach((score) => {
      if (score.reasoning !== null) {
        modelReasoning[score.evaluatedModel].push(score.reasoning);
      }
    });

    const evaluationMetadata: EvaluationMetadata = {
      winnerModel: evaluationResult.winner ? evaluationResult.winner.model : null,
      scores: evaluationResult.scores,
      meanScores: evaluationResult.meanScores,
      modelReasoning,
      tiedModels: evaluationResult.tiedModels,
    };

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
