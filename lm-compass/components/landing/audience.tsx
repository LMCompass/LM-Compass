"use client";

import React from "react";
import { motion } from "framer-motion";
import { Code2, Building2, GraduationCap } from "lucide-react";

const audiences = [
  {
    icon: Code2,
    title: "Researchers & Developers",
    description: "Compare LLMs and SLMs with custom rubrics and automated evaluation to find the best response for your data.",
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
        <div className="text-center">
        <motion.p
          className="inline-block text-xs font-semibold text-white/95 mb-6 tracking-[0.2em] uppercase px-5 py-2 rounded-full border border-[#ea580c]/40"
          style={{
            background: "rgba(234,88,12,0.18)",
            boxShadow: "0 0 0 1px rgba(234,88,12,0.12) inset, 0 4px 16px -2px rgba(234,88,12,0.35)",
          }}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px 0px -20px 0px" }}
          transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          Built For
        </motion.p>
        <motion.h2
          className="text-3xl md:text-4xl font-bold text-center mb-14 tracking-tight font-heading bg-gradient-to-b from-white from-10% to-gray-400 to-90% bg-clip-text text-transparent"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px 0px -20px 0px" }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.05 }}
        >
          Who It&apos;s For
        </motion.h2>
        </div>
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
              <p className="text-sm text-white/75 leading-relaxed">
                {item.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
