"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from "@/components/sidebar/sidebar";
import { Button } from "@/components/ui/button";
import { FileText, Plus, Trash2 } from "lucide-react";
import { AddRubricDialog, type NewRubricInput } from "@/components/add-rubric-dialog";
import { createRubric } from "../actions";
import { useSupabaseClient } from "@/utils/supabase/client";
import { useUser } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
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

type RubricRow = {
  id: string;
  rubric_title: string | null;
  rubric_content: string | null;
  created_at: string | null;
  category: string | null;
};

function formatDate(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function ViewRubricsPage() {
  const { open } = useSidebar();
  const supabase = useSupabaseClient();
  const { user, isLoaded: userLoaded } = useUser();
  const [showAddRubricDialog, setShowAddRubricDialog] = useState(false);
  const [rubrics, setRubrics] = useState<RubricRow[]>([]);
  const [selectedRubricId, setSelectedRubricId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [rubricIdPendingDelete, setRubricIdPendingDelete] = useState<string | null>(null);

  const selectedRubric = useMemo(
    () => rubrics.find((r) => r.id === selectedRubricId) ?? null,
    [rubrics, selectedRubricId]
  );

  const refreshRubrics = useCallback(async () => {
    if (!userLoaded) return;

    if (!user?.id) {
      setRubrics([]);
      setSelectedRubricId(null);
      setIsLoading(false);
      setError("Please sign in to view your rubrics.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await supabase
        .from("rubrics")
        .select("id, rubric_title, rubric_content, created_at, category")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (response.error) {
        throw response.error;
      }

      setRubrics((response.data || []) as RubricRow[]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load rubrics.";
      setError(message);
      setRubrics([]);
      setSelectedRubricId(null);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, user?.id, userLoaded]);

  useEffect(() => {
    refreshRubrics();
  }, [refreshRubrics]);

  useEffect(() => {
    if (rubrics.length === 0) return;

    if (selectedRubricId == null || !rubrics.some((r) => r.id === selectedRubricId)) {
      setSelectedRubricId(rubrics[0]?.id ?? null);
    }
  }, [rubrics, selectedRubricId]);

  const handleSaveRubric = async (rubric: NewRubricInput) => {
    const result = await createRubric(rubric);

    if (result.success) {
      console.log("Rubric saved successfully:", result.data);
      setShowAddRubricDialog(false);
      const createdId =
        result.data && typeof result.data === "object" && "id" in result.data
          ? String((result.data as { id: unknown }).id)
          : null;
      await refreshRubrics();
      if (createdId) setSelectedRubricId(createdId);
    } else {
      console.error("Error saving rubric:", result.error);
      // TODO: Show error message to user
    }
  };

  return (
    <SidebarInset>
      <div className="h-screen flex flex-col">
        <header className="flex-shrink-0 flex items-center gap-4 p-4 sm:p-6">
          {!open && <SidebarTrigger />}
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex-1">
            View Rubrics
          </h1>
        </header>

        <div className="flex-1 min-h-0 p-6">
          <div className="mx-auto h-full w-full max-w-6xl">
            {error && (
              <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div
              className="grid h-full min-h-0 grid-cols-1 gap-6 md:grid-cols-2"
              data-tour-id="rubrics-overview"
            >
              {/* Left: list */}
              <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-background">
                <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                  <div className="text-sm font-semibold">All rubrics</div>
                  <Button
                    variant="ghost"
                    size="sm"
                    data-tour-id="rubric-add-button"
                    onClick={() => setShowAddRubricDialog(true)}
                  >
                    <Plus className="size-4 mr-2" />
                    Add
                  </Button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                  {isLoading ? (
                    <ItemGroup className="gap-2">
                      {Array.from({ length: 6 }).map((_, idx) => (
                        <Item key={idx} variant="outline">
                          <ItemMedia variant="icon">
                            <Skeleton className="h-4 w-4 rounded-sm" />
                          </ItemMedia>
                          <ItemContent>
                            <ItemHeader>
                              <Skeleton className="h-4 w-44" />
                              <Skeleton className="h-3 w-24" />
                            </ItemHeader>
                            <Skeleton className="h-3 w-full" />
                            <Skeleton className="h-3 w-3/4" />
                          </ItemContent>
                        </Item>
                      ))}
                    </ItemGroup>
                  ) : rubrics.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
                      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md border bg-muted/20">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="text-sm font-semibold">No rubrics yet</div>
                      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                        Create a rubric, and it’ll show up here.
                      </p>
                      <Button
                        className="mt-4"
                        onClick={() => setShowAddRubricDialog(true)}
                      >
                        <Plus className="size-4 mr-2" />
                        Add your first rubric
                      </Button>
                    </div>
                  ) : (
                    <ItemGroup>
                      {rubrics.map((rubric, index) => {
                        const isSelected = rubric.id === selectedRubricId;
                        const createdLabel =
                          rubric.created_at != null ? formatDate(rubric.created_at) : null;
                        const categories =
                          rubric.category
                            ?.split(",")
                            .map((c) => c.trim())
                            .filter(Boolean) ?? [];

                        return (
                          <div key={rubric.id}>
                            <Item
                              variant="outline"
                              className={cn(
                                "cursor-pointer select-none transition-colors hover:bg-accent/30",
                                isSelected && "bg-muted/40"
                              )}
                              onClick={() => setSelectedRubricId(rubric.id)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setSelectedRubricId(rubric.id);
                                }
                              }}
                            >
                              <ItemMedia variant="icon">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                              </ItemMedia>
                              <ItemContent>
                                <ItemHeader>
                                  <ItemTitle>
                                    {rubric.rubric_title?.trim() || "Untitled rubric"}
                                  </ItemTitle>
                                  {createdLabel && (
                                    <span className="text-xs text-muted-foreground">
                                      {createdLabel}
                                    </span>
                                  )}
                                </ItemHeader>
                                {categories.length > 0 && (
                                  <div className="mt-1 flex flex-wrap gap-1.5">
                                    {categories.map((cat) => (
                                      <span
                                        key={cat}
                                        className="inline-flex items-center rounded-full bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary"
                                      >
                                        {cat.toUpperCase()}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                <ItemDescription>
                                  {rubric.rubric_content?.trim() ||
                                    "No rubric content provided."}
                                </ItemDescription>
                              </ItemContent>
                            </Item>
                            {index !== rubrics.length - 1 && <ItemSeparator />}
                          </div>
                        );
                      })}
                    </ItemGroup>
                  )}
                </div>
              </section>

              {/* Right: selected preview */}
              <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-background">
                <div className="border-b px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">
                      {selectedRubric
                        ? selectedRubric.rubric_title?.trim() || "Untitled rubric"
                        : "Rubric preview"}
                    </div>
                    {selectedRubric?.created_at && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        Created {formatDate(selectedRubric.created_at) ?? selectedRubric.created_at}
                      </div>
                    )}
                    {selectedRubric?.category && (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {selectedRubric.category
                          .split(",")
                          .map((c) => c.trim())
                          .filter(Boolean)
                          .map((cat) => (
                            <span
                              key={cat}
                              className="inline-flex items-center rounded-full bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary"
                            >
                              {cat.toUpperCase()}
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                  {selectedRubric && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRubricIdPendingDelete(selectedRubric.id);
                        setShowDeleteDialog(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  )}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  {isLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-5/6" />
                      <Skeleton className="h-4 w-4/6" />
                    </div>
                  ) : selectedRubric ? (
                    <pre className="whitespace-pre-wrap text-sm leading-relaxed">
                      {selectedRubric.rubric_content?.trim() ||
                        "No rubric content provided."}
                    </pre>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center text-muted-foreground">
                      <div className="mb-2 text-sm font-semibold text-foreground">
                        Select a rubric to view
                      </div>
                      <p className="max-w-sm text-sm">
                        Click a rubric on the left and its full contents will appear here.
                      </p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>

        <AddRubricDialog
          open={showAddRubricDialog}
          onOpenChange={setShowAddRubricDialog}
          onSave={handleSaveRubric}
        />
        <AlertDialog
          open={showDeleteDialog}
          onOpenChange={(open) => {
            setShowDeleteDialog(open);
            if (!open) {
              setRubricIdPendingDelete(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete rubric</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this rubric. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setShowDeleteDialog(false);
                  setRubricIdPendingDelete(null);
                }}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  if (rubricIdPendingDelete) {
                    console.log("Deleting rubric via client:", {
                      id: rubricIdPendingDelete,
                      userId: user?.id,
                    });
                    if (!user?.id) {
                      console.error("Cannot delete rubric: no user id");
                    } else {
                      const { error } = await supabase
                        .from("rubrics")
                        .delete()
                        .eq("id", rubricIdPendingDelete)
                        .eq("user_id", user.id);

                      if (error) {
                        console.error("Error deleting rubric:", error);
                      } else {
                        await refreshRubrics();
                      }
                    }
                  }
                  setShowDeleteDialog(false);
                  setRubricIdPendingDelete(null);
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </SidebarInset>
  );
}
