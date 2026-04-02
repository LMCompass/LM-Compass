"use client";

import React from "react";
import { motion } from "framer-motion";
import { StickyScroll } from "@/components/ui/sticky-scroll-reveal";
import { Send, GitCompareArrows, BarChart3 } from "lucide-react";

const content = [
  {
    title: "01 — Submit Your Query",
    description:
      "Enter your prompt with optional context. Select which models to compare from 50+ LLMs via OpenRouter — including models from OpenAI, Anthropic, Google, Meta, and Mistral.",
    content: (
      <div className="flex h-full w-full items-center justify-center p-8">
        <div className="w-full space-y-5">
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-xl bg-primary/15 flex items-center justify-center">
              <Send className="size-5 text-primary" />
            </div>
            <span className="text-sm font-semibold text-foreground">
              Query Input
            </span>
          </div>
          <div className="space-y-2.5 mt-4">
            <div className="h-3 rounded-full bg-foreground/8 w-full" />
            <div className="h-3 rounded-full bg-foreground/8 w-4/5" />
          </div>
          <div className="flex gap-2 pt-3">
            {["GPT-5.4", "Claude Sonnet 4.6", "Gemini 3.1 Pro"].map((name) => (
              <div
                key={name}
                className="px-3 py-1.5 rounded-lg bg-foreground/5 border border-white/10 text-white/70 text-xs font-medium"
              >
                {name}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    title: "02 — Models Judge Each Other",
    description:
      "Each model evaluates the others using your choice of research-based evaluation methods and a custom rubric. Consensus emerges from cross-evaluation, not a single opinion — eliminates single-model bias and gives you choice.",
    content: (
      <div className="flex h-full w-full items-center justify-center p-8">
        <div className="w-full space-y-5">
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-xl bg-primary/15 flex items-center justify-center">
              <GitCompareArrows className="size-5 text-primary" />
            </div>
            <span className="text-sm font-semibold text-foreground">
              Cross-Evaluation
            </span>
          </div>
          <div className="relative flex items-center justify-center h-36 mt-2">
            <svg
              className="h-full w-full max-w-[min(100%,18rem)]"
              viewBox="0 0 240 150"
              aria-hidden
            >
              <line
                x1="120"
                y1="30"
                x2="55"
                y2="115"
                className="stroke-foreground/10"
                strokeWidth="1.5"
                strokeDasharray="5 5"
              />
              <line
                x1="120"
                y1="30"
                x2="185"
                y2="115"
                className="stroke-foreground/10"
                strokeWidth="1.5"
                strokeDasharray="5 5"
              />
              <line
                x1="55"
                y1="115"
                x2="185"
                y2="115"
                className="stroke-foreground/10"
                strokeWidth="1.5"
                strokeDasharray="5 5"
              />
              <circle
                cx="120"
                cy="30"
                r="18"
                className="fill-chart-1/15 stroke-chart-1/30"
                strokeWidth="1.5"
              />
              <circle
                cx="55"
                cy="115"
                r="18"
                className="fill-chart-2/15 stroke-chart-2/30"
                strokeWidth="1.5"
              />
              <circle
                cx="185"
                cy="115"
                r="18"
                className="fill-chart-3/15 stroke-chart-3/30"
                strokeWidth="1.5"
              />
              <text
                x="120"
                y="30"
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-chart-1 text-[12px] font-semibold"
              >
                A
              </text>
              <text
                x="55"
                y="115"
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-chart-2 text-[12px] font-semibold"
              >
                B
              </text>
              <text
                x="185"
                y="115"
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-chart-3 text-[12px] font-semibold"
              >
                C
              </text>
            </svg>
          </div>
          <p className="text-xs text-center text-white/70">
            Every model evaluates every other
          </p>
        </div>
      </div>
    ),
  },
  {
    title: "03 — Review & Export Results",
    description:
      "Compare ranked responses, see scores and reasoning from each judge. Human feedback (e.g. RL4F) is one of the evaluation methods you can use; when there's a tie we don't reinforce from any method — you stay in control. Export your findings for further analysis.",
    content: (
      <div className="flex h-full w-full items-center justify-center p-8">
        <div className="w-full space-y-4">
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-xl bg-primary/15 flex items-center justify-center">
              <BarChart3 className="size-5 text-primary" />
            </div>
            <span className="text-sm font-semibold text-foreground">
              Results
            </span>
          </div>
          <div className="space-y-3 mt-2">
            {[
              {
                name: "GPT-5.4",
                width: "87%",
                score: "8.7",
                color: "bg-primary/50",
              },
              {
                name: "Claude Sonnet 4.6",
                width: "82%",
                score: "8.2",
                color: "bg-chart-2/50",
              },
              {
                name: "Gemini 3.1 Pro",
                width: "75%",
                score: "7.5",
                color: "bg-chart-3/50",
              },
            ].map((item) => (
              <div key={item.name} className="flex items-center gap-3">
                <span className="text-xs text-white/70 w-14 font-medium">
                  {item.name}
                </span>
                <div className="flex-1 h-5 rounded-full bg-foreground/5 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${item.color}`}
                    style={{ width: item.width }}
                  />
                </div>
                <span className="text-xs text-foreground font-semibold w-7">
                  {item.score}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
];

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  view: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const },
};

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 md:py-32">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          className="text-center mb-20"
          initial={fadeUp.initial}
          whileInView={fadeUp.view}
          viewport={{ once: true, margin: "-60px 0px -40px 0px" }}
          transition={fadeUp.transition}
        >
          <p
            className="inline-block text-xs font-semibold text-white/95 mb-6 tracking-[0.2em] uppercase px-5 py-2 rounded-full border border-[#ea580c]/40"
            style={{
              background: "rgba(234,88,12,0.18)",
              boxShadow:
                "0 0 0 1px rgba(234,88,12,0.12) inset, 0 4px 16px -2px rgba(234,88,12,0.35)",
            }}
          >
            How It Works
          </p>
          <h2 className="text-3xl md:text-5xl font-bold mb-4 tracking-tight font-heading bg-gradient-to-b from-white from-10% to-gray-400 to-90% bg-clip-text text-transparent">
            Three steps to finding the best response
          </h2>
          <p className="text-lg text-white/75 max-w-lg mx-auto">
            Submit, evaluate, review. It&apos;s that simple.
          </p>
        </motion.div>
        <StickyScroll content={content} />
      </div>
    </section>
  );
}
