/**
 * One-Shot Prompt-based evaluator implementation using n judging approach
 * Each model evaluates all other models in a single prompt
 */

import type { OpenAI } from 'openai';
import type { IEvaluationService } from './interfaces';
import type { ModelResponse, EvaluationResult, EvaluationOptions, EvaluationScore } from './types';
import { readFileSync } from 'fs';
import { join } from 'path';

const SELECTED_RUBRIC_PATH = join(process.cwd(), 'app', 'rubric', 'types', 'default.txt');

function loadRubric(): string {
  try {
    return readFileSync(SELECTED_RUBRIC_PATH, 'utf-8');
  } catch (err) {
    console.warn(`[NPromptBasedEvaluator] could not read default rubric at ${SELECTED_RUBRIC_PATH}:`, err);
    return '';
  }
}

const SELECTED_RUBRIC = loadRubric();

/**
 * Creates a scoring query prompt for evaluation where one judge evaluates multiple candidates
 * in a single prompt
 */
function createScoringQuery(userQuery: string, candidateResponses: ModelResponse[], rubric: string): string {
  let answers = "";
  for (const response of candidateResponses) {
    answers += `${response.model} RESPONSE:\n${response.content}\n\n`;
  }

  return `You are an expert evaluator for a large language model comparison tool. Your role is to provide objective, rubric-based scores for the candidate's responses to a user's query.

QUERY:
${userQuery}

CANDIDATE RESPONSES:
${answers}

RUBRIC:
${rubric}

Instructions:

Evaluate the Candidate Responses on all rubric dimensions individually, strictly applying the RUBRIC's defined score ranges and weightings.

Calculate the overall score as the weighted sum of all defined scores, without subjective adjustment or rounding beyond rubric guidance.

Your output must be ONLY a JSON object with keys being the exact model names and values being objects with "reasoning" and "score":

{
  "<model_name_1>": {
    "reasoning": "<One-sentence justification explicitly referencing rubric criteria and weights>",
    "score": <integer score from 0 to 100>
  },
  "<model_name_2>": {
    "reasoning": "<One-sentence justification explicitly referencing rubric criteria and weights>",
    "score": <integer score from 0 to 100>
  }
}

Here are the model names for reference: ${candidateResponses.map(r => r.model).join(', ')}`;
}

/**
 * N-Prompt-based evaluator
 */
export class NPromptBasedEvaluator implements IEvaluationService {
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

    // If there is only one valid response, return it.
    if (validResponses.length === 1) {
      return {
        winner: validResponses[0],
        scores: [],
        meanScores: { [validResponses[0].model]: 0 },
        tiedModels: [],
      };
    } else if (validResponses.length === 0) {
      throw new Error('No valid responses to evaluate');
    }

    const rubric = options.rubric || SELECTED_RUBRIC;
    const userQuery = options.userQuery;

    // Build queries: each model judges all OTHER models
    const evaluationTasks = validResponses.map(async (judgeModelResponse) => {
      const judgeModel = judgeModelResponse.model;
      const candidates = validResponses.filter(r => r.model !== judgeModel);

      if (candidates.length === 0) return null;

      const query = createScoringQuery(userQuery, candidates, rubric);

      try {
        const completion = await this.client.chat.completions.create({
          model: judgeModel,
          messages: [{ role: 'user', content: query }],
        });

        const responseContent = completion.choices[0].message.content || '';
        return {
          judgeModel,
          responseContent,
          candidates
        };
      } catch (error) {
        console.error(`[NPromptBasedEvaluator] Evaluation failed for judge ${judgeModel}:`, error);
        return {
          judgeModel,
          responseContent: '',
          candidates,
          error
        };
      }
    });

    const results = await Promise.all(evaluationTasks);

    // Process results into scores
    const scores: EvaluationScore[] = [];

