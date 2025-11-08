import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';

const llmClient = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
    'X-Title': 'LM Compass',
  },
});

export async function POST(req: Request) {
  try {
    const { messages, model, models } = await req.json();

    // Normalize to models array - handle both single model (legacy) and multi-model cases
    let modelsToQuery: string[];
    
    if (Array.isArray(models) && models.length > 0) {
      modelsToQuery = models;
    } else if (model) {
      modelsToQuery = [model];
    } else {
      modelsToQuery = ['tngtech/deepseek-r1t2-chimera:free'];
    }

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

    const results = settled.map((res, idx) => {
      const modelId = modelsToQuery[idx];
      if (res.status === 'fulfilled') {
        return { model: modelId, message: res.value.message };
      }
      return { 
        model: modelId, 
        error: res.reason instanceof Error ? res.reason.message : 'Request failed' 
      };
    });

    return NextResponse.json({ results });
  } catch (error: unknown) {
    console.error('Error calling OpenRouter:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get response from AI' },
      { status: 500 }
    );
  }
}

