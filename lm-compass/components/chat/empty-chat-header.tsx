import { Sparkles } from "lucide-react";

export const EmptyChatHeader = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="rounded-2xl p-12 max-w-md text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <Sparkles className="w-8 h-8 text-primary" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-semibold text-foreground">
            Start a Conversation
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Compare responses from multiple AI models and discover the best
            answer for your query.
          </p>
        </div>
      </div>
    </div>
  );
};
