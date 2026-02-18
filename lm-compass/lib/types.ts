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
  result: {
    [modelName: string]: {
      output: string;
      score?: number;
    };
  } | null;
}
