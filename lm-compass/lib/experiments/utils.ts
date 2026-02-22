import { ExperimentItemStatus, ExperimentStatus } from "@/lib/types";

export function statusBadgeClass(status: string | null | undefined) {
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

export function formatStatusLabel(status: string | null | undefined) {
  if (!status) return "Unknown";
  return status.charAt(0).toUpperCase() + status.slice(1);
}
