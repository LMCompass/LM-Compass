/**
 * Type definitions for the evaluation system
 */

/**
 * Represents a response from an LLM model
 */
export type ModelResponse = {
  model: string;
  content: string;
  error?: string;
};

/**
 * Represents a single evaluation score where one model judges another
 */
export type EvaluationScore = {
  judgeModel: string;
  evaluatedModel: string;
  score: number | null;
  reasoning: string | null;
};

/**
 * Result of an evaluation containing the winner and scoring details
 */
export type EvaluationResult = {
  winner: ModelResponse | null;
  scores: EvaluationScore[];
  meanScores: Record<string, number>;
};

/**
 * Evaluation metadata for API response
 * Contains information about the evaluation process and results
 */
export type EvaluationMetadata = {
  winnerModel: string | null;
  scores: EvaluationScore[];
  meanScores: Record<string, number>;
  modelReasoning: Record<string, string[]>; // Aggregated reasoning for each model
};

/**
 * Configuration options for the evaluation process
 */
export type EvaluationOptions = {
  userQuery: string;
  rubric?: string;
};

