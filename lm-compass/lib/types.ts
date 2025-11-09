export type EvaluationMetadata = {
  winnerModel: string | null;
  scores: Array<{
    judgeModel: string;
    evaluatedModel: string;
    score: number | null;
    reasoning: string | null;
  }>;
  meanScores: Record<string, number>;
  modelReasoning: Record<string, string[]>;
};

export type Message = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  id: string;
  isStopped?: boolean;
  multiResults?: { model: string; content: string }[];
  evaluationMetadata?: EvaluationMetadata;
  userSelectedWinner?: string;
};
