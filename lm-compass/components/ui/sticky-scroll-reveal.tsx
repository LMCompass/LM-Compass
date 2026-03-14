"use client";

import React, { useRef, useState } from "react";
import {
  useMotionValueEvent,
  useScroll,
  motion,
  AnimatePresence,
} from "framer-motion";
import { cn } from "@/lib/utils";

interface ContentItem {
  title: string;
  description: string;
  content?: React.ReactNode;
}

export function StickyScroll({
  content,
  contentClassName,
}: {
  content: ContentItem[];
  contentClassName?: string;
}) {
  const [activeCard, setActiveCard] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start center", "end center"],
  });

  const cardLength = content.length;
  // Switch earlier so right panel stays in sync with left text (responsive thresholds)
  const switchThresholds = Array.from(
    { length: cardLength - 1 },
    (_, i) => (i + 1) / cardLength,
  );

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    let index = 0;
    for (let i = 0; i < switchThresholds.length; i++) {
      if (latest >= switchThresholds[i]) index = i + 1;
    }
    setActiveCard(index);
  });

  return (
    <div ref={ref} className="relative">
      <div className="flex justify-between gap-16">
        {/* Left side: scrolling text content */}
        <div className="w-full lg:w-1/2">
          {content.map((item, index) => (
            <div
              key={item.title + index}
              className="min-h-[50vh] flex flex-col justify-center py-16"
            >
              <motion.div
                animate={{
                  opacity: activeCard === index ? 1 : 0.25,
                }}
                transition={{ duration: 0.2 }}
              >
                <h3 className="text-2xl md:text-3xl font-bold text-foreground mb-6">
                  {item.title}
                </h3>
                <p className="text-lg text-white/75 leading-relaxed max-w-md">
                  {item.description}
                </p>
              </motion.div>
            </div>
          ))}
        </div>

        {/* Right side: sticky visual panel */}
        <div className="hidden lg:flex w-1/2 items-start">
          <div
            className={cn(
              "sticky top-[calc(50vh-12rem)] h-[24rem] w-full rounded-2xl overflow-hidden",
              contentClassName,
            )}
          >
            {/* Render all cards stacked, crossfade via opacity only */}
            {content.map((item, index) => (
              <motion.div
                key={index}
                animate={{ opacity: activeCard === index ? 1 : 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/20 via-chart-2/20 to-chart-3/20 backdrop-blur-sm shadow-[0_4px_24px_-6px_rgba(0,0,0,0.3),0_8px_32px_-12px_rgba(0,0,0,0.2)]"
              >
                {item.content ?? null}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
