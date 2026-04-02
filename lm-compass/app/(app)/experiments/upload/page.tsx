"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { parquetReadObjects, parquetMetadataAsync, parquetSchema } from "hyparquet";
import {
  SidebarInset,
  SidebarTrigger,
} from "@/components/sidebar/sidebar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  X,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useExperiments } from "@/contexts/experiments-context";
import { MultiModelSelector } from "@/components/ui/multi-model-selector";
import { IterationsSelector } from "@/components/ui/iterations-selector";
import { RubricSelector } from "@/components/ui/rubric-selector";
import type {
  ExperimentCostEstimate,
  ExperimentEvaluationMethod,
  MappedRow,
} from "@/lib/types";
import {
  ALLOWED_EXPERIMENT_EVAL_METHODS,
  DEFAULT_EXPERIMENT_ITERATIONS,
  DEFAULT_EVAL_METHOD,
  DEFAULT_RUBRIC_ID,
  MAX_EXPERIMENT_MODELS,
  MIN_EXPERIMENT_MODELS,
  isExperimentEvaluationMethod,
  validateSelectedModelsCount,
} from "@/lib/experiments";

interface ParsedCSV {
  headers: string[];
  rows: Record<string, string>[];
}

type RubricOption = {
  id: string;
  title: string;
};

const NONE_VALUE = "__none__";

const EVALUATION_METHOD_LABELS: Record<ExperimentEvaluationMethod, string> = {
  "prompt-based": "Prompt-based scoring",
  "n-prompt-based": "One-Shot Prompt-based scoring",
  "rl4f": "Rationale Based Self Critique Loops",
};

function formatNumber(value: number, maxDigits = 2) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: maxDigits,
  }).format(value);
}

function formatCurrency(value: number) {
  if (value > 0 && value < 0.0001) {
    return "<$0.0001";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value);
}

