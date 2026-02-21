"use client";

import React, { useRef } from "react";
import { useScroll, useTransform, motion, MotionValue } from "framer-motion";

export function ContainerScroll({
  titleComponent,
  children,
}: {
  titleComponent: string | React.ReactNode;
  children: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
  });
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const scaleDimensions = () => {
    return isMobile ? [0.7, 0.9] : [1.05, 1];
  };

  const rotate = useTransform(scrollYProgress, [0, 1], [20, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], scaleDimensions());
  const translate = useTransform(scrollYProgress, [0, 1], [0, -100]);

  return (
    <div
      className="h-[60rem] md:h-[80rem] flex items-center justify-center relative p-2 md:p-20"
      ref={containerRef}
    >
      <div
        className="pt-10 pb-10 md:pt-16 md:pb-20 w-full relative"
        style={{
          perspective: "1000px",
        }}
      >
        <Header translate={translate} titleComponent={titleComponent} />
        <Card rotate={rotate} scale={scale}>
          {children}
        </Card>
      </div>
    </div>
  );
}

function Header({
  translate,
  titleComponent,
}: {
  translate: MotionValue<number>;
  titleComponent: string | React.ReactNode;
}) {
  return (
    <motion.div
      style={{
        translateY: translate,
      }}
      className="div max-w-5xl mx-auto text-center"
    >
      {titleComponent}
    </motion.div>
  );
}

function Card({
  rotate,
  scale,
  children,
}: {
  rotate: MotionValue<number>;
  scale: MotionValue<number>;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      style={{
        rotateX: rotate,
        scale,
        boxShadow:
          "0 8px 24px -4px rgba(0,0,0,0.4), 0 24px 48px -12px rgba(0,0,0,0.35), 0 48px 80px -16px rgba(0,0,0,0.2)",
      }}
      className="max-w-5xl -mt-12 mx-auto h-[30rem] md:h-[40rem] w-full px-2 rounded-[30px] shadow-2xl relative"
    >
      {/* Top edge: gradient line + glow that fades to nothing at ends */}
      <div className="absolute left-0 right-0 top-0 z-10">
        {/* Glow from gradient only (no box-shadow) – transparent at ends */}
        <div
          className="absolute inset-x-0 -top-px h-5 rounded-t-[30px] opacity-90"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(194,65,12,0.08) 20%, rgba(234,88,12,0.35) 50%, rgba(194,65,12,0.08) 80%, transparent 100%)",
            filter: "blur(10px)",
          }}
        />
        {/* Crisp gradient line – no box-shadow so glow comes only from blurred layer */}
        <div
          className="relative h-[2px] rounded-t-[30px]"
          style={{
            background:
              "linear-gradient(90deg, #0a0a0a 0%, #1a1a1a 15%, #c2410c 30%, #ea580c 40%, #ffffff 50%, #ea580c 60%, #c2410c 70%, #1a1a1a 85%, #0a0a0a 100%)",
          }}
        />
      </div>
      <div className="h-full w-full overflow-hidden rounded-2xl bg-gray-100 dark:bg-zinc-900 md:rounded-2xl">
        {children}
      </div>
    </motion.div>
  );
}
