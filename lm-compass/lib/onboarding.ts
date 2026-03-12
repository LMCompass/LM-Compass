export const CURRENT_TOUR_VERSION = 1;

export type TourVersion = number;

export type OnboardingStatus = "completed" | "skipped";

export type OnboardingState = {
  version: TourVersion;
  status: OnboardingStatus;
  updatedAt: string;
};

export type OnboardingStep = {
  id: string;
  path: string;
  pageLabel: string;
  navigationHint?: string;
  transitionTargetId?: string;
  transitionInstruction?: string;
  targetId?: string;
  title: string;
  description: string;
};

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    id: "chat-evaluation-methods",
    path: "/chat",
    pageLabel: "Chat",
    navigationHint: "Use the sidebar and open New Chat.",
    transitionTargetId: "nav-to-chat",
    transitionInstruction: "Click New Chat in the sidebar to go to Chat.",
    targetId: "chat-evaluation-method-selector",
    title: "Choose Evaluation Methods",
    description:
      "Pick how responses are judged. Different methods trade off speed, rigor, and reasoning depth.",
  },
  {
    id: "chat-model-selection",
    path: "/chat",
    pageLabel: "Chat",
    navigationHint: "Stay on the Chat page.",
    transitionTargetId: "nav-to-chat",
    transitionInstruction: "Click New Chat in the sidebar to return to Chat.",
    targetId: "chat-model-selector",
    title: "Select Models",
    description:
      "Compare multiple models side by side. The app ranks outputs using your selected evaluation method and rubric.",
  },
  {
    id: "rubrics-overview",
    path: "/rubric/view",
    pageLabel: "View Rubrics",
    navigationHint: "Use the sidebar and click View Rubrics.",
    transitionTargetId: "nav-to-rubrics",
    transitionInstruction: "Click View Rubrics in the sidebar to continue.",
    targetId: "rubrics-overview",
    title: "View And Create Rubrics",
    description:
      "Rubrics define scoring criteria. Review existing rubrics here or create your own to customize evaluations.",
  },
  {
    id: "experiments-overview",
    path: "/experiments",
    pageLabel: "Experiments",
    navigationHint: "Use the sidebar and click Experiments.",
    transitionTargetId: "nav-to-experiments",
    transitionInstruction: "Click Experiments in the sidebar to continue.",
    targetId: "experiments-overview",
    title: "What Experiments Are",
    description:
      "Experiments run model comparisons across datasets, track status, and let you inspect winners and progress row by row.",
  },
  {
    id: "experiment-create-flow",
    path: "/experiments/upload",
    pageLabel: "New Experiment",
    navigationHint: "On Experiments, click Create Experiment.",
    transitionTargetId: "experiments-create-button",
    transitionInstruction: "Click Create Experiment to open the setup page.",
    targetId: "experiment-create-flow",
    title: "How To Create Experiments",
    description:
      "Upload a dataset, map columns, choose models/rubric/method, preview rows, and start the run.",
  },
];
