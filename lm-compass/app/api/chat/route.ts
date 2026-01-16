import { OpenAI } from 'openai';
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/utils/supabase/server";
import { decrypt } from "@/lib/encryption";
import { NextResponse } from 'next/server';
import { PromptBasedEvaluator, NPromptBasedEvaluator, type ModelResponse, type EvaluationMetadata } from '@/lib/evaluation';
import { saveChat, loadAllMessages } from '@/lib/chat-storage';
import type { Message } from '@/lib/types';
import { randomUUID } from 'crypto';

/**
 * Extracts the user query from the messages array (last user message)
 */
function extractUserQuery(messages: Array<{ role: string; content: string }>): string {
  // Find the last user message
  if (messages.length >= 2 && messages[messages.length - 2].role === 'user') {
    return messages[messages.length - 2].content;
  }
  // Fallback: return empty string if no user message found
  return '';
}

/**
 * Creates an assistant message from model results and optional evaluation metadata.
 */
function createAssistantMessage(
  allResults: Array<{ model: string; message?: any; error?: string }>,
  evaluationMetadata?: EvaluationMetadata
): Message {
  const multiResults = allResults.map((r) => ({
    model: r.model,
    content: r.error ? `Error: ${r.error}` : r.message?.content || '',
  }));

  let content = '';
  if (evaluationMetadata?.winnerModel) {
    const winnerResult = multiResults.find(
      (r) => r.model === evaluationMetadata.winnerModel
    );
    content = winnerResult?.content || '';
  } else {
    content = multiResults[0]?.content || '';
  }

  return {
    id: randomUUID(),
    role: 'assistant',
    content,
    multiResults: multiResults.length > 1 ? multiResults : undefined,
    ...(evaluationMetadata && { evaluationMetadata }),
  };
}

