"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ContainerScroll } from "@/components/ui/container-scroll-animation";
import { NoiseBackground } from "@/components/ui/noise-background";

export function Hero() {
  return (
    <NoiseBackground
      containerClassName="w-full"
      className="w-full"
      gradientColors={[
        "oklch(0.5971 0.1352 39.8654)",
        "oklch(0.75 0.12 55)",
        "oklch(0.60 0.08 30)",
      ]}
      noiseIntensity={0.12}
      speed={0.04}
    >
      <ContainerScroll
        titleComponent={
          <div className="flex flex-col items-center gap-8 pt-12">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary text-sm font-medium">
              <span className="size-1.5 rounded-full bg-primary animate-pulse" />
              Open-source LLM evaluation platform
            </div>
            <h1 className="text-5xl md:text-7xl font-bold text-foreground text-center leading-[1.1] tracking-tight">
              Find the Best LLM Response,{" "}
              <span className="bg-gradient-to-r from-primary via-chart-2 to-primary bg-clip-text text-transparent bg-[length:200%_auto] animate-[shimmer-text_3s_ease-in-out_infinite]">
                Objectively.
              </span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground text-center max-w-2xl leading-relaxed">
              Cross-evaluate models using LLM-as-a-Judge methodology.
              <br className="hidden md:block" />
              No bias, no guesswork — just consensus.
            </p>
            <div className="flex items-center gap-4 mt-4 mb-8">
              <Link
                href="/chat"
                className="group relative inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-primary text-primary-foreground font-medium hover:shadow-[0_0_32px_-4px] hover:shadow-primary/40 transition-all duration-300 hover:-translate-y-0.5"
              >
                Start Evaluating
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
              </Link>
              <button
                onClick={() => {
                  document
                    .getElementById("features")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
                className="px-7 py-3.5 rounded-full border border-border/80 text-foreground font-medium hover:bg-accent/50 hover:border-border transition-all duration-300"
              >
                Learn More
              </button>
            </div>
          </div>
        }
      >
        {/* App interface mockup */}
        <div className="h-full w-full flex flex-col bg-background rounded-lg overflow-hidden">
          {/* Mock header */}
          <div className="flex items-center gap-3 p-4 border-b border-border/60">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/80 text-sm text-foreground/70">
              <span className="size-2 rounded-full bg-chart-1" />
              GPT-4o
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/80 text-sm text-foreground/70">
              <span className="size-2 rounded-full bg-chart-2" />
              Claude 3.5
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/80 text-sm text-foreground/70">
              <span className="size-2 rounded-full bg-chart-3" />
              Gemini Pro
            </div>
            <div className="flex-1" />
            <div className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-sm font-medium">
              LLM-as-a-Judge
            </div>
          </div>

          {/* Mock chat area */}
          <div className="flex-1 p-6 space-y-4 overflow-hidden">
            {/* User message */}
            <div className="flex justify-end">
              <div className="max-w-[70%] px-4 py-3 rounded-2xl bg-primary text-primary-foreground text-sm">
                Compare the trade-offs between microservices and monolithic architecture for a startup.
              </div>
            </div>

            {/* Model responses */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { name: "GPT-4o", color: "chart-1", rank: "#1" },
                { name: "Claude 3.5", color: "chart-2", rank: "#2" },
                { name: "Gemini Pro", color: "chart-3", rank: "#3" },
              ].map((model) => (
                <div
                  key={model.name}
                  className="p-3 rounded-xl border border-border/60 bg-card space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <span className={`size-2 rounded-full bg-${model.color}`} />
                    <span className="text-xs font-medium text-foreground">
                      {model.name}
                    </span>
                    <span
                      className={`ml-auto text-xs px-1.5 py-0.5 rounded bg-${model.color}/10 text-${model.color} font-medium`}
                    >
                      {model.rank}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted/60 w-full" />
                  <div className="h-2 rounded-full bg-muted/60 w-4/5" />
                  <div className="h-2 rounded-full bg-muted/60 w-3/5" />
                </div>
              ))}
            </div>

            {/* Consensus bar */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/15">
              <span className="text-xs font-medium text-primary">
                Consensus Winner:
              </span>
              <span className="text-xs font-bold text-foreground">GPT-4o</span>
              <span className="text-xs text-muted-foreground">
                — Score: 8.7/10
              </span>
            </div>
          </div>

          {/* Mock input */}
          <div className="p-4 border-t border-border/60">
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-secondary/60">
              <span className="text-sm text-muted-foreground">
                Enter your prompt...
              </span>
              <div className="ml-auto size-8 rounded-lg bg-primary/15 flex items-center justify-center">
                <svg
                  className="size-4 text-primary"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </ContainerScroll>
    </NoiseBackground>
  );
}
