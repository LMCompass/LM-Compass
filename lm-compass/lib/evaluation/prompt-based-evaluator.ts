/**
 * Prompt-based evaluator implementation using n² judging approach
 * Ports the Python notebook logic to TypeScript
 */

import type { OpenAI } from 'openai';
import type { IEvaluationService } from './interfaces';
import type { ModelResponse, EvaluationResult, EvaluationOptions, EvaluationScore } from './types';

/**
 * Default rubric for evaluation (SHOULD BE EXTERNALIZED AND IMPORTED)
 */
const DEFAULT_RUBRIC = `Correctness & Accuracy (25 points) — Ensures claims are factually accurate and verifiable, addressing the most critical concern of hallucination-free responses. This is weighted highest because inaccurate information undermines all other qualities.

Completeness (20 points) - Verifies the answer addresses all aspects of the query without significant omissions. This prevents shallow or partial responses that technically answer only part of the question.

Clarity & Coherence (18 points) - Assesses whether the answer is well-organized with logical flow. Research shows that coherence and relevance are strong signals of problem-solving quality.

Relevance (18 points) - Ensures all information pertains to the question, avoiding tangential content that confuses the issue. This maintains focus and efficiency.

Conciseness (10 points) - Rewards efficiency by penalizing unnecessary verbosity or repetition while maintaining completeness. This balances against verbose but complete responses.

Appropriateness for Context (9 points) — Checks whether tone, depth, and format match what the questioner likely needs. Technical questions require different treatment than conversational ones.`;

/**
 * Creates a scoring query prompt for evaluation (system prompt is currently designed for default rubric but should be generalized)
 */
function createScoringQuery(userQuery: string, candidateAnswer: string, rubric: string): string {
  return `You are an expert evaluator for a large language model comparison tool. Your role is to provide an objective, rubric-based score for the candidate's response to a user's query.

QUERY:
${userQuery}

CANDIDATE RESPONSE:
${candidateAnswer}

RUBRIC:
${rubric}

Instructions:

Evaluate the Candidate Response on all rubric dimensions individually, strictly applying the rubric's defined score ranges and weightings—for example, Correctness & Accuracy is out of 25 points, Completeness 20 points, etc.

If the Candidate Response contains any factual inaccuracies, assign the Correctness & Accuracy score corresponding to those errors as explicitly defined in the rubric, which could be as low as 0-4 out of 25 for fundamental factual errors. Do not inflate this score due to other qualities.

Calculate the overall score as the weighted sum of all dimension scores, without subjective adjustment or rounding beyond rubric guidance.

Your output must be ONLY a JSON object with:

1. "reasoning": "<One-sentence justification explicitly referencing rubric criteria and weights, including correctness importance>"

2. "score": <integer score from 0 to 100>

Use your judgment to apply rubric weightings accurately, and remember that Correctness & Accuracy has the highest impact on the overall score.`;
}

/**
 * Prompt-based evaluator
 */
export class PromptBasedEvaluator implements IEvaluationService {
  private client: OpenAI;

  constructor(client: OpenAI) {
    this.client = client;
  }

  /**
   * Main evaluation method
   */
  async evaluate(
    responses: ModelResponse[],
    options: EvaluationOptions
  ): Promise<EvaluationResult> {
    const validResponses = responses.filter((r) => !r.error && r.content.trim().length > 0);

    if (validResponses.length < 2) {
      // If less than 2 valid responses, return the first one (or throw if none)
      if (validResponses.length === 0) {
        throw new Error('No valid responses to evaluate');
      }
      return {
        winner: validResponses[0],
        scores: [],
        meanScores: { [validResponses[0].model]: 0 },
      };
    }

    const rubric = options.rubric || DEFAULT_RUBRIC;
    const userQuery = options.userQuery;

    const { judgeModels, scoringQueries, evaluatedModels } = this.buildScoringQueries(
      validResponses,
      userQuery,
      rubric
    );

    // Execute all evaluation queries in parallel
    const evaluationResults = await Promise.allSettled(
      judgeModels.map(async (judgeModel, index) => {
        const completion = await this.client.chat.completions.create({
          model: judgeModel,
          messages: [{ role: 'user', content: scoringQueries[index] }],
        });
        return {
          judgeModel,
          evaluatedModel: evaluatedModels[index],
          response: completion.choices[0].message.content || '',
        };
      })
    );

    // Extract scores and reasoning from responses
    const scores: EvaluationScore[] = evaluationResults.map((result, index) => {
      if (result.status === 'fulfilled') {
        const { score, reasoning } = this.extractScoreAndReasoning(result.value.response);
        
        return {
          judgeModel: result.value.judgeModel,
          evaluatedModel: result.value.evaluatedModel,
          score,
          reasoning,
        };
      }
      // If the evaluation query failed, return null score and reasoning
      console.error(
        `[Evaluation] Query failed: ${judgeModels[index]} → ${evaluatedModels[index]}`,
        result.status === 'rejected' ? result.reason : 'Unknown error'
      );
      return {
        judgeModel: judgeModels[index],
        evaluatedModel: evaluatedModels[index],
        score: null,
        reasoning: null,
      };
    });

    // Calculate mean scores for each model
    const meanScores = this.calculateMeanScores(scores, validResponses.map((r) => r.model));

    // Find the winner
    const winner = this.findWinner(validResponses, meanScores);

    return {
      winner,
      scores,
      meanScores,
    };
  }

