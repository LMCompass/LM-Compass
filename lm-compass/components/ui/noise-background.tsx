"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface NoiseBackgroundProps {
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
  gradientColors?: string[];
  noiseIntensity?: number;
  speed?: number;
  backdropBlur?: boolean;
  animating?: boolean;
}

export function NoiseBackground({
  children,
  className,
  containerClassName,
  gradientColors = [
    "rgb(255, 100, 150)",
    "rgb(100, 150, 255)",
    "rgb(255, 200, 100)",
  ],
  noiseIntensity = 0.2,
  speed = 0.1,
  backdropBlur = false,
  animating = true,
}: NoiseBackgroundProps) {
  const duration = 10 / speed;

  return (
    <div className={cn("relative overflow-hidden", containerClassName)}>
      {/* Gradient layers */}
      {gradientColors.map((color, index) => (
        <motion.div
          key={index}
          className="absolute inset-0"
          animate={
            animating
              ? {
                  x: [
                    "0%",
                    `${30 * (index % 2 === 0 ? 1 : -1)}%`,
                    "0%",
                  ],
                  y: [
                    "0%",
                    `${20 * (index % 2 === 0 ? -1 : 1)}%`,
                    "0%",
                  ],
                  scale: [1, 1.1, 1],
                }
              : {}
          }
          transition={{
            duration: duration + index * 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{
            background: `radial-gradient(circle at ${50 + index * 20}% ${50 - index * 10}%, ${color} 0%, transparent 60%)`,
            opacity: 0.3,
          }}
        />
      ))}

      {/* Noise texture overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ opacity: noiseIntensity }}
      >
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <filter id="noise">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.8"
              numOctaves="4"
              stitchTiles="stitch"
            />
          </filter>
          <rect width="100%" height="100%" filter="url(#noise)" />
        </svg>
      </div>

      {/* Backdrop blur */}
      {backdropBlur && (
        <div className="absolute inset-0 backdrop-blur-3xl" />
      )}

      {/* Content */}
      <div className={cn("relative z-10", className)}>{children}</div>
    </div>
  );
}
