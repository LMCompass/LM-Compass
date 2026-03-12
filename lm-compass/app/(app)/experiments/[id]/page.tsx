"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { ArrowLeft } from "lucide-react";
import {
  BarChart,
  Bar,
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

const POLL_INTERVAL_MS = 2000;

const CHART_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#84cc16",
];

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
    const status = value.status === "error" ? "error" : value.status === "success" ? "success" : undefined;

    const modelData: ExperimentItemModelResult = { output, score, status };
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

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRefreshingRef = useRef(false);
  const latestExperimentRef = useRef<Experiment | null>(null);

  useEffect(() => {
    latestExperimentRef.current = experiment;
  }, [experiment]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const fetchExperiment = useCallback(async (id: string, userId: string) => {
    const { data, error: fetchError } = await supabase
      .from("experiments")
      .select("id, title, status, created_at, configuration")
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

    const avgScores = Object.entries(scoreSums).map(([model, sum], i) => ({
      model,
      avgScore: +(sum / scoreCounts[model]).toFixed(2),
      fill: CHART_COLORS[i % CHART_COLORS.length],
    }));
    avgScores.sort((a, b) => b.avgScore - a.avgScore);

    const wins = Object.entries(winCounts).map(([model, count], i) => ({
      name: model,
      value: count,
      fill: CHART_COLORS[i % CHART_COLORS.length],
    }));
    wins.sort((a, b) => b.value - a.value);

    return { avgScores, wins };
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
              <div className="flex items-center gap-2 mt-2">
                <span
                  className={`inline-flex min-w-[84px] items-center justify-center rounded-md px-2.5 py-1 text-xs font-bold ${statusBadgeClass(experiment?.status)}`}
                >
                  {formatStatusLabel(experiment?.status)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {progress.done} / {progress.total} completed
                </span>
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
            <div className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-xl border border-border/60 bg-card/60 shadow-sm backdrop-blur-sm p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4">
                  Average Score by Model
                </h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={chartData.avgScores}
                    margin={{ top: 8, right: 12, bottom: 40, left: 12 }}
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
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                      domain={[0, 100]}
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
                        outerRadius={100}
                        innerRadius={50}
                        paddingAngle={3}
                        label={({ name, value }) => `${String(name ?? "").split("/").pop()} (${value})`}
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
                        wrapperStyle={{ fontSize: "11px", paddingTop: "12px" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-border/60 bg-card/60 shadow-sm backdrop-blur-sm">
            <Table className="[&_td]:px-4 [&_td]:py-4 [&_th]:px-4 [&_th]:py-3">
              <TableHeader className="[&_tr]:border-border/50 bg-muted/30">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[45%] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Query
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Winner Model
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Score
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                    <TableCell>{winner}</TableCell>
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
                  <p className="rounded-md border border-border bg-muted/20 p-3 whitespace-pre-wrap">
                    {selectedItem.input_query || "—"}
                  </p>
                </section>

                {selectedItem.expected_output && (
                  <section>
                    <h3 className="font-semibold mb-1">Expected Output</h3>
                    <p className="rounded-md border border-border bg-muted/20 p-3 whitespace-pre-wrap">
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
                              <Markdown className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
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