    results.forEach(result => {
      if (!result || result.error || !result.responseContent) return;

      const extractedScores = this.extractScores(result.responseContent);

      // Map extracted scores back to EvaluationScore objects
      result.candidates.forEach(candidate => {
        const candidateScore = extractedScores[candidate.model];
        if (candidateScore) {
          scores.push({
            judgeModel: result.judgeModel,
            evaluatedModel: candidate.model,
            score: candidateScore.score,
            reasoning: candidateScore.reasoning
          });
        } else {
          scores.push({
            judgeModel: result.judgeModel,
            evaluatedModel: candidate.model,
            score: null,
            reasoning: null
          });
        }
      });
    });

    // Calculate mean scores
    const meanScores = this.calculateMeanScores(scores, validResponses.map(r => r.model));

    // Find winner
    const { winner, tiedModels } = this.findWinner(validResponses, meanScores);

    return {
      winner,
      scores,
      meanScores,
      tiedModels
    };
  }

  /**
   * Extracts scores mapping from LLM response
   */
  private extractScores(responseText: string): Record<string, { score: number; reasoning: string }> {
    if (!responseText || responseText.trim().length === 0) {
      return {};
    }

    let jsonStr: string | null = null;

    // Try to find JSON block
    const markdownMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (markdownMatch) {
      jsonStr = markdownMatch[1];
    } else {
      // Fallback: find outer braces
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

    if (!jsonStr) return {};

    try {
      const parsed = JSON.parse(jsonStr);
      const result: Record<string, { score: number; reasoning: string }> = {};

      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'object' && value !== null) {
          const valObj = value as Record<string, unknown>;
          if (
            typeof valObj.reasoning === 'string' &&
            valObj.reasoning.trim().length > 0 &&
            typeof valObj.score === 'number' &&
            valObj.score >= 0 &&
            valObj.score <= 100
          ) {
            result[key] = {
              score: valObj.score,
              reasoning: valObj.reasoning
            };
          }
        }
      }
      return result;
    } catch (e) {
      console.error("[NPromptBasedEvaluator] JSON parse error:", e);
      return {};
    }
  }

  /**
   * Calculates mean scores for each model based on evaluation scores
   */
  private calculateMeanScores(
    scores: EvaluationScore[],
    modelNames: string[]
  ): Record<string, number> {
    const scoreMatrix: Record<string, number[]> = {};
    modelNames.forEach((model) => {
      scoreMatrix[model] = [];
    });

    scores.forEach((score) => {
      if (score.score !== null) {
        scoreMatrix[score.evaluatedModel].push(score.score);
      }
    });

    const meanScores: Record<string, number> = {};
    modelNames.forEach((model) => {
      const modelScores = scoreMatrix[model];
      if (modelScores.length > 0) {
        const sum = modelScores.reduce((acc, val) => acc + val, 0);
        meanScores[model] = sum / modelScores.length;
      } else {
        meanScores[model] = 0;
      }
    });

    return meanScores;
  }

  /**
   * Finds the winning response based on mean scores
   */
  private findWinner(responses: ModelResponse[], meanScores: Record<string, number>): { winner: ModelResponse | null; tiedModels: string[] } {
    const responseMap = new Map<string, ModelResponse>();
    responses.forEach((r) => {
      responseMap.set(r.model, r);
    });

    const scores = Object.values(meanScores);
    if (scores.length === 0) {
      return { winner: null, tiedModels: [] };
    }

    const maxScore = Math.max(...scores);
    const modelsWithMaxScore = Object.entries(meanScores).filter(([_, score]) => score === maxScore);

    if (modelsWithMaxScore.length > 1) {
      return {
        winner: null,
        tiedModels: modelsWithMaxScore.map(([model, _]) => model)
      };
    }

    const winnerModel = modelsWithMaxScore[0][0];
    if (!responseMap.has(winnerModel)) {
      return { winner: null, tiedModels: [] };
    }

    return {
      winner: responseMap.get(winnerModel)!,
      tiedModels: []
    };
  }
}
