"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

export function FinalCTA() {
  return (
    <section className="py-28 md:py-40">
      <motion.div
        className="max-w-3xl mx-auto px-6 text-center"
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px 0px -40px 0px" }}
        transition={{ duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <h2 className="text-3xl md:text-5xl font-bold mb-6 tracking-tight font-heading bg-gradient-to-b from-white from-10% to-gray-400 to-90% bg-clip-text text-transparent">
          Ready to find the best response for your data?
        </h2>
        <p className="text-lg text-white/75 mb-10 max-w-xl mx-auto leading-relaxed">
          Support for OpenAI, Anthropic, Google, Meta, Mistral, and more via
          OpenRouter.
        </p>
        <Link
          href="/chat"
          className="group inline-flex items-center gap-2 px-8 py-4 rounded-full bg-[#c2410c] text-white font-medium text-lg shadow-[0_4px_20px_-2px_rgba(194,65,12,0.5),0_6px_24px_-4px_rgba(194,65,12,0.35)] hover:shadow-[0_8px_28px_-2px_rgba(194,65,12,0.55),0_12px_32px_-4px_rgba(194,65,12,0.4)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#ea580c]"
        >
          Get Started with LM Compass
          <ArrowRight className="size-5 transition-transform duration-300 group-hover:translate-x-1" />
        </Link>
        <p className="mt-5 text-sm text-white/60">
          Sign up to begin evaluating.
        </p>
      </motion.div>
    </section>
  );
}
