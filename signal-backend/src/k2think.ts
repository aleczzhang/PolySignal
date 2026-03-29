import OpenAI from 'openai';

const client = new OpenAI({
  apiKey:  process.env.K2_THINK_API_KEY  ?? 'key',
  baseURL: process.env.K2_THINK_BASE_URL ?? 'https://api.k2think.ai/v1',
});

const MODEL = process.env.K2_MODEL ?? 'MBZUAI-IFM/K2-Think-v2';

const SYSTEM_PROMPT =
  'You are K2-Think, an advanced reasoning assistant created by MBZUAI IFM. ' +
  'You are the orchestrator of a multi-agent system. You reason carefully about ' +
  'what each agent tells you, decide whether to trust it, and determine what to do next.';

export type ReasoningEffort = 'low' | 'medium' | 'high';

export async function callK2Think(prompt: string, effort: ReasoningEffort): Promise<string> {
  const res = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: prompt },
    ],
    extra_body: { chat_template_kwargs: { reasoning_effort: effort } },
  } as any);
  return res.choices[0].message.content ?? '';
}

export async function callK2ThinkStream(
  prompt: string,
  effort: ReasoningEffort,
  onToken: (token: string) => void,
): Promise<string> {
  const stream = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: prompt },
    ],
    stream: true as const,
    extra_body: { chat_template_kwargs: { reasoning_effort: effort } },
  } as any) as unknown as AsyncIterable<any>;

  let full = '';
  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content ?? '';
    if (token) { full += token; onToken(token); }
  }
  return full;
}

export function parseK2Json<T>(raw: string): T {
  // Try stripping markdown fences first
  const stripped = raw
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    return JSON.parse(stripped) as T;
  } catch {}

  // Fallback: brace-balanced extraction — handles think-aloud prefixes and trailing text
  const start = raw.indexOf('{');
  if (start !== -1) {
    let depth = 0;
    let inStr = false;
    let escape = false;
    for (let i = start; i < raw.length; i++) {
      const ch = raw[i];
      if (escape)       { escape = false; continue; }
      if (ch === '\\' && inStr) { escape = true; continue; }
      if (ch === '"')   { inStr = !inStr; continue; }
      if (inStr)        continue;
      if (ch === '{')   depth++;
      else if (ch === '}') { depth--; if (depth === 0) { return JSON.parse(raw.slice(start, i + 1)) as T; } }
    }
  }

  throw new SyntaxError(`No JSON object found in K2 response: ${raw.slice(0, 100)}`);
}
