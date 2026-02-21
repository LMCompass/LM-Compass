/**
 * Consolidated Prompt-Based Evaluators
 * Includes both IEvaluationService-based and Python-compatible implementations
 */

import type { OpenAI } from 'openai';
import type { IEvaluationService } from './interfaces';
import type { ModelResponse, EvaluationResult, EvaluationOptions, EvaluationScore } from './types';
import { Evaluator, type ModelQueryResponse } from './evaluator';
import { readFileSync } from 'fs';
import { join } from 'path';

const SELECTED_RUBRIC_PATH = join(process.cwd(), 'app', 'rubric', 'types', 'default.txt');

function loadRubric(): string {
  try {
    return readFileSync(SELECTED_RUBRIC_PATH, 'utf-8');
  } catch (err) {
    console.warn(`[Evaluators] could not read default rubric at ${SELECTED_RUBRIC_PATH}:`, err);
    return '';
  }
}

const SELECTED_RUBRIC = loadRubric();

// ============================================================================
// INTERFACE-BASED EVALUATORS (IEvaluationService implementations)
// ============================================================================

/**
 * Creates a scoring query prompt for n² evaluation
 */
function createNSqScoringQuery(userQuery: string, candidateAnswer: string, rubric: string): string {
  return `You are an expert evaluator for a large language model comparison tool. Your role is to provide an objective, rubric-based score for the candidate's response to a user's query.

QUERY:
${userQuery}

CANDIDATE RESPONSE:
${candidateAnswer}

RUBRIC:
${rubric}

Instructions:

Evaluate the Candidate Response on all rubric dimensions individually, strictly applying the RUBRIC's defined score ranges and weightings.

Calculate the overall score as the weighted sum of all defined scores, without subjective adjustment or rounding beyond rubric guidance.

Your output must be ONLY a JSON object with:

1. "reasoning": "<One-sentence justification explicitly referencing rubric criteria and weights, including correctness importance>"

2. "score": <integer score from 0 to 100>

Use your judgment to apply rubric weightings accurately, and remember that Correctness & Accuracy has the highest impact on the overall score.`;
}

/**
 * Creates a scoring query prompt for n evaluation
 */
