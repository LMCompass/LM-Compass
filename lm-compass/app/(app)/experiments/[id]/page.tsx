"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { ArrowLeft, ChevronDown, Bot, ClipboardList, Info, Zap, Download } from "lucide-react";
import type { ExperimentReportInput } from "@/lib/export-report";
import {
  BarChart,
  Bar,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { useSupabaseClient } from "@/utils/supabase/client";
import {
  ExperimentItemStatus,
  ExperimentStatus,
  type Experiment,
  type ExperimentEvaluationSummary,
  type ExperimentItemModelResult,
  type ExperimentItemResultPayload,
} from "@/lib/types";
import {
  SidebarInset,
  SidebarTrigger,
} from "@/components/sidebar/sidebar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Markdown } from "@/components/ui/markdown";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip as ShadcnTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type ExperimentItemRow = {
  id: string;
  input_query: string | null;
  expected_output: string | null;
  status: ExperimentItemStatus | null;
  result: unknown;
  error_message?: string | null;
};

type ModelEntry = {
  model: string;
  data: ExperimentItemModelResult;
};

type KendallRow = {
  judgeA: string;
  judgeB: string;
  tauB: number;
  comparedPairs: number;
  queryCount: number;
};

const POLL_INTERVAL_MS = 2000;

const CHART_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#84cc16",
];

const METRIC_EXPLANATIONS: Record<string, string> = {
  "Average Score": "Average score across all completed queries for this model.",
  "Median Score": "Middle score across completed queries, so extreme highs or lows affect it less.",
  "Win Rate": "Percentage of completed queries where this model had the highest score.",
  "Std Deviation": "How spread out the model's scores are. Lower means more consistent performance.",
  "Avg Time to Execute": "Average model response time across completed queries.",
};

function calculateMedian(values: number[]) {
  if (values.length === 0) return 0;
  const sortedValues = [...values].sort((a, b) => a - b);
  const middleIndex = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 === 0) {
    return (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2;
  }
  return sortedValues[middleIndex];
}

function calculateStandardDeviation(values: number[]) {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) /
    values.length;
  return Math.sqrt(variance);
}

