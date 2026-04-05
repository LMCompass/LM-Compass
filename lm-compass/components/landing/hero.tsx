"use client";

import React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ContainerScroll } from "@/components/ui/container-scroll-animation";
import { Spotlight } from "@/components/ui/spotlight-new";

export function Hero() {
  return (
    <div className="relative min-h-[85vh]">
      <Spotlight
        gradientFirst="radial-gradient(68.54% 68.72% at 55.02% 31.46%, hsla(24, 90%, 55%, .12) 0, hsla(24, 90%, 48%, .04) 50%, hsla(24, 85%, 45%, 0) 80%)"
        gradientSecond="radial-gradient(50% 50% at 50% 50%, hsla(24, 90%, 55%, .08) 0, hsla(24, 90%, 48%, .03) 80%, transparent 100%)"
        gradientThird="radial-gradient(50% 50% at 50% 50%, hsla(24, 90%, 55%, .05) 0, hsla(24, 90%, 48%, .02) 80%, transparent 100%)"
      />
      <div className="relative z-10">
        <ContainerScroll
          titleComponent={
            <div className="flex flex-col items-center gap-8 pt-42 md:pt-32 pb-4">
              <div
                className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-white/95 text-sm font-medium tracking-wide border border-[#ea580c]/40"
                style={{
                  background: "rgba(234,88,12,0.18)",
                  boxShadow:
                    "0 0 0 1px rgba(234,88,12,0.12) inset, 0 4px 16px -2px rgba(234,88,12,0.35)",
                }}
              >
                <span className="size-2 rounded-full bg-[#ea580c] animate-pulse shadow-[0_0_8px_rgba(234,88,12,0.6)]" />
                Open-source LLM evaluation platform
              </div>
              <h1 className="text-5xl md:text-7xl font-bold text-center leading-[1.1] tracking-tight font-heading bg-gradient-to-b from-white from-10% to-gray-400 to-90% bg-clip-text text-transparent">
                Find the Best LLM Response{" "}
                <span className="bg-gradient-to-r from-[#ea580c] via-[#ff8c4e] to-[#ea580c] bg-clip-text text-transparent bg-[length:200%_auto] animate-[shimmer-text_3s_ease-in-out_infinite]">
                  for Your Data
                </span>
              </h1>
              <p className="text-lg md:text-xl text-white/75 text-center max-w-2xl leading-relaxed">
                Cross-evaluate models using LLM-as-a-Judge methodology.
                <br className="hidden md:block" />
                No bias, no guesswork — just consensus.
              </p>
              <div className="flex items-center gap-4 mt-4 mb-16 md:mb-20">
                <Link
                  href="/chat"
                  className="group relative inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-[#c2410c] text-white font-medium shadow-[0_4px_20px_-2px_rgba(194,65,12,0.5),0_6px_24px_-4px_rgba(194,65,12,0.35)] hover:shadow-[0_8px_28px_-2px_rgba(194,65,12,0.55),0_12px_32px_-4px_rgba(194,65,12,0.4)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#ea580c]"
                >
                  Start Evaluating
                  <ArrowUpRight className="size-5 transition-transform duration-300 group-hover:rotate-[45deg]" />
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    document
                      .getElementById("features")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="inline-flex items-center justify-center px-7 py-3.5 rounded-full bg-white/8 text-white font-medium border border-white/15 hover:bg-white/12 hover:border-white/25 transition-all duration-300 cursor-pointer"
                >
                  Learn More
                </button>
              </div>
            </div>
          }
        >
          <div className="h-full w-full flex flex-col bg-background rounded-lg overflow-hidden shadow-[0_4px_20px_-4px_rgba(0,0,0,0.2),0_8px_32px_-8px_rgba(0,0,0,0.12)]">
            <div className="flex items-center gap-3 p-4 border-b border-border/60">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/80 text-sm text-foreground/70">
                <span className="size-2 rounded-full bg-chart-1" />
                GPT-5.4
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/80 text-sm text-foreground/70">
                <span className="size-2 rounded-full bg-chart-2" />
                Claude Sonnet 4.6
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/80 text-sm text-foreground/70">
                <span className="size-2 rounded-full bg-chart-3" />
                Gemini 3.1 Pro
              </div>
              <div className="flex-1" />
              <div className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-sm font-medium">
                LLM-as-a-Judge
              </div>
            </div>

            <div className="flex-1 p-6 space-y-4 overflow-hidden">
              <div className="flex justify-end">
                <div className="max-w-[70%] px-4 py-3 rounded-2xl bg-primary text-primary-foreground text-sm">
                  Compare the trade-offs between microservices and monolithic
                  architecture for a startup.
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  { name: "Gemini 3.1 Pro", color: "chart-3", rank: "#1" },
                  { name: "Claude Sonnet 4.6", color: "chart-2", rank: "#2" },
                  { name: "GPT-5.4", color: "chart-1", rank: "#3" },
                ].map(
                  (model: { name: string; color: string; rank: string }) => (
                    <div
                      key={model.name}
                      className="p-3 rounded-xl border border-border/60 bg-card space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`size-2 rounded-full bg-${model.color}`}
                        />
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
                  ),
                )}
              </div>

              <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/15">
                <span className="text-xs font-medium text-primary">
                  Consensus Winner:
                </span>
                <span className="text-xs font-bold text-foreground">
                  Gemini 3.1 Pro
                </span>
                <span className="text-xs text-white/70">— Score: 8.7/10</span>
              </div>
            </div>

            <div className="p-4 border-t border-border/60">
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-secondary/60">
                <span className="text-sm text-white/60">
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
      </div>
    </div>
  );
}
