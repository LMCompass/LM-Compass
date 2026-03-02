/**
 * RL4F (Refinement Loop for Feedback) Evaluator
 * Extends PromptBasedEvaluator with self-critique and refinement capabilities
 */

import type { OpenAI } from 'openai';
import type { ModelResponse, EvaluationResult, EvaluationOptions, EvaluationScore } from './types';
import { PromptBasedEvaluator } from './prompt-based-evaluators';
import { readFileSync } from 'fs';
import { join } from 'path';

const SELECTED_RUBRIC_PATH = join(process.cwd(), 'app', '(app)', 'rubric', 'types', 'default.txt');

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
 * Represents a single iteration's evaluation results in RL4F
 */
export type RL4FIterationResult = {
  iterationNumber: number;
  winner: ModelResponse | null;
  meanScores: Record<string, number>;
  scores: EvaluationScore[];
};

/**
 * Extended evaluation result for RL4F that includes iteration history
 */
export type RL4FEvaluationResult = EvaluationResult & {
  iterationResults?: RL4FIterationResult[];
};

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
  private iterationResults: RL4FIterationResult[] = [];
  private onRefinementStart?: () => void;

  constructor(client: OpenAI, onRefinementStart?: () => void) {
    super(client);
    this.onRefinementStart = onRefinementStart;
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
  ): Promise<RL4FEvaluationResult> {
    const iterations = options.iterations || 1;
    return this.rl4fEvaluate(responses, { ...options, iterations });
  }

  /**
   * Main RL4F evaluation method with iterative refinement
   */
  async rl4fEvaluate(
    responses: ModelResponse[],
    options: EvaluationOptions & { iterations?: number }
  ): Promise<RL4FEvaluationResult> {
    const rubric = options.rubric || SELECTED_RUBRIC;
    const userQuery = options.userQuery;
    const iterations = options.iterations || 1;

    // Reset state
    this.critiqueHistory = [];
    this.userQueryAnswers = responses;
    this.iterationResults = [];

    // Initial n² evaluation using parent implementation
    const initialResult = await super.evaluate(responses, options);
    this.evaluationQueryAnswers = initialResult.scores;

    // Store initial iteration result - use consistent mean score calculation
    const modelNames = responses.map(r => r.model);
    const initialMeanScores = this.calculateMeanScoresFromEntries(
      initialResult.scores,
      modelNames
    );
    const initialWinner = this.determineWinner(initialResult.scores, modelNames);
    // Clone the scores to preserve the initial state (they will be mutated during refinement)
    const initialScoresClone = initialResult.scores.map(s => ({ ...s }));
    this.iterationResults.push({
      iterationNumber: 0,
      winner: initialWinner,
      meanScores: initialMeanScores,
      scores: initialScoresClone,
    });

    // Create map of responses for critique process
    const responseByModel = new Map<string, string>();
    responses.forEach((r) => {
      responseByModel.set(r.model, r.content);
    });

    // Call callback before starting refinement iterations if configured
    if (iterations > 0 && this.onRefinementStart) {
      this.onRefinementStart();
    }

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

      // Calculate and store iteration result
      const iterationWinner = this.determineWinner(this.evaluationQueryAnswers, modelNames);
      const iterationMeanScores = this.calculateMeanScoresFromEntries(
        this.evaluationQueryAnswers,
        modelNames
      );

      this.iterationResults.push({
        iterationNumber: i + 1,
        winner: iterationWinner,
        meanScores: iterationMeanScores,
        scores: this.evaluationQueryAnswers.map(s => ({ ...s })), // Clone the scores
      });
    }

    // Return refined evaluation result with iteration history
    const finalWinner = this.determineWinner(this.evaluationQueryAnswers, modelNames);
    const finalMeanScores = this.calculateMeanScoresFromEntries(
      this.evaluationQueryAnswers,
      modelNames
    );

    return {
      winner: finalWinner,
      scores: this.evaluationQueryAnswers,
      meanScores: finalMeanScores,
      tiedModels: this.calculateTiedModels(finalMeanScores),
      iterationResults: this.iterationResults,
    };
  }

  /**
   * Determine winner from evaluation scores
   */
  private determineWinner(scores: EvaluationScore[], modelNames: string[]): ModelResponse | null {
    const meanScores = this.calculateMeanScoresFromEntries(scores, modelNames);
    const maxScore = Math.max(...Object.values(meanScores));
    const winners = modelNames.filter(model => meanScores[model] === maxScore);
    
    if (winners.length === 0) return null;
    if (winners.length === 1) {
      const winnerModel = winners[0];
      return {
        model: winnerModel,
        content: '',
      };
    }
    return null; // Tie
  }

  /**
   * Calculate tied models from mean scores
   */
  private calculateTiedModels(meanScores: Record<string, number>): string[] {
    const maxScore = Math.max(...Object.values(meanScores));
    return Object.entries(meanScores)
      .filter(([_, score]) => score === maxScore)
      .map(([model]) => model);
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
   * Get iteration results for display in UI
   */
  getIterationResults(): RL4FIterationResult[] {
    return this.iterationResults;
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