  /**
   * Builds the n² scoring queries where each model judges all other models
   */
  private buildScoringQueries(
    responses: ModelResponse[],
    userQuery: string,
    rubric: string
  ): {
    judgeModels: string[];
    scoringQueries: string[];
    evaluatedModels: string[];
  } {
    const judgeModels: string[] = [];
    const scoringQueries: string[] = [];
    const evaluatedModels: string[] = [];

    // Create response map for quick lookup
    const responseMap = new Map<string, string>();
    responses.forEach((r) => {
      responseMap.set(r.model, r.content);
    });

    // each model judges all other models
    for (const judgeResponse of responses) {
      for (const candidateResponse of responses) {
        if (judgeResponse.model !== candidateResponse.model) {
          judgeModels.push(judgeResponse.model);
          evaluatedModels.push(candidateResponse.model);
          scoringQueries.push(
            createScoringQuery(userQuery, candidateResponse.content, rubric)
          );
        }
      }
    }

    return { judgeModels, scoringQueries, evaluatedModels };
  }

  /**
   * Extracts the score and reasoning from an LLM response, handling various JSON formats
   */
  private extractScoreAndReasoning(responseText: string): { score: number | null; reasoning: string | null } {
    if (!responseText || responseText.trim().length === 0) {
      return { score: null, reasoning: null };
    }

    let jsonStr: string | null = null;

    // First, try to extract JSON from markdown code blocks
    // Use [\s\S] instead of . with 's' flag for ES2017 compatibility
    const markdownMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (markdownMatch) {
      jsonStr = markdownMatch[1];
    } else {
      // Try to find any JSON object in the text using brace counting
      const firstBrace = responseText.indexOf('{');
      if (firstBrace !== -1) {
        let braceCount = 0;
        let end = -1;
        for (let i = firstBrace; i < responseText.length; i++) {
          if (responseText[i] === '{') {
            braceCount++;
          } else if (responseText[i] === '}') {
            braceCount--;
            if (braceCount === 0) {
              end = i;
              break;
            }
          }
        }
        if (end !== -1) {
          jsonStr = responseText.slice(firstBrace, end + 1);
        }
      }
    }

    if (!jsonStr) {
      return { score: null, reasoning: null };
    }

    try {
      const parsed = JSON.parse(jsonStr);
      const score = parsed.score;
      const reasoning = parsed.reasoning;
      
      const extractedScore = typeof score === 'number' && score >= 0 && score <= 100
        ? score
        : null;

      const extractedReasoning = typeof reasoning === 'string' && reasoning.trim().length > 0
        ? reasoning.trim()
        : null;

      return { score: extractedScore, reasoning: extractedReasoning };
    } catch {
      return { score: null, reasoning: null };
    }
  }

  /**
   * Calculates mean scores for each model based on evaluation scores
   */
  private calculateMeanScores(
    scores: EvaluationScore[],
    modelNames: string[]
  ): Record<string, number> {
    // Build score matrix: model -> array of scores from judges
    const scoreMatrix: Record<string, number[]> = {};
    modelNames.forEach((model) => {
      scoreMatrix[model] = [];
    });

    // Collect scores for each evaluated model
    scores.forEach((score) => {
      if (score.score !== null) {
        scoreMatrix[score.evaluatedModel].push(score.score);
      }
    });

    // Calculate mean for each model
    const meanScores: Record<string, number> = {};
    modelNames.forEach((model) => {
      const modelScores = scoreMatrix[model];
      if (modelScores.length > 0) {
        const sum = modelScores.reduce((acc, val) => acc + val, 0);
        meanScores[model] = sum / modelScores.length;
      } else {
        // If no valid scores, set to 0
        meanScores[model] = 0;
      }
    });

    return meanScores;
  }

  /**
   * Finds the winning response based on mean scores
   * Returns null if there's a tie (multiple models with the same highest score)
   */
  private findWinner(responses: ModelResponse[], meanScores: Record<string, number>): ModelResponse | null {
    // Create response map for quick lookup
    const responseMap = new Map<string, ModelResponse>();
    responses.forEach((r) => {
      responseMap.set(r.model, r);
    });

    // Find maximum mean score
    const scores = Object.values(meanScores);
    if (scores.length === 0) {
      return null;
    }
    
    const maxScore = Math.max(...scores);

    // Count how many models have the maximum score
    const modelsWithMaxScore = Object.entries(meanScores).filter(([_, score]) => score === maxScore);

    // If multiple models have the same highest score, it's a tie
    if (modelsWithMaxScore.length > 1) {
      return null;
    }

    // Single winner exists
    const winnerModel = modelsWithMaxScore[0][0];
    if (!responseMap.has(winnerModel)) {
      return null;
    }

    return responseMap.get(winnerModel)!;
  }
}

