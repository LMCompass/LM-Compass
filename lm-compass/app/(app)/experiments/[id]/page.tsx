"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
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
  useSidebar,
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
      return "bg-blue-500/10 text-blue-600 dark:text-blue-300";
    case ExperimentStatus.COMPLETED:
    case ExperimentItemStatus.COMPLETED:
      return "bg-green-500/10 text-green-700 dark:text-green-300";
    case ExperimentStatus.ERROR:
    case ExperimentItemStatus.ERROR:
      return "bg-red-500/10 text-red-700 dark:text-red-300";
    case ExperimentStatus.DRAFT:
    case ExperimentItemStatus.PENDING:
      return "bg-amber-500/10 text-amber-700 dark:text-amber-300";
    default:
      return "bg-muted text-muted-foreground";
  }
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
  const { open } = useSidebar();
  const supabase = useSupabaseClient();

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
  const [selectedItem, setSelectedItem] = useState<ExperimentItemRow | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRefreshingRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const fetchExperiment = useCallback(async (id: string) => {
    const { data, error: fetchError } = await supabase
      .from("experiments")
      .select("id, title, status, created_at, configuration")
      .eq("id", id)
      .single();

    if (fetchError) throw fetchError;
    return data as Experiment;
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
      if (!experimentId) {
        setError("Invalid experiment ID.");
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
        const [nextExperiment, nextItems] = await Promise.all([
          fetchExperiment(experimentId),
          fetchItems(experimentId),
        ]);

        setExperiment(nextExperiment);
        setItems(nextItems);
        setError(null);

        const shouldKeepPolling = shouldContinuePolling(nextExperiment, nextItems);
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
    [experimentId, fetchExperiment, fetchItems, stopPolling]
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

  return (
    <SidebarInset>
      <div className="h-screen flex flex-col overflow-hidden">
        <header className="flex-shrink-0 border-b border-border p-4 sm:p-6">
          <div className="flex items-center gap-3">
            {!open && <SidebarTrigger />}
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight truncate">
                {experiment?.title || "Experiment"}
              </h1>
              <div className="flex items-center gap-2 mt-2">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClass(experiment?.status)}`}
                >
                  {experiment?.status || "unknown"}
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

          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[45%]">Query</TableHead>
                  <TableHead>Winner Model</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  Array.from({ length: 6 }).map((_, idx) => (
                    <TableRow key={`skeleton-${idx}`}>
                      <TableCell>
                        <div className="h-4 rounded bg-muted animate-pulse" />
                      </TableCell>
                      <TableCell>
                        <div className="h-4 rounded bg-muted animate-pulse" />
                      </TableCell>
                      <TableCell>
                        <div className="h-4 rounded bg-muted animate-pulse" />
                      </TableCell>
                      <TableCell>
                        <div className="h-6 w-20 rounded-full bg-muted animate-pulse" />
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
                    className="cursor-pointer"
                    onClick={() => setSelectedItem(item)}
                  >
                    <TableCell>
                      <span className="block truncate" title={item.input_query || ""}>
                        {item.input_query || "—"}
                      </span>
                    </TableCell>
                    <TableCell>{winner}</TableCell>
                    <TableCell>{score}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClass(item.status)}`}
                      >
                        {item.status || "unknown"}
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
