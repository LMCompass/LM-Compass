import type React from "react";
import { Button } from "@/components/ui/button";
import { Trophy, ChevronDown, ChevronUp } from "lucide-react";
import type { Message as MessageType } from "@/lib/types";

type WinnerBannerProps = {
  message: MessageType;
  modelLabelMap: Record<string, string>;
  isComparisonOpen: boolean;
  onToggleComparison: () => void;
};

export function WinnerBanner({
  message,
  modelLabelMap,
  isComparisonOpen,
  onToggleComparison,
}: WinnerBannerProps) {
  const evaluationMetadata = message.evaluationMetadata;
  const hasNoWinner = evaluationMetadata?.winnerModel === null;

  if (!evaluationMetadata) {
    return null;
  }

  return (
    <div className="bg-card rounded-2xl p-5 mb-2 flex items-center justify-between gap-4 shadow-lg">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        {hasNoWinner ? (
          <>
            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
              <Trophy className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-base text-foreground">
                It&apos;s a Tie
              </h4>
              <p className="text-sm text-muted-foreground mt-0.5">
                Multiple models scored equally. Select your preferred answer
                above.
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-yellow-500/10 flex items-center justify-center">
              <Trophy className="h-6 w-6 text-yellow-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-base text-foreground">
                {modelLabelMap[evaluationMetadata.winnerModel!] ||
                  evaluationMetadata.winnerModel}
              </h4>
              <p className="text-sm text-muted-foreground mt-0.5">
                Top Score:{" "}
                {evaluationMetadata.meanScores[
                  evaluationMetadata.winnerModel!
                ]?.toFixed(1)}
                /100
              </p>
            </div>
          </>
        )}
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={onToggleComparison}
        className="flex-shrink-0 gap-2"
      >
        {isComparisonOpen ? (
          <>
            Hide <ChevronUp className="h-4 w-4" />
          </>
        ) : (
          <>
            Compare <ChevronDown className="h-4 w-4" />
          </>
        )}
      </Button>
    </div>
  );
}
