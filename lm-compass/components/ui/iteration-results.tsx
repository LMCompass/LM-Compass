"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { RL4FIterationResult } from "@/lib/evaluation"

interface IterationResultsProps {
  results: RL4FIterationResult[]
}

export function IterationResults({ results }: IterationResultsProps) {
  const [expandedIteration, setExpandedIteration] = React.useState<number | null>(null)

  if (!results || results.length === 0) {
    return null
  }

  return (
    <div className="space-y-3 mt-6 pt-4 border-t border-border">
      <p className="text-sm font-semibold">Refinement Iterations:</p>
      <div className="space-y-2">
        {results.map((result) => {
          const isExpanded = expandedIteration === result.iterationNumber

          return (
            <div key={result.iterationNumber} className="border border-border rounded-md overflow-hidden">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpandedIteration(isExpanded ? null : result.iterationNumber)}
                className="w-full justify-between text-left hover:bg-muted/50 h-auto py-3"
              >
                <span className="flex items-center gap-3">
                  <span className="font-medium">
                    {result.iterationNumber === 0
                      ? "Initial Evaluation"
                      : `Iteration ${result.iterationNumber}`}
                  </span>
                  {result.winner && (
                    <span className="text-xs text-muted-foreground">
                      Winner: {result.winner.model}
                    </span>
                  )}
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform flex-shrink-0 ${
                    isExpanded ? "rotate-180" : ""
                  }`}
                />
              </Button>

              {isExpanded && (
                <div className="px-4 py-4 bg-muted/30 border-t border-border space-y-4 text-sm">
                  {result.winner && (
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground">Winner</p>
                      <p className="text-muted-foreground">{result.winner.model}</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <p className="font-semibold text-foreground">Mean Scores:</p>
                    <div className="space-y-1 ml-2">
                      {Object.entries(result.meanScores).map(([model, score]) => (
                        <div key={model} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{model}</span>
                          <span className="font-medium text-foreground">{score.toFixed(1)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="font-semibold text-foreground">Individual Scores:</p>
                    <div className="space-y-2 ml-2">
                      {result.scores.map((score, idx) => (
                        <div key={idx} className="text-xs space-y-1 p-2 rounded border border-border bg-background">
                          <div className="flex justify-between font-medium text-foreground">
                            <span>{score.judgeModel} → {score.evaluatedModel}</span>
                            <span>{score.score !== null ? score.score : "N/A"}</span>
                          </div>
                          {score.reasoning && (
                            <p className="text-muted-foreground italic pt-1">{score.reasoning}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
