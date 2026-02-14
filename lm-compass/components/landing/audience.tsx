"use client";

import React from "react";
import { motion } from "framer-motion";
import { Code2, Building2, GraduationCap } from "lucide-react";

const audiences = [
  {
    icon: Code2,
    title: "Researchers & Developers",
    description: "Compare LLMs and SLMs objectively with custom rubrics and automated evaluation.",
  },
  {
    icon: Building2,
    title: "AI Teams & Organizations",
    description: "Determine best model responses at scale with batch experiments and exports.",
  },
  {
    icon: GraduationCap,
    title: "Academic Community",
    description: "Study model evaluation techniques with a research-backed, open-source platform.",
  },
];

export function Audience() {
  return (
    <section className="py-20 md:py-28">
      <div className="max-w-5xl mx-auto px-6">
        <p className="text-sm font-medium text-primary mb-3 tracking-wide uppercase text-center">
          Built For
        </p>
        <h2 className="text-3xl md:text-4xl font-bold text-foreground text-center mb-14 tracking-tight">
          Who It&apos;s For
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {audiences.map((item, index) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              viewport={{ once: true }}
              className="text-center"
            >
              <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <item.icon className="size-5 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {item.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {item.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