export async function POST(req: Request) {
  try {

    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const supabase = await createClient();
    const { data: userSettings, error: dbError } = await supabase
      .from('user_settings')
      .select('openrouter_api_key')
      .eq('user_id', userId)
      .single();

    if (dbError || !userSettings?.openrouter_api_key) {
      return NextResponse.json(
        { error: 'OpenRouter API key not found. Please add it in the settings.' },
        { status: 404 }
      );
    }

    let apiKey;
    try {
      apiKey = decrypt(userSettings.openrouter_api_key);
    } catch (e) {
      return NextResponse.json(
        { error: 'Failed to decrypt API key. Please try again.' },
        { status: 500 }
      );
    }

    const llmClient = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: apiKey,
      defaultHeaders: {
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
        'X-Title': 'LM Compass',
      },
    });

    const { messages, model, models, evaluationMethod, chatId } = await req.json();

    // Normalize to models array - handle both single model (legacy) and multi-model cases
    let modelsToQuery: string[];

    if (Array.isArray(models) && models.length > 0) {
      modelsToQuery = models;
    } else if (model) {
      modelsToQuery = [model];
    } else {
      // No models provided - return error
      return NextResponse.json(
        { error: 'No models selected. Please select at least one model before querying.' },
        { status: 400 }
      );
    }

    // Create a readable stream for progress updates
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        const sendProgress = (data: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        // Track the final assistant message for saving
        let finalAssistantMessage: Message | null = null;

        try {
          // Always use multi-model logic for consistent return format
          const settled = await Promise.allSettled(
            modelsToQuery.map(async (m: string) => {
              const completion = await llmClient.chat.completions.create({
                model: m,
                messages: messages,
              });
              return {
                model: m,
                message: completion.choices[0].message,
              };
            })
          );

          const allResults = settled.map((res, idx) => {
            const modelId = modelsToQuery[idx];
            if (res.status === 'fulfilled') {
              return { model: modelId, message: res.value.message };
            }
            
            // Extract error message
            let errorMessage = res.reason instanceof Error ? res.reason.message : 'Request failed';
            
            // Check if error is related to invalid API key
            // OpenRouter returns "401 User not found" or similar messages for invalid API keys
            const errorMessageLower = errorMessage.toLowerCase();
            if (
              errorMessageLower.includes('401') ||
              errorMessageLower.includes('user not found') ||
              errorMessageLower.includes('invalid api key') ||
              errorMessageLower.includes('authentication failed') ||
              (res.reason instanceof Error && 'status' in res.reason && (res.reason as any).status === 401)
            ) {
              errorMessage = 'The OpenRouter API key is invalid. Please update with a valid key in settings.';
            }
            
            return {
              model: modelId,
              error: errorMessage
            };
          });

          // Filter successful responses for evaluation
          const successfulResults: ModelResponse[] = allResults
            .filter((r) => {
              if (r.error) return false;
              const content = r.message?.content;
              return content && content.trim().length > 0;
            })
            .map((r) => ({
              model: r.model,
              content: r.message?.content || '',
            }));

          // If we have 2 or more successful responses, use evaluation to find the winner
          if (successfulResults.length >= 2) {
            // Send progress update that querying is done and evaluation is starting
            sendProgress({ phase: 'evaluating' });

            try {
              const userQuery = extractUserQuery(messages);

              // Create evaluator based on selected method
              let evaluator;
              if (evaluationMethod === 'n-prompt-based') {
                evaluator = new NPromptBasedEvaluator(llmClient);
              } else {
                // Default to n^2 prompt-based
                evaluator = new PromptBasedEvaluator(llmClient);
              }
              const evaluationResult = await evaluator.evaluate(successfulResults, {
                userQuery,
              });

              // Aggregate reasoning for each model
              const modelReasoning: Record<string, string[]> = {};
              successfulResults.forEach((r) => {
                modelReasoning[r.model] = [];
              });
              evaluationResult.scores.forEach((score) => {
                if (score.reasoning !== null) {
                  modelReasoning[score.evaluatedModel].push(score.reasoning);
                }
              });

              // Create evaluation metadata
              const evaluationMetadata: EvaluationMetadata = {
                winnerModel: evaluationResult.winner ? evaluationResult.winner.model : null,
                scores: evaluationResult.scores,
                meanScores: evaluationResult.meanScores,
                modelReasoning,
                tiedModels: evaluationResult.tiedModels,
              };

              // Create assistant message for saving
              finalAssistantMessage = createAssistantMessage(allResults, evaluationMetadata);

              // Send final results
              sendProgress({
                phase: 'complete',
                results: allResults,
                evaluationMetadata,
              });
            } catch (evaluationError) {
              // If evaluation fails, log error and return all results with evaluationError
              console.error('Evaluation failed:', evaluationError);
              
              // Still create assistant message even if evaluation failed
              finalAssistantMessage = createAssistantMessage(allResults);

              sendProgress({
                phase: 'complete',
                results: allResults,
                evaluationMetadata: undefined,
                evaluationError: {
                  errorMessage: evaluationError instanceof Error ? evaluationError.message : 'Evaluation failed',
                },
              });
            }
          } else {
            // (0-1 responses, no evaluation needed)
            finalAssistantMessage = createAssistantMessage(allResults);

            sendProgress({
              phase: 'complete',
              results: allResults,
            });
          }
        } catch (error) {
          sendProgress({
            phase: 'error',
            error: error instanceof Error ? error.message : 'Failed to get response from AI',
          });
        } finally {
          // Save messages to database after streaming completes
          // Skip saving if there's a tie (no winner) - wait for user to select a winner
          const metadata = finalAssistantMessage?.evaluationMetadata;
          const hasTie =
            !!metadata &&
            metadata.winnerModel === null &&
            Array.isArray(metadata.tiedModels) &&
            metadata.tiedModels.length > 0;
          const shouldSkipSave = hasTie && !finalAssistantMessage?.userSelectedWinner;
          
          if (chatId && userId && finalAssistantMessage && !shouldSkipSave) {
            try {
              // Load ALL existing messages from database to preserve full conversation
              // Use loadAllMessages instead of loadChat to get all messages, not just last 5
              const { messages: existingMessages } = await loadAllMessages(supabase, chatId, userId);
              
              // Convert API messages format to Message format
              // The messages from request are { role, content } only, but may optionally include an id
              const requestMessages: Message[] = messages.map((msg: { role: string; content: string } & { id?: string }) => ({
                id: msg.id ?? randomUUID(),
                role: msg.role as 'user' | 'assistant',
                content: msg.content,
              }));

              // Determine which messages to save
              let messagesToSave: Message[];
              
              if (existingMessages && existingMessages.length > 0) {
                // Determine overlap by comparing from the start until messages diverge,
                // then append only the new messages from the request.
                let firstNewIndex = 0;
                const maxComparable = Math.min(existingMessages.length, requestMessages.length);
                
                while (firstNewIndex < maxComparable) {
                  const existing = existingMessages[firstNewIndex];
                  const incoming = requestMessages[firstNewIndex];
                  
                  if (existing.role !== incoming.role || existing.content !== incoming.content) {
                    break;
                  }
                  firstNewIndex++;
                }
                
                // Append only the new messages from the request
                const newFromRequest = requestMessages.slice(firstNewIndex);
                messagesToSave = [...existingMessages, ...newFromRequest, finalAssistantMessage];
              } else {
                // No existing messages - this is a new chat
                messagesToSave = [...requestMessages, finalAssistantMessage];
              }
              
              // Save to database (non-blocking, don't wait for it)
              saveChat(supabase, chatId, userId, messagesToSave).then((result) => {
                if (result.success) {
                  console.log('Chat saved successfully');
                } else {
                  console.error('Error saving chat:', result.error);
                }
              }).catch((err) => {
                console.error('Error saving chat to database:', err);
              });
            } catch (saveError) {
              console.error('Error preparing chat save:', saveError);
            }
          } else {
            if (shouldSkipSave) {
              console.log('Skipping save - waiting for user to select winner for tie');
            } else {
              console.log('Not saving chat - missing:', { chatId: !!chatId, userId: !!userId, finalAssistantMessage: !!finalAssistantMessage });
            }
          }
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: unknown) {
    console.error('Error calling OpenRouter:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get response from AI' },
      { status: 500 }
    );
  }
}

