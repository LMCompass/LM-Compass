/**
 * RL4F (Refinement Loop for Feedback) Evaluator
 * Extends PromptBasedEvaluator with self-critique and refinement capabilities
 */

import type { OpenAI } from 'openai';
import type { ModelResponse, EvaluationResult, EvaluationOptions, EvaluationScore } from './types';
import { PromptBasedEvaluator } from './prompt-based-evaluators';
import { readFileSync } from 'fs';
import { join } from 'path';

const SELECTED_RUBRIC_PATH = join(process.cwd(), 'app', 'rubric', 'types', 'default.txt');

function loadRubric(): string {
  try {
    return readFileSync(SELECTED_RUBRIC_PATH, 'utf-8');
  } catch (err) {
    console.warn(`[RL4FEvaluator] could not read default rubric at ${SELECTED_RUBRIC_PATH}:`, err);
    return '';
  }
}

const SELECTED_RUBRIC = loadRubric();

/**
 * Represents a single critique entry in the refinement history
 */
export type CritiqueEntry = {
  evaluatingModel: string;
  evaluatedModel: string;
  beforeScore: number;
  beforeReasoning: string;
  rawResponse: string;
  afterScore: number | null;
  afterReasoning: string | null;
};

/**
 * RL4F Evaluator - runs evaluations with self-critique refinement loops
 */
export class RL4FEvaluator extends PromptBasedEvaluator {
  private critiqueHistory: CritiqueEntry[][] = [];
  private userQueryAnswers: ModelResponse[] = [];
  private evaluationQueryAnswers: EvaluationScore[] = [];

  constructor(client: OpenAI) {
    super(client);
  }

  /**
   * Formats a critique entry for readable display
   */
  formatCritiqueEntry(item: CritiqueEntry): string {
    const lines = [
      `Judge: ${item.evaluatingModel}  ->  Candidate: ${item.evaluatedModel}`,
      '  Before:',
      `    Score: ${item.beforeScore}`,
      `    Reasoning: ${item.beforeReasoning}`,
      '  Raw response (critique + revision):',
      '    ' + item.rawResponse.replace(/\n/g, '\n    '),
      '  After:',
      `    Score: ${item.afterScore}`,
      `    Reasoning: ${item.afterReasoning}`,
    ];
    return lines.join('\n');
  }

  /**
   * Creates a self-critique and revision prompt
   */
  private createSelfCritiquePrompt(
    userQuery: string,
    rubric: string,
    response: string,
    reasoning: string,
    score: number
  ): string {
    return `You previously evaluated a candidate's response and gave a score with a rationale. Now critique your evaluation and then provide a revised score and rationale.

QUERY:
${userQuery}

CANDIDATE RESPONSE (that you evaluated):
${response}

RUBRIC:
${rubric}

YOUR PREVIOUS EVALUATION:
- Reasoning: ${reasoning}
- Score: ${score} (out of 100)

Instructions:

1. Critique: Briefly critique your previous rationale and score. Consider whether you were too harsh or lenient, missed rubric criteria, or misapplied weightings. Be specific (e.g., "I may have been too strict on Completeness").

2. Revision: After your critique, output your revised evaluation as a single JSON object. You must end your response with exactly one line that is only this JSON object (no other text on that line):
{"reasoning": "<one-sentence revised justification referencing rubric>", "score": <integer 0-100>}`;
  }

  /**
   * Extracts JSON from the critique response
   */
  private extractJSON(text: string): Record<string, unknown> | null {
    if (!text || text.trim().length === 0) {
      return null;
    }

    let jsonStr: string | null = null;

    // Try markdown code fence
    const markdownMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (markdownMatch) {
      jsonStr = markdownMatch[1];
    } else {
      // Try to find braces
      const firstBrace = text.indexOf('{');
      if (firstBrace !== -1) {
        let braceCount = 0;
        let end = -1;
        for (let i = firstBrace; i < text.length; i++) {
          if (text[i] === '{') {
            braceCount++;
          } else if (text[i] === '}') {
            braceCount--;
            if (braceCount === 0) {
              end = i;
              break;
            }
          }
        }
        if (end !== -1) {
          jsonStr = text.slice(firstBrace, end + 1);
        }
      }
    }

    if (!jsonStr) {
      return null;
    }

    try {
      return JSON.parse(jsonStr);
    } catch {
      return null;
    }
  }

