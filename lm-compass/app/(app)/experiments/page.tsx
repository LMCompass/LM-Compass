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
  useSidebar,
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
  const { open } = useSidebar();
  const { user, isLoaded: userLoaded } = useUser();

  const [experiments, setExperiments] = useState<ExperimentListRow[]>([]);
  const [itemRows, setItemRows] = useState<ExperimentItemStatusRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          <div className="flex items-center gap-3">
            {!open && <SidebarTrigger />}
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

          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Progress</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading &&
                  Array.from({ length: 6 }).map((_, idx) => (
                    <TableRow key={`experiment-skeleton-${idx}`}>
                      <TableCell>
                        <div className="h-4 rounded bg-muted animate-pulse" />
                      </TableCell>
                      <TableCell>
                        <div className="h-6 w-20 rounded-full bg-muted animate-pulse" />
                      </TableCell>
                      <TableCell>
                        <div className="h-4 rounded bg-muted animate-pulse" />
                      </TableCell>
                      <TableCell>
                        <div className="h-4 rounded bg-muted animate-pulse" />
                      </TableCell>
                    </TableRow>
                  ))}

                {!isLoading && !error && experiments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center">
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
                        className="cursor-pointer"
                        onClick={() => router.push(`/experiments/${experiment.id}`)}
                      >
                        <TableCell>
                          <span className="block truncate" title={experiment.title || ""}>
                            {experiment.title || "Untitled experiment"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClass(experiment.status)}`}
                          >
                            {experiment.status || "unknown"}
                          </span>
                        </TableCell>
                        <TableCell>{formatDate(experiment.created_at)}</TableCell>
                        <TableCell>
                          {progress.done}/{progress.total}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}
