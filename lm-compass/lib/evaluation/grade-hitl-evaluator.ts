/**
 * GradeHITL evaluator - Human-in-the-loop grading that refines rubrics based on ambiguous cases.
 * Port of eval-notebooks/grade_hitl.py for use in chat (one example at a time).
 */

import type { OpenAI } from 'openai';
import { Evaluator, type ModelQueryResponse } from './evaluator';
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
  scores: Record<string, number>;
  justification: string;
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
}

/**
 * GradeHITL evaluator - extends Evaluator but uses client with model IDs directly
 * so it works with OpenRouter IDs from the chat (not just candidateModels names).
 */
export class GradeHITLEvaluator extends Evaluator {
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
    return `You are an expert grader.
Use the rubric below to grade the student's response.

RUBRIC:
${rubric}

Your output must be ONLY a JSON object with these exact fields:
- "scores": an object mapping dimension names to numeric scores
- "justification": a short natural language explanation (string)

Example format:
{"scores": {"correctness": 0.8, "clarity": 0.9}, "justification": "The response is mostly correct but lacks detail."}

Do not include any text before or after the JSON object. Return ONLY the JSON.

Question/Task:
${example.prompt}

Student Response:
${example.response}`;
  }

  private async gradeOneModel(example: HITLExample, rubric: string, modelName: string): Promise<GradeResult> {
    const prompt = this.gradingPrompt(example, rubric);
    const raw = await this.callLLMParseJson(modelName, prompt);
    const scores = (raw.scores as Record<string, number>) ?? {};
    const justification = typeof raw.justification === 'string' ? raw.justification : '';
    return {
      scores,
      justification,
      raw_model_output: raw,
    };
  }

  async gradeAllModels(example: HITLExample, rubric: string): Promise<Record<string, GradeResult>> {
    const results = await Promise.all(
      this.modelNames.map((m) => this.gradeOneModel(example, rubric, m))
    );
    const out: Record<string, GradeResult> = {};
    this.modelNames.forEach((name, i) => {
      out[name] = results[i];
    });
    return out;
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

STUDENT RESPONSE:
${example.response}

GRADING RUBRIC:
${rubric}

GRADER'S EVALUATION:
Grader Model: ${graderName}
Scores Given: ${JSON.stringify(graderResult.scores)}
Justification: ${graderResult.justification}

Your task is to evaluate how well this grader performed. Consider:
- Did the grader correctly apply the rubric?
- Are the scores appropriate given the rubric criteria?
- Is the justification reasonable?

Your output must be ONLY a JSON object with these exact fields:
- "score": an integer from 0 to 100 representing how well the grader performed
- "reasoning": a short explanation of your evaluation

Example format:
{"score": 85, "reasoning": "The grader correctly identified the answer as correct and applied the rubric appropriately, though the justification could be more detailed."}

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
        if (parsed && typeof parsed === 'object' && 'score' in parsed && typeof (parsed as { score: number }).score === 'number') {
          crossEvalResults[graderName][evaluatorName] = Math.round((parsed as { score: number }).score);
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
Given the rubric, an example, and the grader's decision, identify why the
case is ambiguous and propose 1–3 concise questions for the educator.
Also propose concrete rubric tweaks that would resolve similar cases
consistently in the future.

RUBRIC:
${rubric}`;

    const userPrompt = `Example prompt:
${example.prompt}

Student response:
${example.response}

Grader justification:
${grade.justification}

Grader scores: ${JSON.stringify(grade.scores)}

Your output must be ONLY a JSON object with these exact fields:
- "questions": a list of strings (1-3 concise questions for the educator)
- "draft_rubric_changes": a string describing proposed rubric tweaks

Example format:
{"questions": ["Should partially correct answers receive partial credit?", "Is mentioning specific examples required?"], "draft_rubric_changes": "Clarify that partial credit applies when reasoning is correct but execution has minor errors."}

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
${rubric}`;

    const userPrompt = `Example prompt:
${example.prompt}

Student response:
${example.response}

Grader scores: ${JSON.stringify(grade.scores)}
Justification:
${grade.justification}

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
    const graderResults = await this.gradeAllModels(example, rubric);
    const crossEvalResults = await this.crossEvaluateGraders(example, rubric, graderResults);
    const [hitlTriggered, scoreRanges] = this.checkScoreRange(crossEvalResults, scoreRangeThreshold);

    let questionsAndDrafts: QuestionsAndDrafts | undefined;
    let firstGraderName: string | undefined;
    let firstGraderResult: GradeResult | undefined;

    if (hitlTriggered) {
      firstGraderName = this.modelNames[0];
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