  /**
   * Performs critique and refinement round
   */
  private async critiquesRationale(
    userQuery: string,
    rubric: string,
    client: OpenAI,
    responseByModel: Map<string, string>,
    evaluationAnswers: EvaluationScore[]
  ): Promise<CritiqueEntry[]> {
    if (!evaluationAnswers || evaluationAnswers.length === 0) {
      return [];
    }

    // Prepare critique queries for all evaluation entries
    const critiqueQueries: Array<{
      judgeModel: string;
      query: string;
    }> = [];

    for (const entry of evaluationAnswers) {
      const response = responseByModel.get(entry.evaluatedModel) || '';
      const reasoning = entry.reasoning || '';
      const score = entry.score || 0;

      const prompt = this.createSelfCritiquePrompt(userQuery, rubric, response, reasoning, score);
      critiqueQueries.push({
        judgeModel: entry.judgeModel,
        query: prompt,
      });
    }

    // Execute all critique queries in parallel
    const critiqueResults = await Promise.all(
      critiqueQueries.map(async (cq) => {
        try {
          const completion = await client.chat.completions.create({
            model: cq.judgeModel,
            messages: [{ role: 'user', content: cq.query }],
          });
          return {
            judgeModel: cq.judgeModel,
            response: completion.choices[0].message.content || '',
          };
        } catch (error) {
          console.error(`[RL4FEvaluator] Critique query failed for ${cq.judgeModel}:`, error);
          return {
            judgeModel: cq.judgeModel,
            response: '',
            error,
          };
        }
      })
    );

    // Build round data and update evaluation answers
    const roundData: CritiqueEntry[] = [];

    for (let i = 0; i < evaluationAnswers.length; i++) {
      const entry = evaluationAnswers[i];
      const critiqueResult = critiqueResults[i];
      const beforeReasoning = entry.reasoning || '';
      const beforeScore = entry.score || 0;
      const rawResponse = critiqueResult.response;

      let afterScore: number | null = null;
      let afterReasoning: string | null = null;

      if (rawResponse && !critiqueResult.error) {
        const revised = this.extractJSON(rawResponse);
        if (revised && typeof revised === 'object') {
          afterReasoning = revised.reasoning as string | null;
          const scoreValue = revised.score;
          if (typeof scoreValue === 'number' && scoreValue >= 0 && scoreValue <= 100) {
            afterScore = Math.round(scoreValue);
          }
        }
      }

      roundData.push({
        evaluatingModel: entry.judgeModel,
        evaluatedModel: entry.evaluatedModel,
        beforeScore,
        beforeReasoning,
        rawResponse,
        afterScore,
        afterReasoning,
      });

      // Update evaluation answer with revised scores if available
      if (afterReasoning !== null && afterScore !== null) {
        entry.score = afterScore;
        entry.reasoning = afterReasoning;
      }
    }

    return roundData;
  }

  /**
   * Override evaluate method to use RL4F evaluation with refinement loops
   * Called by the standard evaluation interface
   */
  async evaluate(
    responses: ModelResponse[],
    options: EvaluationOptions
  ): Promise<EvaluationResult> {
    const iterations = options.iterations || 1;
    return this.rl4fEvaluate(responses, { ...options, iterations });
  }

  /**
   * Main RL4F evaluation method with iterative refinement
   */
  async rl4fEvaluate(
    responses: ModelResponse[],
    options: EvaluationOptions & { iterations?: number }
  ): Promise<EvaluationResult> {
    const rubric = options.rubric || SELECTED_RUBRIC;
    const userQuery = options.userQuery;
    const iterations = options.iterations || 1;

    // Reset state
    this.critiqueHistory = [];
    this.userQueryAnswers = responses;

    // Initial n² evaluation using parent implementation
    const initialResult = await super.evaluate(responses, options);
    this.evaluationQueryAnswers = initialResult.scores;

    // Create map of responses for critique process
    const responseByModel = new Map<string, string>();
    responses.forEach((r) => {
      responseByModel.set(r.model, r.content);
    });

    // Perform refinement iterations
    for (let i = 0; i < iterations; i++) {
      const roundData = await this.critiquesRationale(
        userQuery,
        rubric,
        this.client, // Access client from parent class
        responseByModel,
        this.evaluationQueryAnswers
      );

      this.critiqueHistory.push(roundData);
      console.log(`[RL4FEvaluator] Completed refinement round ${i + 1}/${iterations}`);
    }

    // Return refined evaluation result
    return {
      winner: initialResult.winner,
      scores: this.evaluationQueryAnswers,
      meanScores: this.calculateMeanScoresFromEntries(
        this.evaluationQueryAnswers,
        responses.map((r) => r.model)
      ),
      tiedModels: initialResult.tiedModels,
    };
  }

  /**
   * Calculate mean scores from evaluation score entries
   */
  private calculateMeanScoresFromEntries(
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
   * Get critique history
   */
  getCritiqueHistory(): CritiqueEntry[][] {
    return this.critiqueHistory;
  }

  /**
   * Get user query answers
   */
  getUserQueryAnswers(): ModelResponse[] {
    return this.userQueryAnswers;
  }

  /**
   * Get evaluation query answers
   */
  getEvaluationQueryAnswers(): EvaluationScore[] {
    return this.evaluationQueryAnswers;
  }
}
