"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import {
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from "@/components/sidebar/sidebar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Upload, FileSpreadsheet, X, CheckCircle2 } from "lucide-react";
import Link from "next/link";

// ---------- types ----------
interface ParsedCSV {
  headers: string[];
  rows: Record<string, string>[];
}

// Sentinel value used for "no selection" in the optional Ground Truth dropdown
const NONE_VALUE = "__none__";

export default function NewExperimentPage() {
  const { open } = useSidebar();

  // CSV state
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedCSV | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Mapping state
  const [queryColumn, setQueryColumn] = useState<string>("");
  const [groundTruthColumn, setGroundTruthColumn] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // -------- CSV Parsing --------
  const handleFile = useCallback((selectedFile: File) => {
    // Reset previous state
    setParseError(null);
    setQueryColumn("");
    setGroundTruthColumn("");

    if (!selectedFile.name.endsWith(".csv")) {
      setParseError("Please upload a .csv file.");
      return;
    }

    setFile(selectedFile);

    Papa.parse<Record<string, string>>(selectedFile, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        if (results.errors.length > 0) {
          setParseError(
            `CSV parse error: ${results.errors[0].message} (row ${results.errors[0].row})`
          );
          return;
        }

        const headers = (results.meta.fields ?? []).filter(
          (h) => h.trim() !== ""
        );
        if (headers.length === 0) {
          setParseError("CSV has no headers. Please provide a CSV with a header row.");
          return;
        }

        setParsedData({ headers, rows: results.data });
      },
      error(err) {
        setParseError(`Failed to read file: ${err.message}`);
      },
    });
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

  // -------- Reset --------
  const resetUpload = useCallback(() => {
    setFile(null);
    setParsedData(null);
    setParseError(null);
    setQueryColumn("");
    setGroundTruthColumn("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // -------- Derived data --------
  const previewRows = useMemo(() => {
    if (!parsedData || !queryColumn) return [];
    return parsedData.rows.slice(0, 5).map((row) => {
      const mapped: Record<string, string> = {
        query: row[queryColumn] ?? "",
      };
      if (groundTruthColumn && groundTruthColumn !== NONE_VALUE) {
        mapped.ground_truth = row[groundTruthColumn] ?? "";
      }
      return mapped;
    });
  }, [parsedData, queryColumn, groundTruthColumn]);

  const mappedData = useMemo(() => {
    if (!parsedData || !queryColumn) return [];
    return parsedData.rows.map((row) => {
      const mapped: Record<string, string> = {
        query: row[queryColumn] ?? "",
      };
      if (groundTruthColumn && groundTruthColumn !== NONE_VALUE) {
        mapped.ground_truth = row[groundTruthColumn] ?? "";
      }
      return mapped;
    });
  }, [parsedData, queryColumn, groundTruthColumn]);

  const isMappingComplete = queryColumn !== "";

  // -------- Confirm handler --------
  const handleConfirm = useCallback(() => {
    if (mappedData.length === 0) return;
    console.log("--- Mapped Experiment Data ---");
    console.log(JSON.stringify(mappedData, null, 2));
    console.log(`Total rows: ${mappedData.length}`);
  }, [mappedData]);

  // -------- Available column options (prevent same column in both dropdowns) --------
  const queryColumnOptions = parsedData?.headers ?? [];
  const groundTruthColumnOptions = useMemo(() => {
    return (parsedData?.headers ?? []).filter((h) => h !== queryColumn);
  }, [parsedData, queryColumn]);

  return (
    <SidebarInset>
      <div className="h-screen flex flex-col">
        {/* ===== Header ===== */}
        <header className="flex-shrink-0 flex items-center gap-4 p-4 sm:p-6 border-b border-border">
          {!open && <SidebarTrigger />}
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="size-4 mr-2" />
              Back to Chat
            </Button>
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex-1">
            New Experiment
          </h1>
        </header>

        {/* ===== Content ===== */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="max-w-3xl mx-auto space-y-8">
            {/* ---------- Step 1: Upload ---------- */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center size-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  1
                </span>
                <h2 className="text-lg font-semibold">Upload CSV</h2>
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
                      ${
                        isDragOver
                          ? "border-primary bg-primary/5"
                          : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
                      }
                    `}
                  >
                    <Upload className="size-10 text-muted-foreground" />
                    <div className="text-center">
                      <p className="text-sm font-medium">
                        Drag & drop your CSV here, or{" "}
                        <span className="text-primary underline underline-offset-2">
                          click to browse
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Only .csv files are supported
                      </p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
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
                      {parsedData.rows.length} rows &middot;{" "}
                      {parsedData.headers.length} columns
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

            {/* ---------- Step 2: Column Mapping ---------- */}
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
                  {/* Query Column (Required) */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Query Column{" "}
                      <span className="text-destructive">*</span>
                    </label>
                    <Select
                      value={queryColumn}
                      onValueChange={(val) => {
                        setQueryColumn(val);
                        // Clear ground truth if it conflicts
                        if (groundTruthColumn === val) {
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

            {/* ---------- Step 3: Preview ---------- */}
            {parsedData && isMappingComplete && (
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center size-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    3
                  </span>
                  <h2 className="text-lg font-semibold">Preview</h2>
                </div>

                <p className="text-sm text-muted-foreground">
                  Showing the first {Math.min(5, previewRows.length)} of{" "}
                  {parsedData.rows.length} rows.
                </p>

                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/60">
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-10">
                            #
                          </th>
                          <th className="text-left px-4 py-2.5 font-medium">
                            Query
                          </th>
                          {groundTruthColumn &&
                            groundTruthColumn !== NONE_VALUE && (
                              <th className="text-left px-4 py-2.5 font-medium">
                                Ground Truth
                              </th>
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
                            {groundTruthColumn &&
                              groundTruthColumn !== NONE_VALUE && (
                                <td className="px-4 py-2.5 max-w-md">
                                  <span className="line-clamp-2">
                                    {row.ground_truth}
                                  </span>
                                </td>
                              )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Confirm button */}
                <div className="flex justify-end pt-2">
                  <Button onClick={handleConfirm} className="gap-2">
                    <CheckCircle2 className="size-4" />
                    Confirm Mapping
                    <span className="text-xs opacity-70">
                      ({mappedData.length} rows)
                    </span>
                  </Button>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}
