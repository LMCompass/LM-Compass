import type { EvaluationMetadata } from './evaluation/types';

export type Message = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  id: string;
  isStopped?: boolean;
  multiResults?: { model: string; content: string }[];
  evaluationMetadata?: EvaluationMetadata;
  userSelectedWinner?: string;
  sequenceOrder?: number;
};

export enum ExperimentStatus {
  DRAFT = 'draft',
  RUNNING = 'running',
  COMPLETED = 'completed',
  ERROR = 'error'
}

export enum ExperimentItemStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  ERROR = 'error'
}

export interface Experiment {
  id: string;
  user_id: string | null;
  title: string | null;
  status: ExperimentStatus | null;
  created_at: string | null;
  configuration: {
    selected_models: string[];
    rubric_id: string;
    eval_method: string;
  } | null;
}

export interface ExperimentItem {
  id: string;
  experiment_id: string | null;
  input_query: string | null;
  expected_output: string | null;
  status: ExperimentItemStatus | null;
  error_message?: string | null;
  result: {
    [modelName: string]: {
      output: string;
      score?: number;
    };
  } | null;
}

export type ExperimentModelResultStatus = 'success' | 'error';

export interface ExperimentItemModelResult {
  output: string;
  score?: number;
  status?: ExperimentModelResultStatus;
}

export interface ExperimentEvaluationScore {
  judgeModel: string;
  evaluatedModel: string;
  score: number | null;
  reasoning: string | null;
}

export interface ExperimentEvaluationSummary {
  winnerModel: string | null;
  meanScores: Record<string, number>;
  scores: ExperimentEvaluationScore[];
}

export interface ExperimentItemResultPayload {
  evaluation_summary?: ExperimentEvaluationSummary;
  [modelName: string]:
    | ExperimentItemModelResult
    | ExperimentEvaluationSummary
    | undefined;
}

export interface MappedRow {
  query: string;
  ground_truth?: string;
}

export interface ExperimentCostEstimate {
  avgChars: number;
  estTokensPerPrompt: number;
  multiplier: number;
  totalTokens: number;
  estimatedUsd: number;
  validRows: number;
  skippedRows: number;
}

export interface StartExperimentInput {
  title?: string;
  rows: MappedRow[];
}

export interface StartExperimentResult {
  experimentId: string;
  insertedRows: number;
  skippedRows: number;
  status: ExperimentStatus.RUNNING;
  estimatedUsd: number;
}
