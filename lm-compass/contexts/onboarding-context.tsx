"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { useChat } from "@/contexts/chat-context";
import {
  CURRENT_TOUR_VERSION,
  ONBOARDING_STEPS,
  type OnboardingStatus,
  type OnboardingStep,
} from "@/lib/onboarding";
import {
  getOnboardingState,
  setOnboardingState,
} from "@/app/(app)/onboarding/actions";

type StartTourOptions = {
  fromStep?: number;
};

type OnboardingContextType = {
  isTourActive: boolean;
  startTour: (options?: StartTourOptions) => void;
  shouldSuppressBlockingDialogs: boolean;
};

const OnboardingContext = React.createContext<OnboardingContextType | null>(
  null
);

function clampStepIndex(index: number) {
  if (!Number.isFinite(index)) return 0;
  return Math.min(
    Math.max(Math.floor(index), 0),
    Math.max(ONBOARDING_STEPS.length - 1, 0)
  );
}

function areRectsEqual(a: DOMRect | null, b: DOMRect | null) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;

  const epsilon = 0.5;
  return (
    Math.abs(a.top - b.top) < epsilon &&
    Math.abs(a.left - b.left) < epsilon &&
    Math.abs(a.width - b.width) < epsilon &&
    Math.abs(a.height - b.height) < epsilon
  );
}

type StepCardProps = {
  currentStep: OnboardingStep;
  currentStepIndex: number;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  cardStyle: React.CSSProperties;
  showFallbackNote: boolean;
};