function createNScoringQuery(userQuery: string, candidateResponses: ModelResponse[], rubric: string): string {
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
 * Prompt-based evaluator (n² approach) - implements IEvaluationService
 * Used as the default evaluator in API routes
 */
export class PromptBasedEvaluator implements IEvaluationService {
  protected client: OpenAI;

  constructor(client: OpenAI) {
    this.client = client;
  }

  /**
   * Main evaluation method using n² approach
   */
  async evaluate(
    responses: ModelResponse[],
    options: EvaluationOptions
  ): Promise<EvaluationResult> {
    const validResponses = responses.filter((r) => !r.error && r.content.trim().length > 0);

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
    const { winner, tiedModels } = this.findWinner(validResponses, meanScores);

    return {
      winner,
      scores,
      meanScores,
      tiedModels,
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

    const responseMap = new Map<string, string>();
    responses.forEach((r) => {
      responseMap.set(r.model, r.content);
    });

    for (const judgeResponse of responses) {
      for (const candidateResponse of responses) {
        if (judgeResponse.model !== candidateResponse.model) {
          judgeModels.push(judgeResponse.model);
          evaluatedModels.push(candidateResponse.model);
          scoringQueries.push(
            createNSqScoringQuery(userQuery, candidateResponse.content, rubric)
          );
        }
      }
    }

    return { judgeModels, scoringQueries, evaluatedModels };
  }

  /**
   * Extracts the score and reasoning from an LLM response
   */
  private extractScoreAndReasoning(responseText: string): { score: number | null; reasoning: string | null } {
    if (!responseText || responseText.trim().length === 0) {
      return { score: null, reasoning: null };
    }

    let jsonStr: string | null = null;

    const markdownMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (markdownMatch) {
      jsonStr = markdownMatch[1];
    } else {
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

/**
 * N-Prompt-based evaluator (n approach) - implements IEvaluationService
 * Each model evaluates all other models in a single prompt
 */
export class NPromptBasedEvaluator implements IEvaluationService {
  private client: OpenAI;

  constructor(client: OpenAI) {
    this.client = client;
  }

  /**
   * Main evaluation method using n approach
   */
  async evaluate(
    responses: ModelResponse[],
    options: EvaluationOptions
  ): Promise<EvaluationResult> {
    const validResponses = responses.filter((r) => !r.error && r.content.trim().length > 0);

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

      const query = createNScoringQuery(userQuery, candidates, rubric);

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

    const markdownMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (markdownMatch) {
      jsonStr = markdownMatch[1];
    } else {
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

// ============================================================================
// PYTHON-COMPATIBLE EVALUATORS
// ============================================================================

/**
 * Evaluation result with model, scores, and reasoning (Python-compatible shape)
 */
export interface EvaluationAnswer {
  evaluating_model: string;
  evaluated_model: string;
  score: number;
  reasoning: string;
}

/**
 * Score table mapping judge models to evaluated models
 */
export type ScoreTable = Record<string, Record<string, number | null>>;

/**
 * Prompt-Based Evaluator (Python-Compatible) - extends Evaluator
 * Provides Python-compatible API with nSqEvaluate and nEvaluate methods
 */
export class PromptBasedEvaluatorPy extends Evaluator {
  public userQueryAnswers: ModelQueryResponse[] | null = null;
  public evaluationQueryAnswers: EvaluationAnswer[] | null = null;

  constructor(client: OpenAI, ...modelNames: string[]) {
    super(client, ...modelNames);
  }

  /**
   * Creates the n² scoring query prompt
   */
  private nSqScoringQuery(userQuery: string, rubric: string, answer: string): string {
    return `You are an expert evaluator for a large language model comparison tool. Your role is to provide an objective, rubric-based score for the candidate's response to a user's query.

QUERY:
${userQuery}

CANDIDATE RESPONSE:
${answer}

RUBRIC:
${rubric}

Instructions:

Evaluate the Candidate Response on all rubric dimensions individually, strictly applying the rubric's defined score ranges and weightings—for example, Correctness & Accuracy is out of 25 points, Completeness 20 points, etc.

If the Candidate Response contains any factual inaccuracies, assign the Correctness & Accuracy score corresponding to those errors as explicitly defined in the rubric, which could be as low as 0-4 out of 25 for fundamental factual errors. Do not inflate this score due to other qualities.

Calculate the overall score as the weighted sum of all dimension scores, without subjective adjustment or rounding beyond rubric guidance.

Your output must be ONLY a JSON object with:

1. "reasoning": "<One-sentence justification explicitly referencing rubric criteria and weights, including correctness importance>",

2. "score": <integer score from 0 to 100>

Use your judgment to apply rubric weightings accurately, and remember that Correctness & Accuracy has the highest impact on the overall score.`;
  }

  /**
   * Formats raw API responses into evaluation answers for n² method
   * @param rawData - Raw list of responses from querying OpenRouter
   * @returns List of formatted evaluation answers
   */
  private nSqFormatJson(rawData: ModelQueryResponse[]): EvaluationAnswer[] {
    const formattedJson: EvaluationAnswer[] = [];
    let i = 0;

    for (const model1 of this.modelNames) {
      for (const model2 of this.modelNames) {
        if (model1 !== model2) {
          // Ensure we have data at this index
          if (i >= rawData.length) break;

          const evaluatingModel = rawData[i].model;
          const extractedJson = this.extractOutermostJson(rawData[i].response);
          i++;

          if (!extractedJson || typeof extractedJson !== 'object') continue;

          // Validate required fields
          if (!('score' in extractedJson)) continue;
          if (!('reasoning' in extractedJson)) continue;

          const entry: EvaluationAnswer = {
            evaluated_model: model2,
            evaluating_model: evaluatingModel,
            score: parseInt(String(extractedJson.score)),
            reasoning: String(extractedJson.reasoning),
          };

          formattedJson.push(entry);
        }
      }
    }

    return formattedJson;
  }

  /**
   * Performs n² evaluation where each model evaluates each other model independently
   * Stores results in userQueryAnswers and evaluationQueryAnswers
   * @param userQuery - What the user is asking the models
   * @param rubric - What the models should grade the responses based on
   */
  async nSqEvaluate(userQuery: string, rubric: string): Promise<void> {
    // Query all models with the user query
    const queries = this.modelNames.map(() => userQuery);
    this.userQueryAnswers = await this.queryModels(this.modelNames, queries);
    console.log('Got user query answers');

    // Build evaluation queries for n² method
    const newModelsToUse: string[] = [];
    const newQueriesToUse: string[] = [];

    for (const model1 of this.modelNames) {
      for (const item of this.userQueryAnswers) {
        const model2 = item.model;
        const answer = item.response;

        if (model1 !== model2) {
          newModelsToUse.push(model1);
          newQueriesToUse.push(this.nSqScoringQuery(userQuery, rubric, answer));
        }
      }
    }

    // Query models for evaluation
    const evaluationResults = await this.queryModels(newModelsToUse, newQueriesToUse);
    this.evaluationQueryAnswers = this.nSqFormatJson(evaluationResults);
    console.log('Got scoring results');
  }

  /**
   * Creates the n scoring query prompt
   * Used for judging in the n method of prompt based evaluation
   * Note: userQueryAnswers must be populated before using this method
   * @param userQuery - The original user query
   * @param rubric - The rubric for evaluating the answer
   * @param model - The model doing the evaluating
   * @returns The formatted prompt string
   */
  private nScoringQuery(userQuery: string, rubric: string, model: string): string {
    if (!this.modelNames.includes(model)) {
      throw new Error(`Model ${model} is not in the configured model names: ${this.modelNames.join(', ')}`);
    }

    if (!this.userQueryAnswers) {
      throw new Error('userQueryAnswers must be populated before using nScoringQuery');
    }

    let answers = '';
    for (const otherModel of this.userQueryAnswers) {
      if (model !== otherModel.model) {
        answers += `${otherModel.model} RESPONSE:\n${otherModel.response}\n\n`;
      }
    }

    return `You are an expert evaluator for a large language model comparison tool. Your role is to provide objective, rubric-based scores for the candidate's responses to a user's query.

QUERY:
${userQuery}

${answers}

RUBRIC:
${rubric}

Instructions:

Evaluate all the Candidates Responses on all rubric dimensions individually, strictly applying the rubric's defined score ranges and weightings—for example, Correctness & Accuracy is out of 25 points, Completeness 20 points, etc.

If any of the Candidates Responses contain any factual inaccuracies, assign the Correctness & Accuracy score corresponding to those errors as explicitly defined in the rubric, which could be as low as 0-4 out of 25 for fundamental factual errors. Do not inflate this score due to other qualities.

Calculate the overall score as the weighted sum of all dimension scores for each Candidate Response, without subjective adjustment or rounding beyond rubric guidance.

Your output must be ONLY a JSON list with JSON objects for each Candidate Response containing:

1. "evaluated_model": "<full and exact name of the model as provided in this prompt>"

2. "reasoning": "<One-sentence justification explicitly referencing rubric criteria and weights, including correctness importance>",

3. "score": <integer score from 0 to 100>

E.g. [{"evaluated_model": "<model_name>", "reasoning": "<One-sentence justification explicitly referencing rubric criteria and weights, including correctness importance>", "score": <integer score from 0 to 100>}, ...]

Here are the model names for reference: ${this.modelNames.join(', ')}

Use your judgment to apply rubric weightings accurately, and remember that Correctness & Accuracy has the highest impact on the overall score.`;
  }

  /**
   * Formats raw API responses into evaluation answers for n method
   * @param rawData - Raw list of responses from querying OpenRouter
   * @returns List of formatted evaluation answers
   */
  private nFormatJson(rawData: ModelQueryResponse[]): EvaluationAnswer[] {
    const formattedJson: EvaluationAnswer[] = [];

    for (const item1 of rawData) {
      const extractedJson = this.extractOutermostJson(item1.response);
      if (!extractedJson) continue;

      // Handle array of evaluation results
      if (!Array.isArray(extractedJson)) continue;

      for (const item2 of extractedJson) {
        if (typeof item2 !== 'object' || item2 === null) continue;
        // Validate required fields
        if (!('evaluated_model' in item2)) continue;
        if (!('score' in item2)) continue;
        if (!('reasoning' in item2)) continue;

        const entry: EvaluationAnswer = {
          evaluating_model: item1.model,
          evaluated_model: item2.evaluated_model,
          score: parseInt(String(item2.score)),
          reasoning: item2.reasoning,
        };

        formattedJson.push(entry);
      }
    }

    return formattedJson;
  }

  /**
   * Performs n evaluation where each model evaluates all other models in a single prompt
   * Stores results in userQueryAnswers and evaluationQueryAnswers
   * @param userQuery - What the user is asking the models
   * @param rubric - What the models should grade the responses based on
   */
  async nEvaluate(userQuery: string, rubric: string): Promise<void> {
    // Query all models with the user query
    const queries = this.modelNames.map(() => userQuery);
    this.userQueryAnswers = await this.queryModels(this.modelNames, queries);
    console.log('Got user query answers');

    // Build evaluation queries for n method
    const newQueriesToUse: string[] = [];
    for (const model of this.modelNames) {
      newQueriesToUse.push(this.nScoringQuery(userQuery, rubric, model));
    }

    // Query models for evaluation
    const evaluationResults = await this.queryModels(this.modelNames, newQueriesToUse);
    this.evaluationQueryAnswers = this.nFormatJson(evaluationResults);
    console.log('Got scoring results');
  }

  /**
   * Generates a score table from the stored evaluation answers
   * Returns a nested object with judge models as keys and evaluated model scores as values
   * @returns Score table mapping judge models to evaluated model scores
   */
  scoreTable(): ScoreTable {
    const table: ScoreTable = {};

    // Initialize table with all model combinations
    for (const judgeModel of this.modelNames) {
      table[judgeModel] = {};
      for (const evaluatedModel of this.modelNames) {
        table[judgeModel][evaluatedModel] = null;
      }
    }

    // Populate with evaluation answers
    if (this.evaluationQueryAnswers) {
      for (const item of this.evaluationQueryAnswers) {
        if (table[item.evaluating_model]) {
          table[item.evaluating_model][item.evaluated_model] = item.score;
        }
      }
    }

    return table;
  }
}