function formatScore(value: number) {
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(1);
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function formatDurationMs(value: number) {
  if (!Number.isFinite(value) || value < 0) return "—";
  if (value < 1000) {
    return `${Math.round(value)}ms`;
  }
  const totalSeconds = value / 1000;
  if (totalSeconds <= 60) {
    return `${totalSeconds.toFixed(2)}s`;
  }
  const totalSecs = Math.round(totalSeconds);
  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const seconds = totalSecs % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(" ");
}

function formatModelLabel(model: string) {
  const shortName = model.split("/").pop() || model;
  return shortName.length > 22 ? `${shortName.slice(0, 22)}…` : shortName;
}

function compareScores(first: number, second: number) {
  if (first > second) return 1;
  if (first < second) return -1;
  return 0;
}

function formatTau(value: number) {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(3);
}

function getTauLabel(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 0.8) return "Very strong";
  if (absolute >= 0.6) return "Strong";
  if (absolute >= 0.4) return "Moderate";
  if (absolute >= 0.2) return "Weak";
  return "Very weak";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEvaluationSummary(value: unknown): ExperimentEvaluationSummary | null {
  if (!isRecord(value)) return null;
  const winnerModel =
    typeof value.winnerModel === "string" || value.winnerModel === null
      ? value.winnerModel
      : null;

  const meanScores = isRecord(value.meanScores)
    ? Object.fromEntries(
      Object.entries(value.meanScores)
        .filter(([, score]) => typeof score === "number")
        .map(([model, score]) => [model, score as number])
    )
    : {};

  const scores = Array.isArray(value.scores)
    ? value.scores
      .map((score) => {
        if (!isRecord(score)) return null;
        const judgeModel =
          typeof score.judgeModel === "string" ? score.judgeModel : null;
        const evaluatedModel =
          typeof score.evaluatedModel === "string" ? score.evaluatedModel : null;
        const numericScore =
          typeof score.score === "number" || score.score === null
            ? score.score
            : null;
        const reasoning =
          typeof score.reasoning === "string" || score.reasoning === null
            ? score.reasoning
            : null;

        if (!judgeModel || !evaluatedModel) return null;
        return {
          judgeModel,
          evaluatedModel,
          score: numericScore,
          reasoning,
        };
      })
      .filter((score): score is NonNullable<typeof score> => score !== null)
    : [];

  return {
    winnerModel,
    meanScores,
    scores,
  };
}

function parseResultPayload(raw: unknown): {
  payload: ExperimentItemResultPayload;
  summary: ExperimentEvaluationSummary | null;
  modelEntries: ModelEntry[];
} {
  if (!isRecord(raw)) {
    return { payload: {}, summary: null, modelEntries: [] };
  }

  const payload: ExperimentItemResultPayload = {};
  const summary = parseEvaluationSummary(raw.evaluation_summary);
  if (summary) {
    payload.evaluation_summary = summary;
  }

  const modelEntries: ModelEntry[] = [];
  Object.entries(raw).forEach(([key, value]) => {
    if (key === "evaluation_summary" || !isRecord(value)) return;

    const output = typeof value.output === "string" ? value.output : "";
    const score = typeof value.score === "number" ? value.score : undefined;
    const latencyMs = typeof value.latencyMs === "number" ? value.latencyMs : undefined;
    const status = value.status === "error" ? "error" : value.status === "success" ? "success" : undefined;

    const modelData: ExperimentItemModelResult = { output, score, latencyMs, status };
    payload[key] = modelData;
    modelEntries.push({ model: key, data: modelData });
  });

  return { payload, summary, modelEntries };
}

function statusBadgeClass(status: string | null | undefined) {
  switch (status) {
    case ExperimentStatus.RUNNING:
    case ExperimentItemStatus.RUNNING:
      return "bg-blue-300 !text-blue-950 ring-1 ring-blue-400/70 shadow-sm dark:bg-blue-300/25 dark:!text-blue-50 dark:ring-blue-300/25";
    case ExperimentStatus.COMPLETED:
    case ExperimentItemStatus.COMPLETED:
      return "bg-emerald-300 !text-emerald-950 ring-1 ring-emerald-400/70 shadow-sm dark:bg-emerald-300/25 dark:!text-emerald-50 dark:ring-emerald-300/25";
    case ExperimentStatus.ERROR:
    case ExperimentItemStatus.ERROR:
      return "bg-rose-300 !text-rose-950 ring-1 ring-rose-400/70 shadow-sm dark:bg-rose-300/25 dark:!text-rose-50 dark:ring-rose-300/25";
    case ExperimentStatus.DRAFT:
    case ExperimentItemStatus.PENDING:
      return "bg-amber-300 !text-amber-950 ring-1 ring-amber-400/70 shadow-sm dark:bg-amber-300/25 dark:!text-amber-50 dark:ring-amber-300/25";
    default:
      return "bg-foreground/10 !text-foreground ring-1 ring-border/60";
  }
}

function formatStatusLabel(status: string | null | undefined) {
  if (!status) return "Unknown";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function shouldContinuePolling(
  experiment: Experiment | null,
  items: ExperimentItemRow[]
) {
  const hasActiveItems = items.some(
    (item) =>
      item.status === ExperimentItemStatus.PENDING ||
      item.status === ExperimentItemStatus.RUNNING
  );

  if (!experiment) return true;

  const isTerminalExperiment =
    experiment.status === ExperimentStatus.COMPLETED ||
    experiment.status === ExperimentStatus.ERROR;

  return !(isTerminalExperiment && !hasActiveItems);
}

export default function ExperimentDetailPage() {
  const params = useParams<{ id?: string | string[] }>();
  const supabase = useSupabaseClient();
  const { user, isLoaded: userLoaded } = useUser();

  const experimentId = useMemo(() => {
    const value = params?.id;
    if (typeof value === "string") return value;
    if (Array.isArray(value) && value.length > 0) return value[0];
    return "";
  }, [params]);

  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [items, setItems] = useState<ExperimentItemRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAccessBlocked, setIsAccessBlocked] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ExperimentItemRow | null>(null);
  const [rubricTitle, setRubricTitle] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRefreshingRef = useRef(false);
  const latestExperimentRef = useRef<Experiment | null>(null);

  useEffect(() => {
    latestExperimentRef.current = experiment;
  }, [experiment]);

  useEffect(() => {
    const config = experiment?.configuration;
    if (!config?.rubric_id) return;

    if (config.rubric_id === "default") {
      setRubricTitle("Default Rubric");
      return;
    }

    const fetchRubric = async () => {
      try {
        const { data } = await supabase
          .from("rubrics")
          .select("rubric_title")
          .eq("id", config.rubric_id)
          .maybeSingle();

        if (data?.rubric_title) {
          setRubricTitle(data.rubric_title);
        } else {
          setRubricTitle(config.rubric_id);
        }
      } catch {
      }
    };

    fetchRubric();
  }, [experiment?.configuration, supabase]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const fetchExperiment = useCallback(async (id: string, userId: string) => {
    const { data, error: fetchError } = await supabase
      .from("experiments")
      .select("id, title, status, created_at, start_time, end_time, configuration")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (fetchError) {
      throw fetchError;
    }

    return (data as Experiment | null) ?? null;
  }, [supabase]);

  const fetchItems = useCallback(async (id: string) => {
    const response = await supabase
      .from("experiments_items")
      .select("id, input_query, expected_output, status, result")
      .eq("experiment_id", id)
      .order("id", { ascending: true });

    if (response.error) {
      throw response.error;
    }

    return (response.data || []) as ExperimentItemRow[];
  }, [supabase]);

  const refreshData = useCallback(
    async (showLoading = false) => {
      if (!userLoaded) {
        return true;
      }

      if (!user?.id) {
        setError("Please sign in to view this experiment.");
        setIsAccessBlocked(true);
        setIsLoading(false);
        stopPolling();
        return false;
      }

      if (!experimentId) {
        setError("Invalid experiment ID.");
        setIsAccessBlocked(true);
        setIsLoading(false);
        stopPolling();
        return false;
      }

      if (isRefreshingRef.current) {
        return true;
      }

      isRefreshingRef.current = true;
      if (showLoading) setIsLoading(true);

      try {
        const nextExperiment = await fetchExperiment(experimentId, user.id);

        if (!nextExperiment) {
          setIsAccessBlocked(true);
          setError("Experiment not found or you do not have access.");
          setExperiment(null);
          setItems([]);
          stopPolling();
          return false;
        }

        const nextItems = await fetchItems(experimentId);

        // Keep previously loaded experiment metadata if header query is transiently empty.
        setExperiment(nextExperiment);
        setItems(nextItems);
        setError(null);
        setIsAccessBlocked(false);

        const shouldKeepPolling = shouldContinuePolling(
          nextExperiment ?? latestExperimentRef.current,
          nextItems
        );
        if (!shouldKeepPolling) {
          stopPolling();
        }

        return shouldKeepPolling;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load experiment data.";
        setError(message);
        return true;
      } finally {
        if (showLoading) setIsLoading(false);
        isRefreshingRef.current = false;
      }
    },
    [experimentId, fetchExperiment, fetchItems, stopPolling, user?.id, userLoaded]
  );

  useEffect(() => {
    let disposed = false;

    const start = async () => {
      const shouldPoll = await refreshData(true);
      if (disposed || !shouldPoll) return;

      intervalRef.current = setInterval(() => {
        refreshData();
      }, POLL_INTERVAL_MS);
    };

    start();

    return () => {
      disposed = true;
      stopPolling();
    };
  }, [refreshData, stopPolling]);

  const progress = useMemo(() => {
    const total = items.length;
    const done = items.filter(
      (item) =>
        item.status === ExperimentItemStatus.COMPLETED ||
        item.status === ExperimentItemStatus.ERROR
    ).length;
    const running = items.filter(
      (item) => item.status === ExperimentItemStatus.RUNNING
    ).length;
    const pending = items.filter(
      (item) => item.status === ExperimentItemStatus.PENDING
    ).length;
    const progressPct = total > 0 ? (done / total) * 100 : 0;

    return { total, done, running, pending, progressPct };
  }, [items]);

  const selectedItemDetails = useMemo(() => {
    if (!selectedItem) return null;
    return parseResultPayload(selectedItem.result);
  }, [selectedItem]);

  const tableRows = useMemo(() => {
    return items.map((item) => {
      const { summary } = parseResultPayload(item.result);
      const winner = summary?.winnerModel ?? null;
      const score = winner ? summary?.meanScores?.[winner] : undefined;

      return {
        item,
        winner: winner || "—",
        score: typeof score === "number" ? score.toFixed(1) : "—",
      };
    });
  }, [items]);

  const isExperimentDone = experiment?.status === ExperimentStatus.COMPLETED;

  const totalRunMsAfterCompletion = useMemo(() => {
    if (!isExperimentDone) return null;
    if (!experiment?.start_time || !experiment?.end_time) return null;

    const startMs = Date.parse(experiment.start_time);
    const endMs = Date.parse(experiment.end_time);

    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;

    const delta = endMs - startMs;
    return delta >= 0 ? delta : null;
  }, [experiment?.start_time, experiment?.end_time, isExperimentDone]);

  const chartData = useMemo(() => {
    const scoreSums: Record<string, number> = {};
    const scoreCounts: Record<string, number> = {};
    const winCounts: Record<string, number> = {};

    for (const item of items) {
      if (item.status !== ExperimentItemStatus.COMPLETED) continue;
      const { summary } = parseResultPayload(item.result);
      if (!summary) continue;

      if (summary.meanScores) {
        for (const [model, score] of Object.entries(summary.meanScores)) {
          if (typeof score !== "number") continue;
          scoreSums[model] = (scoreSums[model] ?? 0) + score;
          scoreCounts[model] = (scoreCounts[model] ?? 0) + 1;
        }
      }

      if (summary.winnerModel) {
        winCounts[summary.winnerModel] =
          (winCounts[summary.winnerModel] ?? 0) + 1;
      }
    }

    const configuredModels = experiment?.configuration?.selected_models ?? [];
    const discoveredModels = Array.from(
      new Set([...Object.keys(scoreSums), ...Object.keys(winCounts)])
    );
    const orderedModels = configuredModels.length
      ? [
        ...configuredModels.filter((model) => discoveredModels.includes(model)),
        ...discoveredModels.filter((model) => !configuredModels.includes(model)),
      ]
      : discoveredModels;

    const modelColors = Object.fromEntries(
      orderedModels.map((model, index) => [
        model,
        CHART_COLORS[index % CHART_COLORS.length],
      ])
    ) as Record<string, string>;

    const avgScores = Object.entries(scoreSums).map(([model, sum]) => ({
      model,
      avgScore: +(sum / scoreCounts[model]).toFixed(2),
      fill: modelColors[model] ?? CHART_COLORS[0],
    }));
    avgScores.sort((a, b) => b.avgScore - a.avgScore);

    const wins = Object.entries(winCounts).map(([model, count]) => ({
      name: model,
      value: count,
      fill: modelColors[model] ?? CHART_COLORS[0],
    }));
    wins.sort((a, b) => b.value - a.value);

    return { avgScores, wins };
  }, [experiment?.configuration?.selected_models, items]);

  const barChartDomain = useMemo<[number, number]>(() => {
    if (chartData.avgScores.length < 2) {
      return [0, 100];
    }

    const values = chartData.avgScores.map((entry) => entry.avgScore);
    const minScore = Math.min(...values);
    const maxScore = Math.max(...values);

    if (minScore === maxScore) {
      const lower = Math.max(0, minScore - 1);
      const upper = Math.min(100, maxScore + 1);
      return [lower, upper];
    }

    const spread = maxScore - minScore;
    const padding = Math.max(0.4, spread * 0.35);
    let lower = Math.max(0, Math.floor((minScore - padding) * 10) / 10);
    let upper = Math.min(100, Math.ceil((maxScore + padding) * 10) / 10);

    if (upper - lower < 1) {
      lower = Math.max(0, lower - 0.5);
      upper = Math.min(100, upper + 0.5);
    }

    return [lower, upper];
  }, [chartData.avgScores]);

  const performanceSummary = useMemo(() => {
    const configuredModels = experiment?.configuration?.selected_models ?? [];
    const scoreListsByModel: Record<string, number[]> = {};
    const executionTimeByModel: Record<string, number[]> = {};
    const winCountsByModel: Record<string, number> = {};
    let completedCount = 0;

    for (const item of items) {
      if (item.status !== ExperimentItemStatus.COMPLETED) continue;
      const { summary, modelEntries } = parseResultPayload(item.result);
      if (!summary) continue;

      completedCount += 1;

      for (const [model, score] of Object.entries(summary.meanScores ?? {})) {
        if (typeof score !== "number") continue;
        if (!scoreListsByModel[model]) {
          scoreListsByModel[model] = [];
        }
        scoreListsByModel[model].push(score);
      }

      for (const entry of modelEntries) {
        if (typeof entry.data.latencyMs !== "number") continue;
        if (!executionTimeByModel[entry.model]) {
          executionTimeByModel[entry.model] = [];
        }
        executionTimeByModel[entry.model].push(entry.data.latencyMs);
      }

      if (summary.winnerModel) {
        winCountsByModel[summary.winnerModel] =
          (winCountsByModel[summary.winnerModel] ?? 0) + 1;
      }
    }

    const discoveredModels = Object.keys(scoreListsByModel);
    const orderedModels = configuredModels.length
      ? [
        ...configuredModels.filter((model) => discoveredModels.includes(model)),
        ...discoveredModels.filter((model) => !configuredModels.includes(model)),
      ]
      : discoveredModels;

    if (orderedModels.length === 0 || completedCount === 0) {
      return null;
    }

    const buildMetric = (
      label: string,
      rawValues: number[],
      formatter: (value: number) => string,
      winnerDirection: "max" | "min" = "max"
    ) => {
      const validValues = rawValues.filter((value) => Number.isFinite(value));

      let winnerIndexes: number[] = [];
      if (validValues.length > 0) {
        const targetValue = validValues.reduce((best, current) => {
          if (winnerDirection === "max") {
            return current > best ? current : best;
          }
          return current < best ? current : best;
        }, winnerDirection === "max" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY);

        winnerIndexes = rawValues
          .map((value, index) => ({ value, index }))
          .filter((entry) => Number.isFinite(entry.value) && entry.value === targetValue)
          .map((entry) => entry.index);
      }

      return {
        label,
        values: rawValues.map((value) => (Number.isFinite(value) ? formatter(value) : "—")),
        winnerIndexes,
      };
    };

    const averageScoreValues = orderedModels.map((model) => {
      const scores = scoreListsByModel[model] ?? [];
      return scores.length > 0
        ? scores.reduce((sum, value) => sum + value, 0) / scores.length
        : 0;
    });

    const medianScoreValues = orderedModels.map((model) =>
      calculateMedian(scoreListsByModel[model] ?? [])
    );

    const winRateValues = orderedModels.map(
      (model) => ((winCountsByModel[model] ?? 0) / completedCount) * 100
    );

    const stdDeviationValues = orderedModels.map((model) =>
      calculateStandardDeviation(scoreListsByModel[model] ?? [])
    );

    const executionTimeValues = orderedModels.map((model) => {
      const latencies = executionTimeByModel[model] ?? [];
      return latencies.length > 0
        ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length
        : Number.NaN;
    });

    const metrics = [
      buildMetric("Average Score", averageScoreValues, formatScore),
      buildMetric("Median Score", medianScoreValues, formatScore),
      buildMetric("Win Rate", winRateValues, formatPercent),
      buildMetric("Std Deviation", stdDeviationValues, formatScore, "min"),
      buildMetric("Avg Time to Execute", executionTimeValues, formatDurationMs, "min"),
    ];

    return {
      models: orderedModels,
      metrics,
    };
  }, [experiment?.configuration?.selected_models, items]);

  const kendallTauSummary = useMemo(() => {
    type PairAccumulator = {
      judgeA: string;
      judgeB: string;
      concordant: number;
      discordant: number;
      tiesAOnly: number;
      tiesBOnly: number;
      queryCount: number;
    };

    const pairAccumulators = new Map<string, PairAccumulator>();

    for (const item of items) {
      if (item.status !== ExperimentItemStatus.COMPLETED) continue;
      const { summary } = parseResultPayload(item.result);
      if (!summary?.scores?.length) continue;

      const scoresByJudge = new Map<string, Map<string, number>>();

      for (const score of summary.scores) {
        if (typeof score.score !== "number") continue;
        if (!scoresByJudge.has(score.judgeModel)) {
          scoresByJudge.set(score.judgeModel, new Map<string, number>());
        }
        scoresByJudge.get(score.judgeModel)?.set(score.evaluatedModel, score.score);
      }

      const judgeModels = Array.from(scoresByJudge.keys());
      if (judgeModels.length < 2) continue;

      for (let i = 0; i < judgeModels.length; i += 1) {
        for (let j = i + 1; j < judgeModels.length; j += 1) {
          const judgeA = judgeModels[i];
          const judgeB = judgeModels[j];
          const judgeAScores = scoresByJudge.get(judgeA);
          const judgeBScores = scoresByJudge.get(judgeB);
          if (!judgeAScores || !judgeBScores) continue;

          const commonModels = Array.from(judgeAScores.keys()).filter((model) =>
            judgeBScores.has(model)
          );

          if (commonModels.length < 2) continue;

          let concordant = 0;
          let discordant = 0;
          let tiesAOnly = 0;
          let tiesBOnly = 0;

          for (let m = 0; m < commonModels.length; m += 1) {
            for (let n = m + 1; n < commonModels.length; n += 1) {
              const left = commonModels[m];
              const right = commonModels[n];

              const leftA = judgeAScores.get(left);
              const rightA = judgeAScores.get(right);
              const leftB = judgeBScores.get(left);
              const rightB = judgeBScores.get(right);

              if (
                typeof leftA !== "number" ||
                typeof rightA !== "number" ||
                typeof leftB !== "number" ||
                typeof rightB !== "number"
              ) {
                continue;
              }

              const comparisonA = compareScores(leftA, rightA);
              const comparisonB = compareScores(leftB, rightB);

              if (comparisonA === 0 && comparisonB === 0) continue;
              if (comparisonA === comparisonB) {
                concordant += 1;
              } else if (comparisonA === 0) {
                tiesAOnly += 1;
              } else if (comparisonB === 0) {
                tiesBOnly += 1;
              } else {
                discordant += 1;
              }
            }
          }

          const comparedPairs = concordant + discordant + tiesAOnly + tiesBOnly;
          if (comparedPairs === 0) continue;

          const orderedPair = [judgeA, judgeB].sort();
          const key = `${orderedPair[0]}||${orderedPair[1]}`;
          const existing = pairAccumulators.get(key);

          if (existing) {
            existing.concordant += concordant;
            existing.discordant += discordant;
            existing.tiesAOnly += tiesAOnly;
            existing.tiesBOnly += tiesBOnly;
            existing.queryCount += 1;
          } else {
            pairAccumulators.set(key, {
              judgeA: orderedPair[0],
              judgeB: orderedPair[1],
              concordant,
              discordant,
              tiesAOnly,
              tiesBOnly,
              queryCount: 1,
            });
          }
        }
      }
    }

    const rows: KendallRow[] = Array.from(pairAccumulators.values())
      .map((entry) => {
        const numerator = entry.concordant - entry.discordant;
        const denominator = Math.sqrt(
          (entry.concordant + entry.discordant + entry.tiesAOnly) *
          (entry.concordant + entry.discordant + entry.tiesBOnly)
        );
        const tauB = denominator > 0 ? numerator / denominator : Number.NaN;
        return {
          judgeA: entry.judgeA,
          judgeB: entry.judgeB,
          tauB,
          comparedPairs:
            entry.concordant + entry.discordant + entry.tiesAOnly + entry.tiesBOnly,
          queryCount: entry.queryCount,
        };
      })
      .sort((left, right) => {
        if (!Number.isFinite(left.tauB) && Number.isFinite(right.tauB)) return 1;
        if (Number.isFinite(left.tauB) && !Number.isFinite(right.tauB)) return -1;
        return Math.abs(right.tauB) - Math.abs(left.tauB);
      });

    return {
      rows,
    };
  }, [items]);

  if (!experimentId) {
    return (
      <SidebarInset>
        <div className="h-screen flex items-center justify-center p-6">
          <div className="rounded-lg border border-border bg-card p-6 text-center">
            <h2 className="text-lg font-semibold">Invalid experiment ID</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Please start an experiment again from the upload page.
            </p>
          </div>
        </div>
      </SidebarInset>
    );
  }

  if (isAccessBlocked && !isLoading) {
    return (
      <SidebarInset>
        <div className="h-screen flex items-center justify-center p-6">
          <div className="rounded-lg border border-border bg-card p-6 text-center max-w-md">
            <h2 className="text-lg font-semibold">Experiment unavailable</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {error || "This experiment was not found or you do not have access."}
            </p>
          </div>
        </div>
      </SidebarInset>
    );
  }

  return (
    <SidebarInset>
      <div className="h-screen flex flex-col overflow-hidden">
        <header className="flex-shrink-0 border-b border-border p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <SidebarTrigger className="md:hidden -ml-1 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <Link href="/experiments" className="inline-flex mb-2">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="size-4 mr-2" />
                  Back to Experiments
                </Button>
              </Link>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight truncate">
                {experiment?.title || "Experiment"}
              </h1>

              {experiment?.configuration && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2 text-sm text-muted-foreground">
                  <TooltipProvider delayDuration={100}>
                    <ShadcnTooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1.5 cursor-help">
                          <Bot className="size-3.5 text-primary/70" />
                          <span className="font-medium text-foreground/80">Models:</span>
                          <span className="font-semibold text-primary/80">
                            {experiment.configuration.selected_models?.length || 0}
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent showArrow={false} side="bottom" className="max-w-[300px] p-3 shadow-xl border-border/50 bg-card/95 backdrop-blur-md text-foreground">
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Selected Models</p>
                          <div className="flex flex-col gap-1.5">
                            {experiment.configuration.selected_models?.map((model) => (
                              <div key={model} className="flex items-center gap-2 text-xs">
                                <div className="size-1.5 rounded-full bg-primary/60 shrink-0" />
                                <span className="break-all font-medium text-foreground">{model}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </TooltipContent>
                    </ShadcnTooltip>
                  </TooltipProvider>

                  <div className="flex items-center gap-1.5 sm:border-l sm:border-border/50 sm:pl-4">
                    <ClipboardList className="size-3.5 text-primary/70" />
                    <span className="font-medium text-foreground/80">Rubric:</span>
                    <span className="truncate">{rubricTitle || "Loading..."}</span>
                  </div>

                  <div className="flex items-center gap-1.5 sm:border-l sm:border-border/50 sm:pl-4">
                    <Zap className="size-3.5 text-primary/70" />
                    <span className="font-medium text-foreground/80">Method:</span>
                    <span className="capitalize">{experiment.configuration.eval_method?.replace(/-/g, " ")}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 mt-3">
                <span
                  className={`inline-flex min-w-[84px] items-center justify-center rounded-md px-2.5 py-1 text-xs font-bold ${statusBadgeClass(experiment?.status)}`}
                >
                  {formatStatusLabel(experiment?.status)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {progress.done} / {progress.total} completed
                </span>

                {isExperimentDone && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    Total time:{" "}
                    {totalRunMsAfterCompletion != null
                      ? formatDurationMs(totalRunMsAfterCompletion)
                      : "—"}
                  </span>
                )}

                {isExperimentDone && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto gap-1.5"
                    onClick={async () => {
                      const reportInput: ExperimentReportInput = {
                        meta: {
                          title: experiment?.title || "Untitled Experiment",
                          authorName: user?.fullName || user?.username || "Unknown",
                          createdAt: experiment?.created_at || new Date().toISOString(),
                          queryCount: items.length,
                          models: experiment?.configuration?.selected_models || [],
                          rubricName: rubricTitle || "Default Rubric",
                          evalMethod: experiment?.configuration?.eval_method || "prompt-based",
                        },
                        performanceSummary: performanceSummary ?? null,
                        kendallRows: kendallTauSummary.rows.map((row) => ({
                          judgeA: row.judgeA,
                          judgeB: row.judgeB,
                          tauB: row.tauB,
                          agreement: Number.isFinite(row.tauB) ? getTauLabel(row.tauB) : "—",
                          comparedPairs: row.comparedPairs,
                          queryCount: row.queryCount,
                        })),
                        itemRows: tableRows.map(({ item, winner, score }, idx) => ({
                          index: idx + 1,
                          query: item.input_query || "—",
                          winnerModel: winner,
                          score,
                        })),
                        chartData: {
                          avgScores: chartData.avgScores.map((d) => ({
                            model: d.model,
                            avgScore: d.avgScore,
                          })),
                          wins: chartData.wins.map((d) => ({
                            name: d.name,
                            value: d.value,
                          })),
                        },
                      };
                      const { generateExperimentReport } = await import("@/lib/export-report");
                      generateExperimentReport(reportInput);
                    }}
                  >
                    <Download className="size-3.5" />
                    Export Report
                  </Button>
                )}
              </div>
            </div>
          </div>

          {(experiment?.status === ExperimentStatus.RUNNING || progress.total > 0) && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Progress</span>
                <span>{progress.progressPct.toFixed(0)}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-500"
                  style={{ width: `${progress.progressPct}%` }}
                />
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {progress.pending} pending, {progress.running} running, {progress.done} done
              </div>
            </div>
          )}
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {error && (
            <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between gap-3">
              <span>{error}</span>
              <Button size="sm" variant="outline" onClick={() => refreshData(true)}>
                Retry
              </Button>
            </div>
          )}

          {isExperimentDone && chartData.avgScores.length > 0 && (
            <>
              <div className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-xl border border-border/60 bg-card/60 shadow-sm backdrop-blur-sm p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-4">
                    Average Score by Model
                  </h3>
                  <p className="text-xs text-muted-foreground mb-2">
                    Y-axis is scaled to the current score range for easier comparison.
                  </p>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                      data={chartData.avgScores}
                      margin={{ top: 8, right: 12, bottom: 64, left: 12 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--color-border)"
                        opacity={0.4}
                      />
                      <XAxis
                        dataKey="model"
                        tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                        angle={-25}
                        textAnchor="end"
                        interval={0}
                        tickMargin={8}
                        tickFormatter={(value) => formatModelLabel(String(value ?? ""))}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                        domain={barChartDomain}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--color-card)",
                          border: "1px solid var(--color-border)",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                        formatter={(value) => [Number(value).toFixed(2), "Avg Score"]}
                      />
                      <Bar dataKey="avgScore" radius={[6, 6, 0, 0]} maxBarSize={56}>
                        {chartData.avgScores.map((entry, index) => (
                          <Cell key={`bar-${index}`} fill={entry.fill} />
                        ))}
                        <LabelList
                          dataKey="avgScore"
                          position="top"
                          formatter={(value) => Number(value ?? 0).toFixed(2)}
                          style={{ fontSize: "11px", fill: "var(--color-foreground)" }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {chartData.wins.length > 0 && (
                  <div className="rounded-xl border border-border/60 bg-card/60 shadow-sm backdrop-blur-sm p-5">
                    <h3 className="text-sm font-semibold text-foreground mb-4">
                      Queries Won by Model
                    </h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={chartData.wins}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={90}
                          paddingAngle={3}
                          label={({ name, value }) => `${formatModelLabel(String(name ?? ""))} (${value})`}
                          labelLine={{ stroke: "var(--color-muted-foreground)", strokeWidth: 1 }}
                          style={{ fontSize: "11px" }}
                        >
                          {chartData.wins.map((entry, index) => (
                            <Cell key={`pie-${index}`} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "var(--color-card)",
                            border: "1px solid var(--color-border)",
                            borderRadius: "8px",
                            fontSize: "12px",
                          }}
                          formatter={(value, name) => [value, name]}
                        />
                        <Legend
                          verticalAlign="bottom"
                          iconType="circle"
                          iconSize={8}
                          formatter={(value) => formatModelLabel(String(value ?? ""))}
                          wrapperStyle={{ fontSize: "11px", paddingTop: "12px" }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {performanceSummary && (
                <div className="mb-6 rounded-xl border border-border/60 bg-card/60 shadow-sm backdrop-blur-sm p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-4">
                    Model Performance Summary
                  </h3>
                  <div className="overflow-x-auto">
                    <Table className="[&_td]:px-3 [&_td]:py-2.5 [&_th]:px-3 [&_th]:py-2.5 text-sm">
                      <TableHeader className="[&_tr]:border-border/50 bg-muted/30">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="font-semibold">Metric</TableHead>
                          {performanceSummary.models.map((model) => (
                            <TableHead key={model} className="font-semibold" title={model}>
                              {formatModelLabel(model)}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody className="[&_tr]:border-border/35">
                        {performanceSummary.metrics.map((metric) => (
                          <TableRow key={metric.label}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-1.5">
                                <span>{metric.label}</span>
                                {METRIC_EXPLANATIONS[metric.label] && (
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button
                                        type="button"
                                        aria-label={`Explain ${metric.label}`}
                                        className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                                      >
                                        <Info className="size-3" />
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent align="start" className="w-64 p-3 text-xs leading-relaxed">
                                      {METRIC_EXPLANATIONS[metric.label]}
                                    </PopoverContent>
                                  </Popover>
                                )}
                              </div>
                            </TableCell>
                            {metric.values.map((value, idx) => (
                              <TableCell
                                key={`${metric.label}-${performanceSummary.models[idx]}`}
                                className={metric.winnerIndexes.includes(idx) ? "bg-primary/10 font-semibold" : ""}
                              >
                                {value}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {kendallTauSummary.rows.length > 0 && (
                <div className="mb-6 rounded-xl border border-border/60 bg-card/60 shadow-sm backdrop-blur-sm p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-2">
                    Judge Agreement (Kendall&apos;s Tau-b)
                  </h3>
                  <Collapsible>
                    <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3 group">
                      <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
                      What does this measure?
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mb-4 rounded-md border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground space-y-2">
                        <p>
                          <strong className="text-foreground">Kendall&apos;s Tau-b</strong> is a statistical measure of
                          agreement between two rankings. In this context, it measures how consistently different judge
                          models rank the evaluated models for each query.
                        </p>
                        <p>
                          A value of <strong>+1</strong> means perfect agreement (both judges rank models identically),
                          {" "}<strong>0</strong> means no correlation, and <strong>-1</strong> means complete disagreement
                          (opposite rankings). The &quot;Agreement&quot; column provides a human-readable interpretation.
                        </p>
                        <p>
                          <strong>High agreement</strong> across judge pairs indicates the evaluation results are reliable.
                          {" "}<strong>Low or negative agreement</strong> suggests judges disagree on model quality, and
                          the winner determination may be less trustworthy.
                        </p>
                        <div className="pt-1 border-t border-border/40 text-[11px]">
                          <span className="font-medium text-foreground">Strength scale (|tau-b|):</span>{" "}
                          Very strong (≥0.8) · Strong (≥0.6) · Moderate (≥0.4) · Weak (≥0.2) · Very weak (&lt;0.2).
                          Sign indicates direction: positive = agreement, negative = disagreement.
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                  <Collapsible>
                    <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3 group">
                      <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
                      Example calculation
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mb-4 rounded-md border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground space-y-2">
                        <div>
                          <p className="mb-1">General formula:</p>
                          <div className="inline-flex items-center gap-2 rounded border border-border/50 bg-background/40 px-2 py-1 text-foreground">
                            <span className="font-medium">tau-b =</span>
                            <span className="inline-flex flex-col items-stretch leading-tight text-center">
                              <span className="w-full border-b border-foreground/40 px-1 pb-0.5">C - D</span>
                              <span className="px-1 pt-0.5">sqrt((C + D + T<sub>a</sub>) * (C + D + T<sub>b</sub>))</span>
                            </span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p><strong className="text-foreground">C</strong> = number of concordant pairs (judges agree on pair order)</p>
                          <p><strong className="text-foreground">D</strong> = number of discordant pairs (judges disagree on pair order)</p>
                          <p><strong className="text-foreground">T_a</strong> = pairs tied only by Judge A</p>
                          <p><strong className="text-foreground">T_b</strong> = pairs tied only by Judge B</p>
                        </div>
                        <p>
                          Example with three models (A, B, C) scored by two judges for one query:
                        </p>
                        <p>
                          Judge 1 ranking: <strong className="text-foreground">A &gt; B &gt; C</strong>
                          {" "}and Judge 2 ranking: <strong className="text-foreground">B &gt; A &gt; C</strong>.
                        </p>
                        <p>
                          Model pairs are <strong>A vs B</strong>, <strong>A vs C</strong>, and <strong>B vs C</strong>.
                          Here, A vs B is <strong>discordant</strong> (judges disagree), while A vs C and B vs C are
                          <strong> concordant</strong> (judges agree).
                        </p>
                        <div className="space-y-1">
                          <p>
                            So we get <strong>C = 2</strong>, <strong>D = 1</strong>, and no ties
                            (<strong>T<sub>a</sub> = 0</strong>, <strong>T<sub>b</sub> = 0</strong>).
                          </p>
                          <div className="inline-flex items-center gap-2 rounded border border-border/50 bg-background/40 px-2 py-1 text-foreground">
                            <span className="font-medium">tau-b =</span>
                            <span className="inline-flex flex-col items-stretch leading-tight text-center">
                              <span className="w-full border-b border-foreground/40 px-1 pb-0.5">2 - 1</span>
                              <span className="px-1 pt-0.5">sqrt((2 + 1 + 0) * (2 + 1 + 0))</span>
                            </span>
                            <span>=</span>
                            <span className="inline-flex flex-col items-stretch leading-tight text-center">
                              <span className="w-full border-b border-foreground/40 px-1 pb-0.5">1</span>
                              <span className="px-1 pt-0.5">3</span>
                            </span>
                            <span>= 0.333</span>
                          </div>
                          <p>That indicates weak-to-moderate agreement.</p>
                        </div>
                        <p className="pt-1 border-t border-border/40 text-[11px]">
                          If both judges had exactly the same ranking, tau-b would be <strong>+1</strong>. If rankings
                          were exact opposites, tau-b would be <strong>-1</strong>.
                        </p>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                  <div className="overflow-x-auto">
                    <Table className="[&_td]:px-3 [&_td]:py-2.5 [&_th]:px-3 [&_th]:py-2.5 text-sm">
                      <TableHeader className="[&_tr]:border-border/50 bg-muted/30">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="font-semibold">Judge A</TableHead>
                          <TableHead className="font-semibold">Judge B</TableHead>
                          <TableHead className="font-semibold">Tau-b</TableHead>
                          <TableHead className="font-semibold">Agreement</TableHead>
                          <TableHead className="font-semibold">Pairs</TableHead>
                          <TableHead className="font-semibold">Queries</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="[&_tr]:border-border/35">
                        {kendallTauSummary.rows.map((row) => (
                          <TableRow key={`${row.judgeA}-${row.judgeB}`}>
                            <TableCell title={row.judgeA}>{formatModelLabel(row.judgeA)}</TableCell>
                            <TableCell title={row.judgeB}>{formatModelLabel(row.judgeB)}</TableCell>
                            <TableCell className="font-medium">{formatTau(row.tauB)}</TableCell>
                            <TableCell>{Number.isFinite(row.tauB) ? getTauLabel(row.tauB) : "—"}</TableCell>
                            <TableCell>{row.comparedPairs}</TableCell>
                            <TableCell>{row.queryCount}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

            </>
          )}

          <div className="overflow-hidden rounded-xl border border-border/60 bg-card/60 shadow-sm backdrop-blur-sm">
            <Table className="table-fixed [&_td]:px-4 [&_td]:py-4 [&_th]:px-4 [&_th]:py-3">
              <TableHeader className="[&_tr]:border-border/50 bg-muted/30">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[40%] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Query
                  </TableHead>
                  <TableHead className="w-[30%] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Winner Model
                  </TableHead>
                  <TableHead className="w-[10%] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Score
                  </TableHead>
                  <TableHead className="w-[20%] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="[&_tr]:border-border/35">
                {isLoading && (
                  Array.from({ length: 6 }).map((_, idx) => (
                    <TableRow key={`skeleton-${idx}`} className="hover:bg-transparent">
                      <TableCell>
                        <div className="h-4 w-40 rounded bg-muted animate-pulse" />
                      </TableCell>
                      <TableCell>
                        <div className="h-4 w-24 rounded bg-muted animate-pulse" />
                      </TableCell>
                      <TableCell>
                        <div className="h-4 w-12 rounded bg-muted animate-pulse" />
                      </TableCell>
                      <TableCell>
                        <div className="h-6 w-20 rounded-md bg-muted animate-pulse" />
                      </TableCell>
                    </TableRow>
                  ))
                )}

                {!isLoading && tableRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No experiment items found.
                    </TableCell>
                  </TableRow>
                )}

                {!isLoading && tableRows.map(({ item, winner, score }) => (
                  <TableRow
                    key={item.id}
                    className="cursor-pointer border-border/35 hover:bg-muted/25"
                    onClick={() => setSelectedItem(item)}
                  >
                    <TableCell>
                      <span
                        className="block truncate font-medium text-foreground"
                        title={item.input_query || ""}
                      >
                        {item.input_query || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="block truncate" title={winner}>
                        {formatModelLabel(winner)}
                      </span>
                    </TableCell>
                    <TableCell>{score}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex min-w-[84px] items-center justify-center rounded-md px-2.5 py-1 text-xs font-bold ${statusBadgeClass(item.status)}`}
                      >
                        {formatStatusLabel(item.status)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <Dialog open={!!selectedItem} onOpenChange={(isOpen) => !isOpen && setSelectedItem(null)}>
          <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Experiment Item Details</DialogTitle>
              <DialogDescription>
                Full response and reasoning for this query.
              </DialogDescription>
            </DialogHeader>

            {selectedItem && (
              <div className="space-y-5 text-sm">
                <section>
                  <h3 className="font-semibold mb-1">Query</h3>
                  <p className="rounded-md border border-border bg-muted/20 p-3 whitespace-pre-wrap break-words overflow-hidden">
                    {selectedItem.input_query || "—"}
                  </p>
                </section>

                {selectedItem.expected_output && (
                  <section>
                    <h3 className="font-semibold mb-1">Expected Output</h3>
                    <p className="rounded-md border border-border bg-muted/20 p-3 whitespace-pre-wrap break-words overflow-hidden">
                      {selectedItem.expected_output}
                    </p>
                  </section>
                )}

                <section>
                  <h3 className="font-semibold mb-1">Winner Summary</h3>
                  <div className="rounded-md border border-border bg-muted/20 p-3">
                    <p>
                      Winner: <strong>{selectedItemDetails?.summary?.winnerModel || "—"}</strong>
                    </p>
                    <p className="mt-1">
                      Score: <strong>
                        {selectedItemDetails?.summary?.winnerModel &&
                          typeof selectedItemDetails.summary.meanScores[
                          selectedItemDetails.summary.winnerModel
                          ] === "number"
                          ? selectedItemDetails.summary.meanScores[
                            selectedItemDetails.summary.winnerModel
                          ].toFixed(1)
                          : "—"}
                      </strong>
                    </p>
                  </div>
                </section>

                <section>
                  <h3 className="font-semibold mb-2">Model Outputs</h3>
                  <div className="space-y-3">
                    {selectedItemDetails?.modelEntries.length ? (
                      selectedItemDetails.modelEntries.map((entry) => (
                        <div key={entry.model} className="rounded-md border border-border p-3 space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-medium truncate">{entry.model}</p>
                            <div className="flex items-center gap-2 text-xs">
                              {typeof entry.data.score === "number" && (
                                <span className="text-muted-foreground">Score: {entry.data.score.toFixed(1)}</span>
                              )}
                              {entry.data.status && (
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${statusBadgeClass(entry.data.status)}`}>
                                  {entry.data.status}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="rounded-md bg-muted/20 p-3">
                            {entry.data.output ? (
                              <Markdown className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 break-words overflow-hidden">
                                {entry.data.output}
                              </Markdown>
                            ) : (
                              <p className="text-muted-foreground">No output available.</p>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-muted-foreground">No model outputs available.</p>
                    )}
                  </div>
                </section>

                <section>
                  <h3 className="font-semibold mb-2">Reasoning</h3>
                  {selectedItemDetails?.summary?.scores?.length ? (
                    <div className="space-y-3">
                      {Object.entries(
                        selectedItemDetails.summary.scores.reduce<Record<string, string[]>>((acc, score) => {
                          if (!score.reasoning) return acc;
                          if (!acc[score.evaluatedModel]) {
                            acc[score.evaluatedModel] = [];
                          }
                          acc[score.evaluatedModel].push(score.reasoning);
                          return acc;
                        }, {})
                      ).map(([model, notes]) => (
                        <div key={model} className="rounded-md border border-border p-3">
                          <p className="font-medium mb-2">{model}</p>
                          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                            {notes.map((note, idx) => (
                              <li key={`${model}-${idx}`}>{note}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No reasoning available.</p>
                  )}
                </section>

                {selectedItem.status === ExperimentItemStatus.ERROR && selectedItem.error_message && (
                  <section>
                    <h3 className="font-semibold mb-1">Row Error</h3>
                    <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive whitespace-pre-wrap">
                      {selectedItem.error_message}
                    </p>
                  </section>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </SidebarInset>
  );
}