function StepCard({
  currentStep,
  currentStepIndex,
  onBack,
  onNext,
  onSkip,
  cardStyle,
  showFallbackNote,
}: StepCardProps) {
  const isLastStep = currentStepIndex === ONBOARDING_STEPS.length - 1;
  const progressPercent = ((currentStepIndex + 1) / ONBOARDING_STEPS.length) * 100;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Onboarding tour"
      className="fixed z-[151] w-[min(360px,calc(100vw-2rem))] rounded-xl border border-border bg-background p-4 text-foreground shadow-2xl"
      style={cardStyle}
    >
      <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
          {currentStep.pageLabel}
        </span>
        <span>
          Step {currentStepIndex + 1} of {ONBOARDING_STEPS.length}
        </span>
      </div>

      <div className="mb-3 flex items-center justify-end gap-3 text-xs text-muted-foreground">
        <button
          type="button"
          className="hover:text-foreground"
          onClick={onSkip}
        >
          Skip
        </button>
      </div>

      <div className="mb-4 h-1.5 rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-200"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <h2 className="text-base font-semibold">{currentStep.title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{currentStep.description}</p>
      {showFallbackNote && (
        <p className="mt-2 text-xs text-muted-foreground">
          This is the compact tour view because the highlighted target is not visible on this
          screen size or page state.
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onBack}
          disabled={currentStepIndex === 0}
        >
          Back
        </Button>
        <Button type="button" size="sm" onClick={onNext}>
          {isLastStep ? "Finish" : "Next"}
        </Button>
      </div>
    </div>
  );
}

type TourOverlayProps = {
  isTourActive: boolean;
  currentStepIndex: number;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
};

function TourOverlay({
  isTourActive,
  currentStepIndex,
  onBack,
  onNext,
  onSkip,
}: TourOverlayProps) {
  const pathname = usePathname();
  const [targetRect, setTargetRect] = React.useState<DOMRect | null>(null);
  const [viewport, setViewport] = React.useState({ width: 0, height: 0 });
  const [isSmallViewport, setIsSmallViewport] = React.useState(false);
  const rafRefreshRef = React.useRef<number | null>(null);

  const currentStep = ONBOARDING_STEPS[currentStepIndex];
  const isRouteTransition = isTourActive && !!currentStep && pathname !== currentStep.path;
  const activeTargetId = isRouteTransition
    ? currentStep?.transitionTargetId
    : currentStep?.targetId;

  const updateViewport = React.useCallback(() => {
    if (typeof window === "undefined") return;

    const nextWidth = window.innerWidth;
    const nextHeight = window.innerHeight;
    const nextSmall = nextWidth < 768;

    setViewport((prev) =>
      prev.width === nextWidth && prev.height === nextHeight
        ? prev
        : { width: nextWidth, height: nextHeight }
    );
    setIsSmallViewport((prev) => (prev === nextSmall ? prev : nextSmall));
  }, []);

  const refreshTargetRect = React.useCallback(() => {
    if (!isTourActive || typeof window === "undefined") {
      setTargetRect((prev) => (prev == null ? prev : null));
      return;
    }

    const smallViewport = window.innerWidth < 768;

    if (smallViewport || !activeTargetId) {
      setTargetRect((prev) => (prev == null ? prev : null));
      return;
    }

    const element = document.querySelector<HTMLElement>(
      `[data-tour-id="${activeTargetId}"]`
    );

    if (!element) {
      setTargetRect((prev) => (prev == null ? prev : null));
      return;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      setTargetRect((prev) => (prev == null ? prev : null));
      return;
    }

    const partlyOutsideViewport =
      rect.top < 0 ||
      rect.bottom > window.innerHeight ||
      rect.left < 0 ||
      rect.right > window.innerWidth;

    if (partlyOutsideViewport) {
      element.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: "smooth",
      });
    }

    const nextRect = element.getBoundingClientRect();
    setTargetRect((prev) => (areRectsEqual(prev, nextRect) ? prev : nextRect));
  }, [activeTargetId, isTourActive]);

  const scheduleRefresh = React.useCallback(() => {
    if (typeof window === "undefined") return;
    if (rafRefreshRef.current != null) return;

    rafRefreshRef.current = window.requestAnimationFrame(() => {
      rafRefreshRef.current = null;
      refreshTargetRect();
    });
  }, [refreshTargetRect]);

  React.useEffect(() => {
    if (!isTourActive) {
      setTargetRect((prev) => (prev == null ? prev : null));
      if (rafRefreshRef.current != null) {
        window.cancelAnimationFrame(rafRefreshRef.current);
        rafRefreshRef.current = null;
      }
      return;
    }

    updateViewport();
    scheduleRefresh();
    const timeoutId = window.setTimeout(scheduleRefresh, 250);
    const handleResize = () => {
      updateViewport();
      scheduleRefresh();
    };
    const handleScroll = () => {
      scheduleRefresh();
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, {
      capture: true,
      passive: true,
    });

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll, true);
      if (rafRefreshRef.current != null) {
        window.cancelAnimationFrame(rafRefreshRef.current);
        rafRefreshRef.current = null;
      }
    };
  }, [currentStepIndex, isTourActive, pathname, scheduleRefresh, updateViewport]);

  if (!isTourActive || !currentStep) {
    return null;
  }

  if (isRouteTransition) {
    const transitionCardWidth = Math.max(
      280,
      Math.min(340, (viewport.width || 360) - 24)
    );
    const defaultTransitionCardStyle: React.CSSProperties = {
      top: 14,
      left: "50%",
      transform: "translateX(-50%)",
    };

    let transitionCardStyle = defaultTransitionCardStyle;
    if (targetRect && viewport.height > 0 && viewport.width > 0) {
      const horizontalPadding = 12;
      const estimatedCardHeight = 140;
      let top = targetRect.bottom + 12;

      if (top + estimatedCardHeight > viewport.height - 12) {
        top = Math.max(12, targetRect.top - estimatedCardHeight - 12);
      }

      const left = Math.min(
        Math.max(targetRect.left, horizontalPadding),
        Math.max(horizontalPadding, viewport.width - transitionCardWidth - horizontalPadding)
      );

      transitionCardStyle = {
        top,
        left,
        transform: "none",
      };
    }

    const transitionHighlight: React.CSSProperties | null =
      targetRect && !isSmallViewport
        ? {
            top: Math.max(8, targetRect.top - 6),
            left: Math.max(8, targetRect.left - 6),
            width: targetRect.width + 12,
            height: targetRect.height + 12,
          }
        : null;

    return (
      <>
        {transitionHighlight ? (
          <div
            className="fixed z-[150] pointer-events-none rounded-xl border-2 border-primary shadow-[0_0_0_9999px_rgba(2,6,23,0.68)] transition-all duration-200"
            style={transitionHighlight}
          />
        ) : null}

        <div
          className="fixed z-[151] w-[min(340px,calc(100vw-1rem))] rounded-xl border border-primary/40 bg-background/96 p-3 shadow-xl backdrop-blur-sm"
          style={transitionCardStyle}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Press The Highlighted Button
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {currentStep.transitionInstruction ||
              `Click the highlighted control to open ${currentStep.pageLabel}.`}
          </p>
          {!transitionHighlight && currentStep.navigationHint && (
            <p className="mt-2 text-xs text-muted-foreground">
              {currentStep.navigationHint}
            </p>
          )}
          <div className="mt-3 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onBack}
              disabled={currentStepIndex === 0}
            >
              Back
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onSkip}>
              Skip
            </Button>
          </div>
        </div>
      </>
    );
  }

  const showCompactCard = !targetRect || isSmallViewport;
  const cardWidth = Math.max(
    280,
    Math.min(360, (viewport.width || 360) - 32)
  );

  const defaultCardStyle: React.CSSProperties = {
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
  };

  let anchoredCardStyle = defaultCardStyle;
  if (targetRect && !showCompactCard && viewport.height > 0 && viewport.width > 0) {
    const horizontalPadding = 16;
    const estimatedCardHeight = 230;
    const minimumTop = 12;

    let top = targetRect.bottom + 14;
    if (top + estimatedCardHeight > viewport.height - minimumTop) {
      top = Math.max(minimumTop, targetRect.top - estimatedCardHeight - 14);
    }

    const clampedLeft = Math.min(
      Math.max(targetRect.left, horizontalPadding),
      Math.max(horizontalPadding, viewport.width - cardWidth - horizontalPadding)
    );

    anchoredCardStyle = {
      top,
      left: clampedLeft,
      transform: "none",
    };
  }

  const highlightStyle: React.CSSProperties | null =
    targetRect && !showCompactCard
      ? {
          top: Math.max(8, targetRect.top - 6),
          left: Math.max(8, targetRect.left - 6),
          width: targetRect.width + 12,
          height: targetRect.height + 12,
        }
      : null;

  return (
    <>
      <div className="fixed inset-0 z-[149]" />

      {highlightStyle ? (
        <div
          className="fixed z-[150] pointer-events-none rounded-xl border-2 border-primary shadow-[0_0_0_9999px_rgba(2,6,23,0.68)] transition-all duration-200"
          style={highlightStyle}
        />
      ) : (
        <div className="fixed inset-0 z-[150] bg-black/70" />
      )}

      <StepCard
        currentStep={currentStep}
        currentStepIndex={currentStepIndex}
        onBack={onBack}
        onNext={onNext}
        onSkip={onSkip}
        cardStyle={anchoredCardStyle}
        showFallbackNote={showCompactCard}
      />
    </>
  );
}

