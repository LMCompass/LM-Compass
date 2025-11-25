import { Button } from "@/components/ui/button";
import { Trophy, Check } from "lucide-react";
import { Markdown } from "@/components/ui/markdown";

type ModelResponseCardProps = {
  cardKey: string;
  label: string;
  model: string;
  content: string;
  score?: number;
  isWinner: boolean;
  isUserSelected: boolean;
  shouldShowSelectionButtons: boolean;
  onViewDetail: (model: string, label: string, content: string) => void;
  onSelectWinner: (model: string, content: string) => void;
};

export function ModelResponseCard({
  cardKey,
  label,
  model,
  content,
  score,
  isWinner,
  isUserSelected,
  shouldShowSelectionButtons,
  onViewDetail,
  onSelectWinner,
}: ModelResponseCardProps) {
  const isSelected = isWinner || isUserSelected;
  const preview = content.slice(0, 600);

  return (
    <div
      key={cardKey}
      className={`group relative rounded-2xl p-5 flex flex-col gap-4 transition-all duration-300 hover:scale-[1.02] bg-card ${
        isSelected
          ? "ring-2 ring-yellow-500/50 shadow-lg shadow-yellow-500/20"
          : "hover:shadow-lg"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h4 className="text-base font-semibold text-foreground truncate">
            {label}
          </h4>
          {score !== undefined && (
            <div className="flex items-center gap-2 mt-1">
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-20 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-chart-2 to-chart-1 rounded-full transition-all"
                    style={{ width: `${score}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-foreground">
                  {score.toFixed(1)}
                </span>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {isUserSelected && (
            <div className="flex items-center justify-center w-7 h-7 rounded-full bg-chart-3/20">
              <Check className="h-4 w-4 text-chart-3" />
            </div>
          )}
          {isWinner && !isUserSelected && (
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-yellow-500/10">
              <Trophy className="h-6 w-6 text-yellow-500" />
            </div>
          )}
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <div className="text-sm text-foreground/80 leading-relaxed line-clamp-6">
          <Markdown className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_.katex]:text-sm">
            {preview}
          </Markdown>
        </div>
        {content.length > preview.length && (
          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-card to-transparent pointer-events-none" />
        )}
      </div>

      <div className="flex gap-2 pt-2 border-t border-border/50">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onViewDetail(model, label, content)}
          className="flex-1 hover:bg-accent"
        >
          View Full Response
        </Button>
        {shouldShowSelectionButtons && (
          <Button
            size="sm"
            variant="default"
            onClick={() => onSelectWinner(model, content)}
            className="bg-primary hover:bg-primary/90"
          >
            <Check className="h-3.5 w-3.5 mr-1" />
            Select
          </Button>
        )}
      </div>
    </div>
  );
}
