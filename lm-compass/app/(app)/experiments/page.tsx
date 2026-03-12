"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useSupabaseClient } from "@/utils/supabase/client";
import {
  ExperimentItemStatus,
  ExperimentStatus,
  type Experiment,
} from "@/lib/types";
import {
  SidebarInset,
  SidebarTrigger,
} from "@/components/sidebar/sidebar";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";

type ExperimentListRow = Pick<
  Experiment,
  "id" | "title" | "status" | "created_at"
>;

type ExperimentItemStatusRow = {
  experiment_id: string | null;
  status: ExperimentItemStatus | null;
};

type ExperimentProgress = {
  done: number;
  total: number;
};

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

function formatDate(dateValue: string | null) {
  if (!dateValue) return "—";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function ExperimentsIndexPage() {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const { user, isLoaded: userLoaded } = useUser();

  const [experiments, setExperiments] = useState<ExperimentListRow[]>([]);
  const [itemRows, setItemRows] = useState<ExperimentItemStatusRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [experimentIdPendingDelete, setExperimentIdPendingDelete] = useState<
    string | null
  >(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const refreshData = useCallback(async () => {
    if (!userLoaded) return;

    if (!user?.id) {
      setExperiments([]);
      setItemRows([]);
      setIsLoading(false);
      setError("Please sign in to view experiments.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const experimentsResponse = await supabase
        .from("experiments")
        .select("id, title, status, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (experimentsResponse.error) {
        throw experimentsResponse.error;
      }

      const experimentRows = (experimentsResponse.data || []) as ExperimentListRow[];
      setExperiments(experimentRows);

      const experimentIds = experimentRows.map((experiment) => experiment.id);
      if (experimentIds.length === 0) {
        setItemRows([]);
        return;
      }

      const itemsResponse = await supabase
        .from("experiments_items")
        .select("experiment_id, status")
        .in("experiment_id", experimentIds);

      if (itemsResponse.error) {
        throw itemsResponse.error;
      }

      setItemRows((itemsResponse.data || []) as ExperimentItemStatusRow[]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load experiments.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, user?.id, userLoaded]);

  const handleDeleteExperiment = useCallback(
    async (id: string) => {
      if (!user?.id || isDeleting) return;

      setIsDeleting(true);
      setError(null);

      try {
        const { error: experimentError } = await supabase
          .from("experiments")
          .delete()
          .eq("id", id)
          .eq("user_id", user.id);

        if (experimentError) {
          throw experimentError;
        }

        await refreshData();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to delete experiment.";
        setError(message);
      } finally {
        setIsDeleting(false);
        setExperimentIdPendingDelete(null);
        setIsDeleteDialogOpen(false);
      }
    },
    [isDeleting, refreshData, supabase, user?.id],
  );

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const progressByExperimentId = useMemo(() => {
    const progressMap = new Map<string, ExperimentProgress>();

    itemRows.forEach((item) => {
      const experimentId = item.experiment_id;
      if (!experimentId) return;

      const current = progressMap.get(experimentId) ?? { done: 0, total: 0 };
      current.total += 1;

      if (
        item.status === ExperimentItemStatus.COMPLETED ||
        item.status === ExperimentItemStatus.ERROR
      ) {
        current.done += 1;
      }

      progressMap.set(experimentId, current);
    });

    return progressMap;
  }, [itemRows]);

  return (
    <SidebarInset>
      <div className="h-screen flex flex-col overflow-hidden">
        <header className="flex-shrink-0 border-b border-border p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <SidebarTrigger className="md:hidden -ml-1 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight truncate">
                Experiments
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                View your experiments and open any dashboard.
              </p>
            </div>
            <Button onClick={() => router.push("/experiments/upload")}>
              Create Experiment
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {error && (
            <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between gap-3">
              <span>{error}</span>
              <Button size="sm" variant="outline" onClick={refreshData}>
                Retry
              </Button>
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-border/60 bg-card/60 shadow-sm backdrop-blur-sm">
            <Table className="[&_td]:px-4 [&_td]:py-4 [&_th]:px-4 [&_th]:py-3">
              <TableHeader className="[&_tr]:border-border/50 bg-muted/30">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Title
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Status
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Created
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Progress
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="[&_tr]:border-border/35">
                {isLoading &&
                  Array.from({ length: 6 }).map((_, idx) => (
                    <TableRow
                      key={`experiment-skeleton-${idx}`}
                      className="hover:bg-transparent"
                    >
                      <TableCell>
                        <div className="h-4 w-28 rounded bg-muted animate-pulse" />
                      </TableCell>
                      <TableCell>
                        <div className="h-7 w-24 rounded-full bg-muted animate-pulse" />
                      </TableCell>
                      <TableCell>
                        <div className="h-4 w-44 rounded bg-muted animate-pulse" />
                      </TableCell>
                      <TableCell>
                        <div className="h-4 w-12 rounded bg-muted animate-pulse" />
                      </TableCell>
                      <TableCell>
                        <div className="h-6 w-6 rounded-full bg-muted animate-pulse ml-auto" />
                      </TableCell>
                    </TableRow>
                  ))}

                {!isLoading && !error && experiments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center">
                      <p className="text-muted-foreground mb-3">
                        You have no experiments yet.
                      </p>
                      <Button onClick={() => router.push("/experiments/upload")}>
                        Create your first experiment
                      </Button>
                    </TableCell>
                  </TableRow>
                )}

                {!isLoading &&
                  experiments.map((experiment) => {
                    const progress = progressByExperimentId.get(experiment.id) ?? {
                      done: 0,
                      total: 0,
                    };

                    return (
                      <TableRow
                        key={experiment.id}
                        className="group cursor-pointer border-border/35 hover:bg-muted/25"
                        onClick={() => router.push(`/experiments/${experiment.id}`)}
                      >
                        <TableCell>
                          <span
                            className="block truncate font-medium text-foreground"
                            title={experiment.title || ""}
                          >
                            {experiment.title || "Untitled experiment"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex min-w-[84px] items-center justify-center rounded-md px-2.5 py-1 text-xs font-bold ${statusBadgeClass(experiment.status)}`}
                          >
                            {formatStatusLabel(experiment.status)}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(experiment.created_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <span className="min-w-10 font-medium tabular-nums">
                              {progress.done}/{progress.total}
                            </span>
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary/80 transition-all"
                                style={{
                                  width: `${
                                    progress.total > 0
                                      ? (progress.done / progress.total) * 100
                                      : 0
                                  }%`,
                                }}
                              />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExperimentIdPendingDelete(experiment.id);
                              setIsDeleteDialogOpen(true);
                            }}
                            aria-label="Delete experiment"
                            disabled={isDeleting}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          setIsDeleteDialogOpen(open);
          if (!open) {
            setExperimentIdPendingDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete experiment</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this experiment and its items. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setIsDeleteDialogOpen(false);
                setExperimentIdPendingDelete(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (experimentIdPendingDelete) {
                  await handleDeleteExperiment(experimentIdPendingDelete);
                }
              }}
              disabled={isDeleting}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarInset>
  );
}
