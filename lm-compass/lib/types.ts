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

export interface Experiment {
  id: string;
  user_id: string | null;
  title: string | null;
  status: number | null;
  created_at: string | null;
  configuration: {
    selected_models: string[];
    rubric_id: string;
  } | null;
}

export interface ExperimentItem {
  id: string;
  experiment_id: string | null;
  input_query: string | null;
  expected_output: string | null;
  status: number | null;
  result: {
    [modelName: string]: {
      output: string;
      score?: number;
    };
  } | null;
}
