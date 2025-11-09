/**
 * Service interface for evaluation implementations
 * Allows for pluggable evaluation strategies
 */

import type { ModelResponse, EvaluationResult, EvaluationOptions } from './types';

/**
 * Interface that all evaluation services must implement
 */
export interface IEvaluationService {
  /**
   * Evaluate multiple model responses and return the best one
   * @param responses Array of model responses to evaluate
   * @param options Configuration options for evaluation
   * @returns Promise resolving to the evaluation result with the winner
   */
  evaluate(
    responses: ModelResponse[],
    options: EvaluationOptions
  ): Promise<EvaluationResult>;
}

