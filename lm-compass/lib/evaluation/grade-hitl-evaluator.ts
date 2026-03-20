/**
 * GradeHITL evaluator - Human-in-the-loop grading that refines rubrics based on ambiguous cases.
 * Port of eval-notebooks/grade_hitl.py for use in chat (one example at a time).
 */

import type { OpenAI } from 'openai';
import { Evaluator, type ModelQueryResponse } from './evaluator';
import { createScoringQuery } from './prompt-based-evaluator';
import { readFileSync } from 'fs';
import { join } from 'path';

const SELECTED_RUBRIC_PATH = join(process.cwd(), 'app', '(app)', 'rubric', 'types', 'default_hitl.txt');

function loadDefaultRubric(): string {
  try {
    return readFileSync(SELECTED_RUBRIC_PATH, 'utf-8');
  } catch (err) {
    console.warn(`[GradeHITL] could not read default rubric at ${SELECTED_RUBRIC_PATH}:`, err);
    return '';
  }
}

export interface GradeResult {
  score: number;
  reasoning: string;
  raw_model_output: unknown;
}

export interface HITLExample {
  prompt: string;
  response: string;
}

export interface QuestionsAndDrafts {
  questions: string[];
  draft_rubric_changes?: string;
}

export interface HITLPhase1Result {
  graderResults: Record<string, GradeResult>;
  crossEvalResults: Record<string, Record<string, number>>;
  scoreRanges: Record<string, [number, number]>;
  hitlTriggered: boolean;
  questionsAndDrafts?: QuestionsAndDrafts;
  firstGraderName?: string;
  firstGraderResult?: GradeResult;
}

export interface HITLPhase2Result {
  updatedRubric: string;
  graderResults: Record<string, GradeResult>;
  crossEvalResults: Record<string, Record<string, number>>;
  /**
   * Optional metadata added by API layer when the updated rubric
   * is persisted for later reuse.
   */
  savedRubricId?: string;
  savedRubricTitle?: string;
  saveRubricError?: string;
}

/**
 * GradeHITL evaluator - extends Evaluator but uses client with model IDs directly
 * so it works with OpenRouter IDs from the chat (not just candidateModels names).
 */
export class GradeHITLEvaluator extends Evaluator {
  /**
   * Minimum number of models required for HITL evaluation to be meaningful.
   * With fewer than this, cross-evaluation of graders is too weak.
   */
  static readonly MIN_MODELS = 3;

  constructor(client: OpenAI, ...modelNames: string[]) {
    super(client, ...modelNames);
  }

