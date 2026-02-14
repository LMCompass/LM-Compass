"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  Zap,
  Search,
  Ruler,
  Trophy,
  UserCheck,
  BarChart3,
} from "lucide-react";

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
    description:
      "Upload datasets for large-scale evaluations across models.",
  },
];

export function FeaturesGrid() {
  return (
    <section id="features" className="py-20 md:py-32">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-sm font-medium text-primary mb-3 tracking-wide uppercase">
            Features
          </p>
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4 tracking-tight">
            Why LM Compass?
          </h2>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Built for researchers who need objectivity, not marketing benchmarks.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.08 }}
              viewport={{ once: true }}
              className="group relative p-6 rounded-2xl border border-border/60 bg-card/30 hover:bg-card/60 hover:border-border hover:shadow-lg hover:shadow-primary/[0.03] hover:-translate-y-1 transition-all duration-300"
            >
              <div className="size-11 rounded-xl bg-primary/10 flex items-center justify-center mb-5 group-hover:bg-primary/15 transition-colors duration-300">
                <feature.icon className="size-5 text-primary" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
