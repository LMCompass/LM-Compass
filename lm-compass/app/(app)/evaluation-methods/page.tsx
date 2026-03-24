"use client";

import Link from "next/link";
import {
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from "@/components/sidebar/sidebar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Info, CheckCircle2, AlertTriangle } from "lucide-react";
import { Separator } from "@/components/ui/separator";

const EVALUATION_METHODS = [
  {
    id: "prompt-based",
    name: "Prompt-based scoring",
    badge: "n² cross-evaluation",
    description:
      "Each model scores every other model’s response individually using your rubric. Scores are averaged to pick a winner and surface ties.",
    bestFor: [
      "Medium-sized model sets where you want rich cross-evaluation",
      "Cases where fairness and robustness matter more than cost",
    ],
    pros: [
      "Most statistically rich: full pairwise cross-evaluation",
      "Reduces single-judge bias by aggregating many independent scores",
      "Clear, per-judge reasoning for every candidate",
    ],
    cons: [
      "n² cost and latency as you add more models",
      "Higher token usage compared to one-shot methods",
    ],
  },
  {
    id: "n-prompt-based",
    name: "One-Shot Prompt-based scoring",
    badge: "n cross-evaluation",
    description:
      "Each model evaluates all other models in a single prompt. The judge returns all scores and justifications for every candidate in a single response.",
    bestFor: [
      "Larger model sets where n² is too expensive",
      "Fast, still rubric-based comparisons across many models",
    ],
    pros: [
      "n calls instead of n², reducing latency and cost",
      "Still benefits from cross-evaluation and your custom rubric",
      "Keeps per-model reasoning while batching work",
    ],
    cons: [
      "Very long prompts when many models are compared at once",
      "Judgments can be more correlated because all candidates appear together",
    ],
  },
  {
    id: "rl4f",
    name: "Rationale-Based Self-Critique Loops (RL4F)",
    badge: "iterative refinement",
    description:
      "Builds on prompt-based n² scoring, then asks judges to critique and revise their own evaluations over one or more refinement iterations.",
    bestFor: [
      "High-stakes evaluations where calibration matters",
      "Research workflows where you want to inspect how judgments change",
    ],
    pros: [
      "Encourages models to self-correct overly harsh or lenient scores",
      "Improves consistency with explicit critique and revision steps",
      "Provides iteration history and critique text for deeper analysis",
    ],
    cons: [
      "More API calls and tokens due to refinement loops",
      "Slower end‑to‑end evaluations than simple prompt-based scoring",
      "Slightly more complex to explain to non-technical stakeholders",
    ],
  },
  {
    id: "hitl",
    name: "Human-in-the-loop (HITL) rubric refinement",
    badge: "human + LLM",
    description:
      "Uses LLM graders and cross-evaluation to detect ambiguous cases, then asks you targeted questions to refine the rubric and re‑grade with the updated version.",
    bestFor: [
      "Designing or refining rubrics for new tasks or domains",
      "Handling ambiguous edge cases where human judgment is critical",
    ],
    pros: [
      "Brings a human into the loop exactly when graders disagree",
      "Turns disagreement into concrete rubric improvements",
      "Produces an updated rubric that can be reused for future runs",
    ],
    cons: [
      "Requires human time to answer clarification questions",
      "More overhead per example, not ideal for fully automated bulk runs",
      "Two‑phase flow (Phase 1 + Phase 2) adds process complexity",
    ],
  },
] as const;

export default function EvaluationMethodsPage() {
  const { open } = useSidebar();

  return (
    <SidebarInset>
      <div className="h-screen flex flex-col">
        <header className="flex-shrink-0 flex items-center gap-4 p-4 sm:p-6 border-b border-border">
          {!open && <SidebarTrigger />}
          <Link href="/chat">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="size-4 mr-2" />
              Back to Chat
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Evaluation methods
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Understand how each method works, when to use it, and the trade‑offs between speed, cost, and rigor.
            </p>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto space-y-8">
            <section className="rounded-xl border border-border/60 bg-card/60 shadow-sm backdrop-blur-sm p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-full bg-primary/10 text-primary p-1.5">
                  <Info className="size-4" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-sm font-semibold tracking-tight">
                    Choosing the right method
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    All methods use the same core idea: models judge other models using your rubric. The main differences are how many evaluation calls are made, whether models refine their own judgments, and whether a human is involved when graders disagree.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    If you are unsure where to start,{" "}
                    <span className="font-semibold text-foreground">
                      Prompt-based scoring
                    </span>{" "}
                    is a good default for smaller model sets, and{" "}
                    <span className="font-semibold text-foreground">
                      One-Shot Prompt-based scoring
                    </span>{" "}
                    is a better fit when you are evaluating many models at once.
                  </p>
                </div>
              </div>
            </section>

            <section className="grid gap-6 md:grid-cols-2">
              {EVALUATION_METHODS.map((method) => (
                <article
                  key={method.id}
                  className="rounded-xl border border-border/60 bg-card/60 shadow-sm backdrop-blur-sm p-5 sm:p-6 flex flex-col gap-4"
                >
                  <header className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base sm:text-lg font-semibold leading-tight">
                        {method.name}
                      </h2>
                      <span className="inline-flex items-center rounded-full border border-border/70 bg-background/60 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {method.badge}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {method.description}
                    </p>
                  </header>

                  <Separator className="my-1" />

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-500">
                        <CheckCircle2 className="size-3.5" />
                        Pros
                      </div>
                      <ul className="list-disc list-inside space-y-1.5 text-sm text-muted-foreground">
                        {method.pros.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-500">
                        <AlertTriangle className="size-3.5" />
                        Trade‑offs
                      </div>
                      <ul className="list-disc list-inside space-y-1.5 text-sm text-muted-foreground">
                        {method.cons.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="mt-auto pt-2 border-t border-border/60">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                      Best when
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground">
                      {method.bestFor.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </article>
              ))}
            </section>
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}

