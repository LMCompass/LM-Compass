import { Trophy, Check } from "lucide-react";
import type { Message as MessageType } from "@/lib/types";

type ComparisonPanelProps = {
  message: MessageType;
  modelLabelMap: Record<string, string>;
  userSelectedWinner?: string | null;
};

export function ComparisonPanel({
  message,
  modelLabelMap,
  userSelectedWinner,
}: ComparisonPanelProps) {
  const evaluationMetadata = message.evaluationMetadata;

  if (!evaluationMetadata || !message.multiResults) {
    return null;
  }

  return (
    <div className="rounded-2xl p-6 space-y-4 shadow-lg">
      <h4 className="font-semibold text-base text-foreground">
        Detailed Comparison
      </h4>
      <div className="space-y-3">
        {message.multiResults.map((result) => {
          const meanScore = evaluationMetadata.meanScores[result.model];
          const reasoning =
            evaluationMetadata.modelReasoning[result.model] || [];
          const isWinner = result.model === evaluationMetadata.winnerModel;
          const isUserSelected = userSelectedWinner === result.model;
          const isSelected = isWinner || isUserSelected;
          const label = modelLabelMap[result.model] || result.model;

          return (
            <div
              key={result.model}
              className={`rounded-xl p-4 space-y-3 transition-all ${
                isSelected ? "ring-2 ring-yellow-500/40" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="font-medium text-sm text-foreground">
                    {label}
                  </span>
                  {isUserSelected && (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-chart-3/20">
                      <Check className="h-3 w-3 text-chart-3" />
                      <span className="text-xs font-medium text-chart-3">
                        Selected
                      </span>
                    </div>
                  )}
                  {isWinner && !isUserSelected && (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/10">
                      <Trophy className="h-3 w-3 text-yellow-500" />
                      <span className="text-xs font-medium text-yellow-500">
                        Winner
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {meanScore?.toFixed(1) || "N/A"}
                  </span>
                  <span className="text-xs text-muted-foreground">/100</span>
                </div>
              </div>
              {reasoning.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-border/50">
                  <div className="text-xs font-medium text-muted-foreground">
                    Evaluation Notes
                  </div>
                  <div className="space-y-1.5">
                    {reasoning.map((reason, idx) => (
                      <div
                        key={idx}
                        className="text-xs text-foreground/70 pl-3 border-l-2 border-primary/30 leading-relaxed"
                      >
                        {reason}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