  /**
   * Call LLM with the given model ID (OpenRouter ID from chat) and prompt.
   * Uses client directly so we support any model string the chat sends.
   */
  private async callLLM(modelName: string, prompt: string): Promise<ModelQueryResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        temperature: 1,
      });
      const content = response.choices[0].message.content;
      return { model: modelName, response: content || '' };
    } catch (e) {
      return { model: modelName, response: String(e) };
    }
  }

  private async callLLMParseJson(modelName: string, prompt: string): Promise<Record<string, unknown>> {
    const result = await this.callLLM(modelName, prompt);
    const parsed = this.extractOutermostJson(result.response);
    if (parsed === null || typeof parsed !== 'object') {
      throw new Error(`Model response did not contain valid JSON. Raw: ${result.response}`);
    }
    return parsed as Record<string, unknown>;
  }

  private gradingPrompt(example: HITLExample, rubric: string): string {
    // Reuse the same scoring prompt shape as the main prompt-based evaluator,
    // mirroring Python's use of `_n_sq_scoring_query`.
    return createScoringQuery(example.prompt, example.response, rubric);
  }

  private async gradeOneModel(example: HITLExample, rubric: string, modelName: string): Promise<GradeResult> {
    const prompt = this.gradingPrompt(example, rubric);
    const raw = await this.callLLMParseJson(modelName, prompt);
    const scoreRaw = raw.score;
    const score =
      typeof scoreRaw === 'number'
        ? scoreRaw
        : typeof scoreRaw === 'string'
          ? Number(scoreRaw)
          : NaN;
    const reasoning = typeof raw.reasoning === 'string' ? raw.reasoning : '';
    return {
      score: Number.isFinite(score) ? score : 0,
      reasoning,
      raw_model_output: raw,
    };
  }

  async gradeAllModels(example: HITLExample, rubric: string): Promise<Record<string, GradeResult>> {
    if (this.modelNames.length === 1) {
      const only = this.modelNames[0];
      return { [only]: await this.gradeOneModel(example, rubric, only) };
    }

    const results = await Promise.all(this.modelNames.map((m) => this.gradeOneModel(example, rubric, m)));
    return Object.fromEntries(this.modelNames.map((name, i) => [name, results[i]]));
  }

  private graderEvaluationPrompt(
    example: HITLExample,
    rubric: string,
    graderName: string,
    graderResult: GradeResult
  ): string {
    return `You are an expert evaluator assessing how well another model performed as a grader.

ORIGINAL QUESTION:
${example.prompt}

MODEL RESPONSE:
${example.response}

GRADING RUBRIC:
${rubric}

GRADER'S EVALUATION:
Grader Model: ${graderName}
Score Given: ${graderResult.score}
Reasoning: ${graderResult.reasoning}

Your task is to evaluate how well this grader performed. Consider:
- Did the grader correctly apply the rubric?
- Is the score appropriate given the rubric criteria?
- Is the reasoning reasonable?

Your output must be ONLY a JSON object with these exact fields:
- "score": an integer from 0 to 100 representing how well the grader performed
- "reasoning": a short explanation of your evaluation

Example format:
{"score": 85, "reasoning": "The grader correctly applied the rubric and assigned a reasonable score, though the reasoning could be more detailed."}

Do not include any text before or after the JSON object. Return ONLY the JSON.`;
  }

  async crossEvaluateGraders(
    example: HITLExample,
    rubric: string,
    graderResults: Record<string, GradeResult>
  ): Promise<Record<string, Record<string, number>>> {
    if (this.modelNames.length < 2) return {};

    const crossEvalResults: Record<string, Record<string, number>> = {};

    for (const graderName of Object.keys(graderResults)) {
      const graderResult = graderResults[graderName];
      const evaluatorNames = this.modelNames.filter((m) => m !== graderName);
      if (evaluatorNames.length === 0) continue;

      const prompts = evaluatorNames.map(() =>
        this.graderEvaluationPrompt(example, rubric, graderName, graderResult)
      );
      const responses = await Promise.all(
        evaluatorNames.map((modelName, i) => this.callLLM(modelName, prompts[i]))
      );

      crossEvalResults[graderName] = {};
      for (let i = 0; i < responses.length; i++) {
        const evaluatorName = responses[i].model;
        const parsed = this.extractOutermostJson(responses[i].response);
        if (parsed && typeof parsed === 'object' && 'score' in parsed) {
          const s = (parsed as { score?: unknown }).score;
          const n =
            typeof s === 'number'
              ? s
              : typeof s === 'string'
                ? Number(s)
                : NaN;
          if (Number.isFinite(n)) crossEvalResults[graderName][evaluatorName] = Math.round(n);
        }
      }
    }
    return crossEvalResults;
  }

  checkScoreRange(
    crossEvalResults: Record<string, Record<string, number>>,
    threshold: number
  ): [boolean, Record<string, [number, number]>] {
    const scoreRanges: Record<string, [number, number]> = {};
    let shouldTrigger = false;
    for (const [graderName, scores] of Object.entries(crossEvalResults)) {
      const values = Object.values(scores);
      if (values.length === 0) continue;
      const minScore = Math.min(...values);
      const maxScore = Math.max(...values);
      scoreRanges[graderName] = [minScore, maxScore];
      if (maxScore - minScore > threshold) shouldTrigger = true;
    }
    return [shouldTrigger, scoreRanges];
  }

  async generateQuestionsForHuman(
    example: HITLExample,
    rubric: string,
    grade: GradeResult
  ): Promise<QuestionsAndDrafts> {
    const systemPrompt = `You are helping an educator refine a grading rubric.
You MUST generate 1–3 standardized clarification questions for THIS specific ambiguous case.
Each question MUST be answerable with exactly one constrained token.

Rules:
- Output ONLY a JSON object (no extra text).
- "questions" must be an array of 1–3 strings.
- Each question string MUST be exactly one line and MUST follow this format:
  "<DIMENSION>: <question text> Answer with exactly one of: <OPTION1>, <OPTION2>, ..."

Allowed dimensions + options (use only these tokens):
- Correctness: HIGH, MID, LOW
- Clarity: CLEAR, UNCLEAR
- Uncertainty: CONFIDENT, UNCERTAIN

Question content rules:
- Do not ask vague "how/should" questions.
- The question text must be self-contained and refer to the ambiguity implied by:
  (rubric + example prompt/response + grader reasoning + grader score).
- Keep each question short and decision-focused.

Also produce:
- "draft_rubric_changes": a concise description of the exact rubric edge-case rule(s)
  to add, using the bucket meanings above.


RUBRIC:
${rubric}`;

    const userPrompt = `Example prompt:
${example.prompt}

Model response:
${example.response}

Grader reasoning:
${grade.reasoning}

Grader score: ${grade.score}

Task:
Generate 1–3 standardized clarification questions using the required format and allowed tokens.

Your output must be ONLY a JSON object with these exact fields:
- "questions": an array of 1–3 strings (each one line and matching the required pattern)
- "draft_rubric_changes": a string describing the specific rubric edge-case rule(s)
  implied by the bucket meanings

Example format (illustrative):
{
  "questions": [
    "Correctness: For this case, should the final score bucket be HIGH, MID, or LOW? Answer with exactly one of: HIGH, MID, LOW",
    "Clarity: Is the submission clearly understandable under the rubric? Answer with exactly one of: CLEAR, UNCLEAR"
  ],
  "draft_rubric_changes": "Add an explicit rule mapping this ambiguity to HIGH/MID/LOW and specify how uncertainty should be handled while keeping numeric scoring valid."
}

Do not include any text before or after the JSON object. Return ONLY the JSON.`;

    const modelName = this.modelNames[0];
    const raw = await this.callLLMParseJson(modelName, systemPrompt + '\n\n' + userPrompt);
    const questions = Array.isArray(raw.questions)
      ? (raw.questions as unknown[]).map(String)
      : [];
    const draft_rubric_changes =
      typeof raw.draft_rubric_changes === 'string' ? raw.draft_rubric_changes : '';
    return { questions, draft_rubric_changes };
  }

  async updateRubricFromHuman(
    rubric: string,
    example: HITLExample,
    grade: GradeResult,
    questionsAndDrafts: QuestionsAndDrafts,
    humanAnswers: Record<string, string>
  ): Promise<string> {
    const questions = questionsAndDrafts.questions ?? [];
    const qBlock = questions
      .map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${humanAnswers[String(i)] ?? 'TODO'}`)
      .join('\n');

    const systemPrompt = `You are a rubric designer.
Given the current rubric, an ambiguous example, the grader's behavior,
clarification questions, and the educator's answers, produce an updated
rubric description that would lead to correct grading of this and
similar cases. Keep it concise but explicit about edge cases.

CURRENT RUBRIC:
${rubric}

Important:
The educator’s answers provided in the "Clarifications" section are decision tokens (not free-form explanations).
Treat them deterministically. Convert them into explicit rubric edge-case rules and scoring/handling guidance.

Interpretation:
- Correctness: HIGH/MID/LOW
- Clarity: CLEAR/UNCLEAR
- Uncertainty: CONFIDENT/UNCERTAIN

If the educator indicates UNCERTAIN, the rubric may instruct graders to use 'PENDING EXPERT REVIEW' in the reasoning text,
while still outputting a valid numeric 0–100 score.

If an educator answer does not match the allowed tokens, make a best-effort interpretation and document the uncertainty in the rubric rule. `;

    const userPrompt = `Example prompt:
${example.prompt}

Model response:
${example.response}

Grader score: ${grade.score}
Grader reasoning:
${grade.reasoning}

Clarifications:
${qBlock}

Draft rubric changes from helper model:
${questionsAndDrafts.draft_rubric_changes ?? ''}

Your output must be ONLY a JSON object with this exact field:
- "rubric": a string containing the complete updated rubric text

Example format:
{"rubric": "Grade each response on two dimensions: 'correctness' (0-1) and 'clarity' (0-1). Partial credit applies when reasoning is correct but execution has minor errors..."}

Do not include any text before or after the JSON object. Return ONLY the JSON.`;

    const modelName = this.modelNames[0];
    const raw = await this.callLLMParseJson(modelName, systemPrompt + '\n\n' + userPrompt);
    const rubricText = typeof raw.rubric === 'string' ? raw.rubric : JSON.stringify(raw);
    return rubricText;
  }

  /**
   * Phase 1: Grade one example, cross-evaluate graders, check if HITL should trigger.
   * If triggered, generate questions for the human.
   */
  async phase1(
    example: HITLExample,
    rubric: string,
    scoreRangeThreshold: number = 20
  ): Promise<HITLPhase1Result> {
    if (this.modelNames.length < GradeHITLEvaluator.MIN_MODELS) {
      throw new Error(
        `Human-in-the-loop grading requires at least ${GradeHITLEvaluator.MIN_MODELS} models, but received ${this.modelNames.length}.`
      );
    }

    const graderResults = await this.gradeAllModels(example, rubric);
    const crossEvalResults = await this.crossEvaluateGraders(example, rubric, graderResults);
    const [hitlTriggered, scoreRanges] = this.checkScoreRange(crossEvalResults, scoreRangeThreshold);

    let questionsAndDrafts: QuestionsAndDrafts | undefined;
    let firstGraderName: string | undefined;
    let firstGraderResult: GradeResult | undefined;

    if (hitlTriggered) {
      firstGraderName = Object.keys(graderResults)[0] ?? this.modelNames[0];
      firstGraderResult = graderResults[firstGraderName];
      if (firstGraderResult) {
        questionsAndDrafts = await this.generateQuestionsForHuman(example, rubric, firstGraderResult);
      }
    }

    return {
      graderResults,
      crossEvalResults,
      scoreRanges,
      hitlTriggered,
      questionsAndDrafts,
      firstGraderName,
      firstGraderResult,
    };
  }

  /**
   * Phase 2: Apply human answers, update rubric, re-grade and re-cross-evaluate.
   */
  async phase2(
    example: HITLExample,
    rubric: string,
    firstGraderName: string,
    firstGraderResult: GradeResult,
    questionsAndDrafts: QuestionsAndDrafts,
    humanAnswers: Record<string, string>
  ): Promise<HITLPhase2Result> {
    const updatedRubric = await this.updateRubricFromHuman(
      rubric,
      example,
      firstGraderResult,
      questionsAndDrafts,
      humanAnswers
    );
    const graderResults = await this.gradeAllModels(example, updatedRubric);
    const crossEvalResults = await this.crossEvaluateGraders(example, updatedRubric, graderResults);
    return { updatedRubric, graderResults, crossEvalResults };
  }

  static getDefaultRubric(): string {
    return loadDefaultRubric();
  }
}