export default function NewExperimentPage() {
  const router = useRouter();
  const { estimateExperimentCost, startExperiment } = useExperiments();

  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedCSV | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const [queryColumn, setQueryColumn] = useState<string>("");
  const [groundTruthColumn, setGroundTruthColumn] = useState<string>("");
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectedRubricId, setSelectedRubricId] = useState<string>(DEFAULT_RUBRIC_ID);
  const [selectedEvaluationMethod, setSelectedEvaluationMethod] =
    useState<ExperimentEvaluationMethod>(DEFAULT_EVAL_METHOD);
  const [iterations, setIterations] = useState<number>(DEFAULT_EXPERIMENT_ITERATIONS);

  const [estimate, setEstimate] = useState<ExperimentCostEstimate | null>(null);
  const [isEstimateOpen, setIsEstimateOpen] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const latestFileRef = useRef<File | null>(null);

  const handleFile = useCallback((selectedFile: File) => {
    setParseError(null);
    setSubmitError(null);
    setSubmitSuccess(null);
    setEstimate(null);
    setIsEstimateOpen(false);
    setQueryColumn("");
    setGroundTruthColumn("");

    const name = selectedFile.name.toLowerCase();
    const isCsv = name.endsWith(".csv");
    const isParquet = name.endsWith(".parquet") || name.endsWith(".pqt");

    if (!isCsv && !isParquet) {
      setParseError("Please upload a .csv, .parquet, or .pqt file.");
      return;
    }

    if (selectedFile.size === 0) {
      setParseError("File is empty. Please upload a non-empty dataset.");
      return;
    }

    setFile(selectedFile);
    latestFileRef.current = selectedFile;

    if (isCsv) {
      Papa.parse<Record<string, string>>(selectedFile, {
        header: true,
        skipEmptyLines: true,
        complete(results) {
          if (latestFileRef.current !== selectedFile) return;

          if (results.errors.length > 0) {
            setParseError(
              `CSV parse error: ${results.errors[0].message} (row ${results.errors[0].row})`
            );
            return;
          }

          const headers = (results.meta.fields ?? []).filter(
            (header) => header.trim() !== ""
          );
          if (headers.length === 0) {
            setParseError("CSV has no headers. Please provide a CSV with a header row.");
            return;
          }

          setParsedData({ headers, rows: results.data });
        },
        error(err) {
          if (latestFileRef.current !== selectedFile) return;
          setParseError(`Failed to read file: ${err.message}`);
        },
      });
    } else {
      // Parquet file
      (async () => {
        try {
          const arrayBuffer = await selectedFile.arrayBuffer();
          if (latestFileRef.current !== selectedFile) return;

          const metadata = await parquetMetadataAsync(arrayBuffer);
          const schema = parquetSchema(metadata);
          const headers = schema.children.map((c) => c.element.name);

          if (headers.length === 0) {
            setParseError("Parquet file has no columns.");
            return;
          }

          const data = await parquetReadObjects({ file: arrayBuffer });
          if (latestFileRef.current !== selectedFile) return;

          const rows: Record<string, string>[] = data.map((row) => {
            const stringRow: Record<string, string> = {};
            for (const key of headers) {
              const val = row[key];
              stringRow[key] = val == null ? "" : String(val);
            }
            return stringRow;
          });

          setParsedData({ headers, rows });
        } catch (err) {
          if (latestFileRef.current !== selectedFile) return;
          setParseError(
            `Failed to read Parquet file: ${err instanceof Error ? err.message : "Unknown error"}`
          );
        }
      })();
    }
  }, []);

  // -------- Drag & Drop handlers --------
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) handleFile(droppedFile);
    },
    [handleFile]
  );

  const onFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (selected) handleFile(selected);
    },
    [handleFile]
  );

  const resetUpload = useCallback(() => {
    setFile(null);
    setParsedData(null);
    setParseError(null);
    setSubmitError(null);
    setSubmitSuccess(null);
    setEstimate(null);
    setIsEstimateOpen(false);
    setQueryColumn("");
    setGroundTruthColumn("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const previewRows = useMemo(() => {
    if (!parsedData || !queryColumn) {
      return [];
    }

    return parsedData.rows.slice(0, 5).map((row) => {
      const mapped: MappedRow = {
        query: row[queryColumn] ?? "",
      };

      if (groundTruthColumn && groundTruthColumn !== NONE_VALUE) {
        mapped.ground_truth = row[groundTruthColumn] ?? "";
      }

      return mapped;
    });
  }, [parsedData, queryColumn, groundTruthColumn]);

  const mappedData = useMemo(() => {
    if (!parsedData || !queryColumn) {
      return [];
    }

    return parsedData.rows.map((row) => {
      const mapped: MappedRow = {
        query: row[queryColumn] ?? "",
      };

      if (groundTruthColumn && groundTruthColumn !== NONE_VALUE) {
        mapped.ground_truth = row[groundTruthColumn] ?? "";
      }

      return mapped;
    });
  }, [parsedData, queryColumn, groundTruthColumn]);

  const isMappingComplete = queryColumn !== "";
  const queryColumnOptions = parsedData?.headers ?? [];
  const groundTruthColumnOptions = useMemo(() => {
    return (parsedData?.headers ?? []).filter((header) => header !== queryColumn);
  }, [parsedData, queryColumn]);

  const defaultTitle = useMemo(() => {
    if (!file?.name) {
      return "";
    }
    return file.name.replace(/\.(csv|parquet|pqt)$/i, "").trim();
  }, [file?.name]);

  const hasValidModelCount = useMemo(
    () => validateSelectedModelsCount(selectedModels),
    [selectedModels]
  );

  const isConfigurationComplete = useMemo(() => {
    return (
      hasValidModelCount &&
      selectedRubricId.trim().length > 0 &&
      isExperimentEvaluationMethod(selectedEvaluationMethod)
    );
  }, [hasValidModelCount, selectedEvaluationMethod, selectedRubricId]);

  const handleOpenEstimate = useCallback(async () => {
    if (mappedData.length === 0) {
      return;
    }

    if (!hasValidModelCount) {
      setSubmitError(
        `Select between ${MIN_EXPERIMENT_MODELS} and ${MAX_EXPERIMENT_MODELS} models.`
      );
      return;
    }

    if (!selectedRubricId) {
      setSubmitError("Select a rubric to continue.");
      return;
    }

    if (!isExperimentEvaluationMethod(selectedEvaluationMethod)) {
      setSubmitError("Select a valid evaluation method to continue.");
      return;
    }

    try {
      setIsEstimating(true);
      const nextEstimate = await estimateExperimentCost(
        mappedData,
        selectedModels,
        selectedEvaluationMethod,
        iterations
      );
      setEstimate(nextEstimate);
      setSubmitError(null);
      setSubmitSuccess(null);

      if (nextEstimate.validRows === 0) {
        setSubmitError("No valid rows found. Please ensure at least one query is non-empty.");
        return;
      }

      setIsEstimateOpen(true);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to estimate experiment cost. Please try again.";
      setSubmitError(message);
    } finally {
      setIsEstimating(false);
    }
  }, [
    estimateExperimentCost,
    hasValidModelCount,
    mappedData,
    selectedEvaluationMethod,
    selectedModels,
    selectedRubricId,
    iterations,
  ]);

  const handleStartAction = useCallback(async () => {
    if (mappedData.length === 0 || !isConfigurationComplete) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const result = await startExperiment({
        title: defaultTitle || undefined,
        rows: mappedData,
        selectedModels,
        rubricId: selectedRubricId,
        evaluationMethod: selectedEvaluationMethod,
        iterations,
      });

      setSubmitSuccess(
        `Experiment ${result.experimentId} started and queued. Inserted ${result.insertedRows} row(s), skipped ${result.skippedRows}.`
      );
      setIsEstimateOpen(false);
      router.push(`/experiments/${result.experimentId}`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to create experiment. Please try again.";
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    defaultTitle,
    isConfigurationComplete,
    mappedData,
    router,
    selectedEvaluationMethod,
    selectedModels,
    selectedRubricId,
    iterations,
    startExperiment,
  ]);

  return (
    <SidebarInset>
      <div className="h-screen flex flex-col">
        <header className="flex-shrink-0 flex items-center gap-4 p-4 sm:p-6 border-b border-border">
          <SidebarTrigger className="md:hidden -ml-1 shrink-0" />
          <Link href="/experiments">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="size-4 mr-2" />
              Back to Experiments
            </Button>
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex-1">
            New Experiment
          </h1>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div
            className="max-w-3xl mx-auto space-y-8"
            data-tour-id="experiment-create-flow"
          >
            {submitError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {submitError}
              </div>
            )}

            {submitSuccess && (
              <div className="rounded-lg border border-green-600/30 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
                {submitSuccess}
              </div>
            )}

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center size-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  1
                </span>
                <h2 className="text-lg font-semibold">Upload Dataset</h2>
              </div>

              {!parsedData ? (
                <>
                  <div
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`
                      relative cursor-pointer rounded-lg border-2 border-dashed p-10
                      flex flex-col items-center justify-center gap-3 transition-colors
                      ${isDragOver
                        ? "border-primary bg-primary/5"
                        : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
                      }
                    `}
                  >
                    <Upload className="size-10 text-muted-foreground" />
                    <div className="text-center">
                      <p className="text-sm font-medium">
                        Drag & drop your file here, or{" "}
                        <span className="text-primary underline underline-offset-2">
                          click to browse
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        .csv and .parquet files supported
                      </p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.parquet,.pqt"
                      onChange={onFileInputChange}
                      className="hidden"
                    />
                  </div>

                  {parseError && (
                    <p className="text-sm text-destructive">{parseError}</p>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
                  <FileSpreadsheet className="size-5 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {parsedData.rows.length} rows &middot; {parsedData.headers.length} columns
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetUpload}
                    className="flex-shrink-0"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              )}
            </section>

            {parsedData && (
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center size-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    2
                  </span>
                  <h2 className="text-lg font-semibold">Map Columns</h2>
                </div>

                <p className="text-sm text-muted-foreground">
                  Tell us which columns contain the queries and (optionally) the
                  expected answers.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Query Column <span className="text-destructive">*</span>
                    </label>
                    <Select
                      value={queryColumn}
                      onValueChange={(value) => {
                        setQueryColumn(value);
                        if (groundTruthColumn === value) {
                          setGroundTruthColumn("");
                        }
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select query column" />
                      </SelectTrigger>
                      <SelectContent>
                        {queryColumnOptions.map((header) => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      The column containing the queries/questions to evaluate.
                    </p>
                  </div>

                  {/* Ground Truth Column (Optional) */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Ground Truth Column{" "}
                      <span className="text-muted-foreground text-xs font-normal">
                        (optional)
                      </span>
                    </label>
                    <Select
                      value={groundTruthColumn}
                      onValueChange={setGroundTruthColumn}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_VALUE}>None</SelectItem>
                        {groundTruthColumnOptions.map((header) => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      If your dataset has expected answers/ground truth, select
                      that column here.
                    </p>
                  </div>
                </div>
              </section>
            )}

            {parsedData && isMappingComplete && (
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center size-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    3
                  </span>
                  <h2 className="text-lg font-semibold">Experiment Configuration</h2>
                </div>

                <p className="text-sm text-muted-foreground">
                  Select required models, rubric, and evaluation method.
                </p>

                <div className="space-y-4 rounded-lg border border-border p-4">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium">
                      Models <span className="text-destructive">*</span>
                    </label>
                    <MultiModelSelector
                      values={selectedModels}
                      onChange={setSelectedModels}
                      buttonClassName="w-full justify-between font-normal"
                      popoverClassName="w-[var(--radix-popover-trigger-width)] min-w-[320px]"
                    />
                    <p
                      className={`text-xs ${
                        hasValidModelCount ? "text-muted-foreground" : "text-destructive"
                      }`}
                    >
                      Select between {MIN_EXPERIMENT_MODELS} and {MAX_EXPERIMENT_MODELS} models.
                    </p>
                    {selectedModels.length < 4 ? (
                      <p className="text-xs text-muted-foreground/70">
                        Tip: Select 4+ models to enable Kendall&apos;s Tau-b judge agreement analysis.
                      </p>
                    ) : (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">
                        ✓ Kendall&apos;s Tau-b judge agreement analysis enabled.
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="block text-sm font-medium">
                        Rubric <span className="text-destructive">*</span>
                      </label>
                      <RubricSelector
                        value={selectedRubricId}
                        onChange={setSelectedRubricId}
                        evaluationMethod={selectedEvaluationMethod}
                      />
                      <p className="text-xs text-muted-foreground">
                        Search and select a rubric for this experiment.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-medium">
                        Evaluation Method <span className="text-destructive">*</span>
                      </label>
                      <Select
                        value={selectedEvaluationMethod}
                        onValueChange={(value) => {
                          if (isExperimentEvaluationMethod(value)) {
                            setSelectedEvaluationMethod(value);
                          }
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select evaluation method" />
                        </SelectTrigger>
                        <SelectContent>
                          {ALLOWED_EXPERIMENT_EVAL_METHODS.map((method) => (
                            <SelectItem key={method} value={method}>
                              {EVALUATION_METHOD_LABELS[method]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Select how model responses should be evaluated.
                      </p>
                    </div>
                  </div>

                  {selectedEvaluationMethod === "rl4f" && (
                    <div className="space-y-2">
                      <label className="block text-sm font-medium">
                        Refinement Iterations <span className="text-destructive">*</span>
                      </label>
                      <IterationsSelector value={iterations} onChange={setIterations} />
                      <p className="text-xs text-muted-foreground">
                        Number of self-critique loops per experiment item.
                      </p>
                    </div>
                  )}

                </div>
              </section>
            )}

            {/* ---------- Step 4: Preview ---------- */}
            {parsedData && isMappingComplete && (
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center size-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    4
                  </span>
                  <h2 className="text-lg font-semibold">Preview</h2>
                </div>

                <p className="text-sm text-muted-foreground">
                  Showing the first {Math.min(5, previewRows.length)} of {parsedData.rows.length} rows.
                </p>

                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/60">
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-10">
                            #
                          </th>
                          <th className="text-left px-4 py-2.5 font-medium">Query</th>
                          {groundTruthColumn && groundTruthColumn !== NONE_VALUE && (
                            <th className="text-left px-4 py-2.5 font-medium">Ground Truth</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, idx) => (
                          <tr
                            key={idx}
                            className="border-t border-border hover:bg-muted/30 transition-colors"
                          >
                            <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                              {idx + 1}
                            </td>
                            <td className="px-4 py-2.5 max-w-md">
                              <span className="line-clamp-2">{row.query}</span>
                            </td>
                            {groundTruthColumn && groundTruthColumn !== NONE_VALUE && (
                              <td className="px-4 py-2.5 max-w-md">
                                <span className="line-clamp-2">{row.ground_truth}</span>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    onClick={handleOpenEstimate}
                    className="gap-2"
                    disabled={!isConfigurationComplete || isEstimating}
                  >
                    {isEstimating ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}
                    {isEstimating ? "Estimating..." : "Start Experiment"}
                    <span className="text-xs opacity-70">({mappedData.length} rows)</span>
                  </Button>
                </div>
              </section>
            )}
          </div>
        </div>

        <Dialog
          open={isEstimateOpen}
          onOpenChange={(isOpen) => {
            if (!isSubmitting) {
              setIsEstimateOpen(isOpen);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Estimated Cost</DialogTitle>
              <DialogDescription>
                Live OpenRouter pricing estimate.
              </DialogDescription>
            </DialogHeader>

            {estimate && (
              <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Valid rows</span>
                  <span className="font-medium">{estimate.validRows}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Skipped rows</span>
                  <span className="font-medium">{estimate.skippedRows}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Average chars / row</span>
                  <span className="font-medium">{formatNumber(estimate.avgChars)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Estimated tokens / prompt</span>
                  <span className="font-medium">{formatNumber(estimate.estTokensPerPrompt)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Estimated calls / model / row</span>
                  <span className="font-medium">{estimate.multiplier}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Estimated input tokens</span>
                  <span className="font-medium">{formatNumber(estimate.totalInputTokens)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Estimated output tokens</span>
                  <span className="font-medium">{formatNumber(estimate.totalOutputTokens)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Estimated requests</span>
                  <span className="font-medium">{formatNumber(estimate.totalRequests)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Estimated total tokens</span>
                  <span className="font-medium">{formatNumber(estimate.totalTokens)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-2">
                  <span className="text-muted-foreground">Estimated cost</span>
                  <span className="font-semibold">
                    {estimate.estimatedUsd == null
                      ? "Unavailable"
                      : formatCurrency(estimate.estimatedUsd)}
                  </span>
                </div>
                {estimate.pricingStatus === "unavailable" && (
                  <div className="text-xs text-muted-foreground border-t border-border pt-2">
                    {estimate.pricingError || "Live model pricing is currently unavailable."}
                  </div>
                )}
                {estimate.perModelEstimates.length > 0 && (
                  <div className="space-y-2 border-t border-border pt-3">
                    <p className="text-sm font-medium">Per-model estimate</p>
                    <ul className="space-y-1.5 text-sm">
                      {estimate.perModelEstimates.map((m) => (
                        <li
                          key={m.model}
                          className="flex justify-between gap-2"
                          data-testid="experiment-estimate-per-model-row"
                        >
                          <span className="text-muted-foreground truncate" title={m.model}>
                            {m.model}
                          </span>
                          <span className="font-medium tabular-nums">
                            {m.estimatedUsd == null ? "—" : formatCurrency(m.estimatedUsd)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEstimateOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleStartAction}
                disabled={isSubmitting}
                className="gap-2"
              >
                {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                Start Experiment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </SidebarInset>
  );
}
