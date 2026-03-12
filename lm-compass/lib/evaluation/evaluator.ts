/**
 * Base Evaluator class - mirrors evaluator.py
 * Provides core functionality for querying models and extracting JSON from responses
 */

import type { OpenAI } from "openai";

/**
 * Model configuration for OpenRouter
 */
interface CandidateModel {
  name: string;
  openrouter: string;
}

/**
 * Query response containing model name and response content
 */
export interface ModelQueryResponse {
  model: string;
  response: string;
}

/**
 * Base Evaluator class
 */
export class Evaluator {
  protected client: OpenAI;
  protected modelNames: string[];
  protected candidateModels: CandidateModel[];

  constructor(client: OpenAI, ...modelNames: string[]) {
    this.client = client;
    this.modelNames = modelNames;

    // Candidate models configuration - mirrors evaluator.py
    this.candidateModels = [
      // PAID
      {
        name: "Anthropic: Claude Sonnet 4.5",
        openrouter: "anthropic/claude-sonnet-4.5",
      },
      { name: "OpenAI: GPT-4o", openrouter: "openai/gpt-4o" },
      { name: "OpenAI: GPT-4o Mini", openrouter: "openai/gpt-4o-mini" },
      // FREE
      {
        name: "StepFun: Step 3.5 Flash (free)",
        openrouter: "stepfun/step-3.5-flash:free",
      },
      {
        name: "TNG: DeepSeek R1T2 Chimera (free)",
        openrouter: "tngtech/deepseek-r1t2-chimera:free",
      },
      {
        name: "LiquidAI: LFM2.5-1.2B-Thinking (free)",
        openrouter: "liquid/lfm-2.5-1.2b-thinking:free",
      },
    ];
  }

  /**
   * Query a single model
   * @param modelName - The name of the model (from candidateModels "name" field)
   * @param query - The query to send to the model
   * @param role - The role of the message (default: "user")
   * @returns Object with model name and response content
   */
  async queryModel(
    modelName: string,
    query: string,
    role: "system" | "user" | "assistant" = "user",
  ): Promise<ModelQueryResponse> {
    const modelDict = this.candidateModels.find((m) => m.name === modelName);
    if (!modelDict) {
      return {
        model: modelName,
        response: `Error: Model '${modelName}' not found in candidate_models`,
      };
    }

    try {
      const response = await this.client.chat.completions.create({
        model: modelDict.openrouter,
        messages: [{ role, content: query }],
        temperature: 1,
      });
      const content = response.choices[0].message.content;
      return {
        model: modelName,
        response: content || "",
      };
    } catch (e) {
      return {
        model: modelName,
        response: String(e),
      };
    }
  }

  /**
   * Query multiple models asynchronously
   * @param modelNames - List of model names (from candidateModels "name" field)
   * @param queries - List of queries (one per model)
   * @param role - The role of the message (default: "user")
   * @returns Array of query responses
   */
  async queryModels(
    modelNames: string[],
    queries: string[],
    role: "system" | "user" | "assistant" = "user",
  ): Promise<ModelQueryResponse[]> {
    const promises = modelNames.map((modelName, i) =>
      this.queryModel(modelName, queries[i], role),
    );
    return Promise.all(promises);
  }

  /**
   * Extracts the first outermost JSON value (object or array) from arbitrary text
   * Mirrors the Python implementation
   * @param text - The text to extract JSON from
   * @returns Parsed JSON object/array, or null if not found
   */
  extractOutermostJson(text: string): unknown {
    if (!text) {
      return null;
    }

    // Strip markdown code fences (``` or ```json)
    let s = text.trim();
    if (s.startsWith("```")) {
      const lines = s.split("\n");
      s = lines
        .filter((line) => !line.trim().startsWith("```"))
        .join("\n")
        .trim();
    }

    let start: number | null = null;
    const stack: string[] = []; // holds '{' or '['
    let inString = false;
    let escape = false;

    const pairs: Record<string, string> = { "{": "}", "[": "]" };

    for (let i = 0; i < s.length; i++) {
      const ch = s[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (ch === "\\") {
        escape = true;
        continue;
      }

      if (ch === '"') {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (ch === "{" || ch === "[") {
        if (stack.length === 0) {
          start = i;
        }
        stack.push(ch);
      } else if (ch === "}" || ch === "]") {
        if (stack.length === 0) {
          continue;
        }
        const opener = stack[stack.length - 1];
        if (pairs[opener] === ch) {
          stack.pop();
          if (stack.length === 0 && start !== null) {
            const candidate = s.substring(start, i + 1);
            try {
              return JSON.parse(candidate);
            } catch {
              // JSON.parse may fail if the string contains invalid escape
              // sequences (e.g. LaTeX \( \) \[ \] produced by LLMs).
              // Replace any backslash NOT followed by a recognised JSON
              // escape character with a double-backslash and retry.
              try {
                const sanitized = candidate.replace(
                  /\\(?!["\\\/bfnrt]|u[0-9a-fA-F]{4})/g,
                  "\\\\",
                );
                return JSON.parse(sanitized);
              } catch {
                // Still not valid JSON — keep scanning for the next candidate
                start = null;
                continue;
              }
            }
          }
        } else {
          // mismatched bracket; reset search
          stack.length = 0;
          start = null;
        }
      }
    }

    return null;
  }
}
