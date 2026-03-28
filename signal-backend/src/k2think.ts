import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.K2_API_KEY,
  baseURL: process.env.K2_BASE_URL ?? 'https://api.k2think.ai/v1',
});

const MODEL = process.env.K2_MODEL ?? 'MBZUAI-IFM/K2-Think-v2';

export type ReasoningEffort = 'low' | 'medium' | 'high';

// Maps effort level to max_tokens budget
const EFFORT_TOKENS: Record<ReasoningEffort, number> = {
  low: 4096,
  medium: 8192,
  high: 16384,
};

export async function callK2Think(prompt: string, effort: ReasoningEffort): Promise<string> {
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: EFFORT_TOKENS[effort],
  });

  return response.choices[0]?.message?.content ?? '';
}

export async function callK2ThinkStream(
  prompt: string,
  effort: ReasoningEffort,
  onChunk: (chunk: string) => void,
): Promise<string> {
  const stream = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: EFFORT_TOKENS[effort],
    stream: true,
  });

  let full = '';
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content ?? '';
    if (text) {
      full += text;
      onChunk(text);
    }
  }
  return full;
}

export function parseK2Json<T>(raw: string): T {
  // K2 Think sometimes wraps JSON in markdown fences — strip them
  const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
  return JSON.parse(cleaned) as T;
}
