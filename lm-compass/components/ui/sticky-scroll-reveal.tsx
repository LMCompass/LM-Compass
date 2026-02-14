"use client";

import React, { useRef, useState } from "react";
import { useMotionValueEvent, useScroll, motion, AnimatePresence } from "framer-motion";
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
    offset: ["start start", "end start"],
  });

  const cardLength = content.length;

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    const cardsBreakpoints = content.map(
      (_, index) => index / cardLength
    );
    const closestBreakpointIndex = cardsBreakpoints.reduce(
      (acc, breakpoint, index) => {
        const distance = Math.abs(latest - breakpoint);
        if (distance < Math.abs(latest - cardsBreakpoints[acc])) {
          return index;
        }
        return acc;
      },
      0
    );
    setActiveCard(closestBreakpointIndex);
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
                transition={{ duration: 0.4 }}
              >
                <h3 className="text-2xl md:text-3xl font-bold text-foreground mb-6">
                  {item.title}
                </h3>
                <p className="text-lg text-muted-foreground leading-relaxed max-w-md">
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
              "sticky top-32 h-[24rem] w-full rounded-2xl overflow-hidden",
              contentClassName
            )}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={activeCard}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="h-full w-full rounded-2xl bg-gradient-to-br from-primary/20 via-chart-2/20 to-chart-3/20 border border-border/50 backdrop-blur-sm"
              >
                {content[activeCard].content ?? null}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
