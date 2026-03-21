import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { estimateExperimentCostLive } from "@/lib/cost";
import {
  ALLOWED_EXPERIMENT_EVAL_METHODS,
  MAX_EXPERIMENT_ITERATIONS,
  MIN_EXPERIMENT_ITERATIONS,
  isExperimentEvaluationMethod,
  normalizeSelectedModels,
  resolveExperimentIterations,
  validateSelectedModelsCount,
} from "@/lib/experiments";
import type { ExperimentCostEstimate, MappedRow } from "@/lib/types";

type EstimateExperimentRequest = {
  rows?: unknown;
  selectedModels?: unknown;
  evaluationMethod?: unknown;
  iterations?: unknown;
};

function toMappedRows(rows: unknown): MappedRow[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map((row) => {
    const rowObj = row as Record<string, unknown>;
    return {
      query: typeof rowObj.query === "string" ? rowObj.query : "",
      ground_truth: typeof rowObj.ground_truth === "string" ? rowObj.ground_truth : undefined,
    };
  });
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let payload: EstimateExperimentRequest;
    try {
      payload = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const mappedRows = toMappedRows(payload.rows);
    const selectedModels = normalizeSelectedModels(payload.selectedModels);
    const evaluationMethod = payload.evaluationMethod;

    if (!validateSelectedModelsCount(selectedModels)) {
      return NextResponse.json(
        { error: "Select between 2 and 4 models to estimate an experiment." },
        { status: 400 }
      );
    }

    if (!isExperimentEvaluationMethod(evaluationMethod)) {
      const allowedMethods = ALLOWED_EXPERIMENT_EVAL_METHODS.join(", ");
      return NextResponse.json(
        { error: `Unsupported evaluationMethod. Allowed values: ${allowedMethods}.` },
        { status: 400 }
      );
    }

    const { iterations, isValidForMethod } = resolveExperimentIterations(
      evaluationMethod,
      payload.iterations
    );
    if (!isValidForMethod) {
      return NextResponse.json(
        {
          error: `For rl4f evaluation, iterations must be an integer between ${MIN_EXPERIMENT_ITERATIONS} and ${MAX_EXPERIMENT_ITERATIONS}.`,
        },
        { status: 400 }
      );
    }

    const estimate: ExperimentCostEstimate = await estimateExperimentCostLive({
      rows: mappedRows,
      selectedModels,
      evaluationMethod,
      iterations,
      profile: "balanced",
    });

    return NextResponse.json(estimate, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to estimate experiment cost.",
      },
      { status: 500 }
    );
  }
}
