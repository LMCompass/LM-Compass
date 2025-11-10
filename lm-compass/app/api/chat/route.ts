import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';
import { PromptBasedEvaluator, type ModelResponse, type EvaluationMetadata } from '@/lib/evaluation';

const llmClient = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
    'X-Title': 'LM Compass',
  },
});

/**
 * Extracts the user query from the messages array (last user message)
 */
function extractUserQuery(messages: Array<{ role: string; content: string }>): string {
  // Find the last user message
  if (messages.length >= 2 && messages[messages.length - 2].role === 'user') {
    return messages[messages.length - 2].content;
  }
  // Fallback: return empty string if no user message found
  return '';
}

export async function POST(req: Request) {
  try {
    const { messages, model, models } = await req.json();

    // Normalize to models array - handle both single model (legacy) and multi-model cases
    let modelsToQuery: string[];
    
    if (Array.isArray(models) && models.length > 0) {
      modelsToQuery = models;
    } else if (model) {
      modelsToQuery = [model];
    } else {
      modelsToQuery = ['tngtech/deepseek-r1t2-chimera:free'];
    }

    // Always use multi-model logic for consistent return format
    const settled = await Promise.allSettled(
      modelsToQuery.map(async (m: string) => {
        const completion = await llmClient.chat.completions.create({
          model: m,
          messages: messages,
        });
        return {
          model: m,
          message: completion.choices[0].message,
        };
      })
    );

    const allResults = settled.map((res, idx) => {
      const modelId = modelsToQuery[idx];
      if (res.status === 'fulfilled') {
        return { model: modelId, message: res.value.message };
      }
      return { 
        model: modelId, 
        error: res.reason instanceof Error ? res.reason.message : 'Request failed' 
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

    // If we have 2 or more successful responses, use evaluation to find the winner
    if (successfulResults.length >= 2) {
      try {
        const userQuery = extractUserQuery(messages);

        // Create evaluator and evaluate responses
        const evaluator = new PromptBasedEvaluator(llmClient);
        const evaluationResult = await evaluator.evaluate(successfulResults, {
          userQuery,
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
        };

        // Return ALL results with evaluation metadata
        return NextResponse.json({
          results: allResults,
          evaluationMetadata,
        });
      } catch (evaluationError) {
        // If evaluation fails, log error and return all results with evaluationMetadata indicating failure
        console.error('Evaluation failed:', evaluationError);
        return NextResponse.json({
          results: allResults,
          evaluationMetadata: {
            status: 'error',
            errorMessage: evaluationError instanceof Error ? evaluationError.message : 'Evaluation failed',
          },
        });
      }
    }

    // (0-1 responses, or evaluation error)
    return NextResponse.json({ results: allResults });
  } catch (error: unknown) {
    console.error('Error calling OpenRouter:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get response from AI' },
      { status: 500 }
    );
  }
}

