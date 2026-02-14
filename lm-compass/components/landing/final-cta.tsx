"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { NoiseBackground } from "@/components/ui/noise-background";

export function FinalCTA() {
  return (
    <NoiseBackground
      containerClassName="w-full"
      className="w-full"
      gradientColors={[
        "oklch(0.5971 0.1352 39.8654)",
        "oklch(0.50 0.10 38)",
        "oklch(0.40 0.08 45)",
      ]}
      noiseIntensity={0.10}
      speed={0.04}
    >
      <section className="py-28 md:py-40">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-6 tracking-tight">
            Ready to evaluate objectively?
          </h2>
          <p className="text-lg text-muted-foreground mb-10 max-w-xl mx-auto leading-relaxed">
            Support for OpenAI, Anthropic, Google, Meta, Mistral, and more via
            OpenRouter.
          </p>
          <Link
            href="/chat"
            className="group inline-flex items-center gap-2 px-8 py-4 rounded-full bg-primary text-primary-foreground font-medium text-lg hover:shadow-[0_0_40px_-4px] hover:shadow-primary/50 transition-all duration-300 hover:-translate-y-0.5"
          >
            Get Started with LM Compass
            <ArrowRight className="size-5 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
          <p className="mt-5 text-sm text-muted-foreground">
            Sign up to begin evaluating.
          </p>
        </div>
      </section>
    </NoiseBackground>
  );
}
