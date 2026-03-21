"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { HITLPhase2Result } from "@/lib/evaluation";
import type { Message as MessageType } from "@/lib/types";

type HITLFormProps = {
  message: MessageType;
  previousUserContent: string;
  onPhase2Complete: (messageId: string, result: HITLPhase2Result) => void;
};

export function HITLForm({
  message,
  previousUserContent,
  onPhase2Complete,
}: HITLFormProps) {
  const hitl = message.evaluationMetadata?.hitlPhase1;
  const rubric = message.evaluationMetadata?.hitlRubric ?? "";
  const questions = hitl?.questionsAndDrafts?.questions ?? [];
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saveRubric, setSaveRubric] = React.useState(false);
  const [rubricTitle, setRubricTitle] = React.useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !hitl?.firstGraderName ||
      !hitl?.firstGraderResult ||
      !hitl?.questionsAndDrafts ||
      !message.multiResults?.length
    ) {
      setError("Missing HITL data.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/chat/hitl-phase2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          example: {
            prompt: previousUserContent,
            response: message.multiResults[0].content,
          },
          rubric,
          firstGraderName: hitl.firstGraderName,
          firstGraderResult: hitl.firstGraderResult,
          questionsAndDrafts: hitl.questionsAndDrafts,
          humanAnswers: answers,
          modelNames: message.multiResults.map((r) => r.model),
          saveRubric,
          rubricTitle,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? res.statusText);
      }
      const result: HITLPhase2Result = await res.json();
      onPhase2Complete(message.id, result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Phase 2 failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (questions.length === 0) return null;

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border bg-muted/30 p-4 space-y-4 max-w-2xl"
    >
      <p className="text-sm font-medium text-muted-foreground">
        Grader disagreement was high. Please answer these to refine the rubric:
      </p>
      {questions.map((q, i) => (
        <div key={i} className="space-y-2">
          <label htmlFor={`hitl-q-${i}`} className="text-sm font-medium">
            Q{i + 1}: {q}
          </label>
          <Input
            id={`hitl-q-${i}`}
            value={answers[String(i)] ?? ""}
            onChange={(e) =>
              setAnswers((prev) => ({ ...prev, [String(i)]: e.target.value }))
            }
            placeholder={`Answer ${i + 1}`}
            className="bg-background"
          />
        </div>
      ))}
      {hitl?.questionsAndDrafts?.draft_rubric_changes && (
        <p className="text-xs text-muted-foreground">
          Suggested rubric change: {hitl.questionsAndDrafts.draft_rubric_changes}
        </p>
      )}
      <div className="rounded-md border bg-background/40 p-3 space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={saveRubric}
            onChange={(e) => setSaveRubric(e.target.checked)}
          />
          Save updated rubric to my rubrics
        </label>
        {saveRubric && (
          <div className="space-y-2">
            <label htmlFor="hitl-rubric-title" className="text-xs font-medium text-muted-foreground">
              Rubric title (optional)
            </label>
            <Input
              id="hitl-rubric-title"
              value={rubricTitle}
              onChange={(e) => setRubricTitle(e.target.value)}
              placeholder="e.g. HITL rubric - math tutoring"
              className="bg-background"
            />
          </div>
        )}
      </div>
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
      <Button type="submit" disabled={submitting}>
        {submitting ? "Updating rubric…" : "Submit & update rubric"}
      </Button>
    </form>
  );
}
