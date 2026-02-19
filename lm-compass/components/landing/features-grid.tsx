"use client";

import React from "react";
import { motion } from "framer-motion";
import { Zap, Search, Ruler, Trophy, UserCheck, BarChart3 } from "lucide-react";

const features = [
  {
    icon: Zap,
    title: "Multi-Model Comparison",
    description:
      "Query 50+ LLMs simultaneously via OpenRouter. Compare responses side-by-side.",
  },
  {
    icon: Search,
    title: "LLM-as-a-Judge",
    description:
      "Automated cross-evaluation where models assess each other's responses.",
  },
  {
    icon: Ruler,
    title: "Custom Rubrics",
    description:
      "Define your own evaluation criteria for any use case or domain.",
  },
  {
    icon: Trophy,
    title: "Consensus Rankings",
    description:
      "Score-based grading with consensus-driven winner determination.",
  },
  {
    icon: UserCheck,
    title: "Human Feedback",
    description:
      "Override system decisions when needed. RL4F is built right in.",
  },
  {
    icon: BarChart3,
    title: "Batch Experiments",
    description: "Upload datasets for large-scale evaluations across models.",
  },
];

export function FeaturesGrid() {
  return (
    <section id="features" className="py-20 md:py-32">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px 0px -40px 0px" }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <p
            className="inline-block text-xs font-semibold text-white/95 mb-6 tracking-[0.2em] uppercase px-5 py-2 rounded-full border border-[#ea580c]/40"
            style={{
              background: "rgba(234,88,12,0.18)",
              boxShadow:
                "0 0 0 1px rgba(234,88,12,0.12) inset, 0 4px 16px -2px rgba(234,88,12,0.35)",
            }}
          >
            Features
          </p>
          <h2 className="text-3xl md:text-5xl font-bold mb-4 tracking-tight font-heading bg-gradient-to-b from-white from-15% to-white/75 to-85% bg-clip-text text-transparent">
            Why LM Compass?
          </h2>
          <p className="text-lg text-white/75 max-w-xl mx-auto">
            Built for researchers who need objectivity, not marketing
            benchmarks.
          </p>
        </motion.div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.45,
                ease: [0.25, 0.46, 0.45, 0.94],
                delay: index * 0.06,
              }}
              viewport={{ once: true, margin: "-40px 0px -40px 0px" }}
              className="group relative p-6 rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1"
              style={{
                background:
                  "linear-gradient(135deg, rgba(234,88,12,0.04) 0%, rgba(255,255,255,0.04) 30%, rgba(255,255,255,0.02) 60%, rgba(0,0,0,0.15) 100%)",
                boxShadow: "0 0 0 1px rgba(255,255,255,0.04) inset",
              }}
            >
              {/* Top edge: gradient + glow that fades to nothing at ends (like container scroll) */}
              <div className="absolute left-0 right-0 top-0 z-10">
                <div
                  className="absolute inset-x-0 -top-px h-3 rounded-t-2xl opacity-90"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent 0%, rgba(194,65,12,0.08) 20%, rgba(234,88,12,0.35) 50%, rgba(194,65,12,0.08) 80%, transparent 100%)",
                    filter: "blur(6px)",
                  }}
                />
                <div
                  className="relative h-[1.5px] rounded-t-2xl"
                  style={{
                    background:
                      "linear-gradient(135deg, transparent 0%, rgba(194,65,12,0.08) 20%, rgba(234,88,12,0.35) 50%, rgba(194,65,12,0.08) 80%, transparent 100%)",
                  }}
                />
              </div>
              {/* Very subtle orange tint spread across card, low opacity */}
              <div
                className="pointer-events-none absolute inset-0 rounded-2xl"
                style={{
                  background:
                    "linear-gradient(160deg, rgba(234,88,12,0.06) 0%, transparent 35%, rgba(255,255,255,0.03) 70%, rgba(0,0,0,0.03) 100%)",
                }}
              />
              {/* Glass-like overlay */}
              <div
                className="pointer-events-none absolute inset-0 rounded-2xl"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 35%, rgba(0,0,0,0.04) 100%)",
                }}
              />
              <div className="relative z-10">
                <div className="size-11 rounded-xl bg-[rgba(234,88,12,0.15)] flex items-center justify-center mb-5 group-hover:bg-[rgba(234,88,12,0.22)] transition-colors duration-300">
                  <feature.icon className="size-5 text-[#ea580c]" />
                </div>
                <h3 className="text-base font-semibold text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-white/70 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