export function OnboardingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoaded: userLoaded } = useUser();
  const { handleNewChat } = useChat();

  const [isTourActive, setIsTourActive] = React.useState(false);
  const [currentStepIndex, setCurrentStepIndex] = React.useState(0);
  const [autoStartEligible, setAutoStartEligible] = React.useState(false);
  const [isLoadingEligibility, setIsLoadingEligibility] = React.useState(true);
  const hasAttemptedAutoStartRef = React.useRef(false);

  const navigateToStep = React.useCallback(
    (index: number) => {
      const nextIndex = clampStepIndex(index);
      setCurrentStepIndex(nextIndex);
    },
    []
  );

  const persistState = React.useCallback(
    async (status: OnboardingStatus) => {
      const result = await setOnboardingState(status, CURRENT_TOUR_VERSION);
      if (!result.success) {
        throw new Error(result.error || "Failed to persist onboarding state.");
      }
    },
    []
  );

  const endTour = React.useCallback(
    async (status: OnboardingStatus) => {
      setIsTourActive(false);
      setAutoStartEligible(false);
      await persistState(status);
      handleNewChat();
      if (pathname !== "/chat") {
        router.push("/chat");
      }
    },
    [handleNewChat, pathname, persistState, router]
  );

  const startTour = React.useCallback(
    (options?: StartTourOptions) => {
      const stepIndex = clampStepIndex(options?.fromStep ?? 0);
      hasAttemptedAutoStartRef.current = true;
      setIsTourActive(true);
      setCurrentStepIndex(stepIndex);
    },
    []
  );

  const handleBack = React.useCallback(() => {
    navigateToStep(currentStepIndex - 1);
  }, [currentStepIndex, navigateToStep]);

  const handleNext = React.useCallback(() => {
    if (currentStepIndex >= ONBOARDING_STEPS.length - 1) {
      void endTour("completed");
      return;
    }

    navigateToStep(currentStepIndex + 1);
  }, [currentStepIndex, endTour, navigateToStep]);

  const handleSkip = React.useCallback(() => {
    void endTour("skipped");
  }, [endTour]);

  React.useEffect(() => {
    hasAttemptedAutoStartRef.current = false;
    setAutoStartEligible(false);
    setIsTourActive(false);
    setCurrentStepIndex(0);
  }, [user?.id]);

  React.useEffect(() => {
    if (!userLoaded) {
      return;
    }

    if (!user?.id) {
      setIsLoadingEligibility(false);
      setAutoStartEligible(false);
      return;
    }

    let cancelled = false;
    setIsLoadingEligibility(true);

    const loadState = async () => {
      try {
        const result = await getOnboardingState();
        if (!cancelled) {
          setAutoStartEligible(result.shouldAutoStart);
        }
      } catch {
        if (!cancelled) {
          setAutoStartEligible(true);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingEligibility(false);
        }
      }
    };

    void loadState();

    return () => {
      cancelled = true;
    };
  }, [user?.id, userLoaded]);

  React.useEffect(() => {
    if (
      !userLoaded ||
      !user?.id ||
      !autoStartEligible ||
      hasAttemptedAutoStartRef.current ||
      isTourActive
    ) {
      return;
    }

    if (pathname === "/chat") {
      hasAttemptedAutoStartRef.current = true;
      setIsTourActive(true);
      setCurrentStepIndex(0);
    }
  }, [autoStartEligible, isTourActive, pathname, user?.id, userLoaded]);

  const shouldSuppressBlockingDialogs =
    isTourActive ||
    (pathname === "/chat" &&
      !!user?.id &&
      userLoaded &&
      (isLoadingEligibility ||
        (autoStartEligible && !hasAttemptedAutoStartRef.current)));

  const value = React.useMemo<OnboardingContextType>(
    () => ({
      isTourActive,
      startTour,
      shouldSuppressBlockingDialogs,
    }),
    [isTourActive, shouldSuppressBlockingDialogs, startTour]
  );

  return (
    <OnboardingContext.Provider value={value}>
      {/* E2E: wait for data-loading=false before clicking sidebar — tour mounts after async getOnboardingState. */}
      <span
        data-testid="onboarding-eligibility"
        data-loading={isLoadingEligibility ? "true" : "false"}
        className="pointer-events-none fixed left-0 top-0 h-0 w-0 opacity-0"
        aria-hidden="true"
      />
      {children}
      <TourOverlay
        isTourActive={isTourActive}
        currentStepIndex={currentStepIndex}
        onBack={handleBack}
        onNext={handleNext}
        onSkip={handleSkip}
      />
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = React.useContext(OnboardingContext);

  if (!context) {
    throw new Error("useOnboarding must be used inside OnboardingProvider.");
  }

  return context;
}
