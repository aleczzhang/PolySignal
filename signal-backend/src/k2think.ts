import OpenAI from 'openai';

const client = new OpenAI({
  apiKey:  process.env.K2_THINK_API_KEY  ?? 'key',
  baseURL: process.env.K2_THINK_BASE_URL ?? 'https://api.k2think.ai/v1',
});

const MODEL = process.env.K2_MODEL ?? 'MBZUAI-IFM/K2-Think-v2';

const SYSTEM_PROMPT =
  'You are K2-Think, an advanced reasoning assistant created by MBZUAI IFM. ' +
  'You are the orchestrator of a multi-agent system. You reason carefully about ' +
  'what each agent tells you, decide whether to trust it, and determine what to do next. ' +
  'When asked to produce structured output, reason first — then emit ONLY a valid JSON ' +
  'object as your final response, with no prose, markdown, or explanation after the JSON.';

export type ReasoningEffort = 'low' | 'medium' | 'high';

const CALL_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

export async function callK2Think(prompt: string, effort: ReasoningEffort): Promise<string> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`K2 call timed out after ${CALL_TIMEOUT_MS / 1000}s`)), CALL_TIMEOUT_MS)
  );
  const call = client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: prompt },
    ],
    extra_body: { chat_template_kwargs: { reasoning_effort: effort } },
  } as any).then((res: any) => res.choices[0].message.content ?? '');

  return Promise.race([call, timeout]);
}

const STREAM_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

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
  let lastTokenAt = Date.now();

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`K2 stream timed out after ${STREAM_TIMEOUT_MS / 1000}s`)), STREAM_TIMEOUT_MS)
  );

  await Promise.race([
    (async () => {
      for await (const chunk of stream) {
        const token = chunk.choices[0]?.delta?.content ?? '';
        if (token) {
          full += token;
          lastTokenAt = Date.now();
          onToken(token);
        }
        // Stall detection: if no token for 90s, abort
        if (Date.now() - lastTokenAt > 90_000) {
          throw new Error('K2 stream stalled — no tokens for 90s');
        }
      }
    })(),
    timeout,
  ]);

  return full;
}

export function parseK2Json<T>(raw: string): T {
  // Strip K2 Think V2's <think>...</think> reasoning blocks — they contain
  // { and } characters that confuse the brace-balanced extractor below.
  const withoutThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // Try stripping markdown fences first
  const stripped = withoutThink
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    return JSON.parse(stripped) as T;
  } catch {}

  // Brace-balanced extraction: try every '{' position until one yields valid JSON.
  // This handles think-aloud prefixes like "Here's the JSON: { ... }" where the
  // first '{' may be inside prose rather than at the start of the object.
  let searchFrom = 0;
  while (true) {
    const start = withoutThink.indexOf('{', searchFrom);
    if (start === -1) break;

    let depth = 0;
    let inStr = false;
    let escape = false;
    let end = -1;
    for (let i = start; i < withoutThink.length; i++) {
      const ch = withoutThink[i];
      if (escape)              { escape = false; continue; }
      if (ch === '\\' && inStr){ escape = true;  continue; }
      if (ch === '"')          { inStr = !inStr; continue; }
      if (inStr)               continue;
      if (ch === '{')          depth++;
      else if (ch === '}')     { depth--; if (depth === 0) { end = i; break; } }
    }

    if (end !== -1) {
      try {
        return JSON.parse(withoutThink.slice(start, end + 1)) as T;
      } catch {
        // This '{' wasn't a JSON object start — advance and try the next one
      }
    }

    searchFrom = start + 1;
  }

  console.error('[parseK2Json] Failed to extract JSON. Stripped response:\n', withoutThink.slice(0, 500));
  throw new SyntaxError(`No JSON object found in K2 response: ${withoutThink.slice(0, 100)}`);
}
