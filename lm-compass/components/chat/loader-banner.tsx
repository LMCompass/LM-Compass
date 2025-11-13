import { Loader } from "@/components/ui/loader";

interface LoaderBannerProps {
  phase: "querying" | "evaluating";
  models: string[];
  labelMap: Record<string, string>;
}

const loadingMessage = (
  phase: "querying" | "evaluating",
  models: string[],
  labelMap: Record<string, string>
): string => {
  const count = models.length;

  if (phase === "evaluating") return "Evaluating responses";
  if (count === 0) return "Processing";
  if (count === 1) return `Querying ${labelMap[models[0]] || models[0]}`;
  return `Querying ${count} models`;
};

export const LoaderBanner: React.FC<LoaderBannerProps> = ({
  phase,
  models,
  labelMap,
}) => {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="rounded-2xl p-5 inline-flex items-center gap-3">
        <Loader variant="typing" size="md" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            {loadingMessage(phase, models, labelMap)}
          </p>
          {phase === "querying" && models.length > 1 && (
            <p className="text-xs text-muted-foreground">
              {models.map((m) => labelMap[m] || m).join(", ")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
