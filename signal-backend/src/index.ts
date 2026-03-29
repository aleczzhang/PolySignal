import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { runPipeline } from './orchestrator/index.js';
import { listDomains } from './domains.js';
import { suggestDomains } from './agents/domainSuggester.js';

const app = Fastify({ logger: true });

await app.register(cors, { origin: 'http://localhost:5173' });

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/health', async () => ({ status: 'ok' }));

// ── List available domains ────────────────────────────────────────────────────

app.get('/api/domains', async () => listDomains());

// ── Domain suggestions (K2-powered, role + org aware) ─────────────────────────

app.post('/api/domains/suggest', async (req, reply) => {
  const { role = '', org = '' } = req.body as { role?: string; org?: string };
  if (role.trim().length < 2 || org.trim().length < 2) {
    return reply.code(400).send({ error: 'role and org must each be at least 2 characters' });
  }
  const suggestions = await suggestDomains(role.trim(), org.trim());
  return { suggestions };
});

// ── Pipeline SSE stream ───────────────────────────────────────────────────────
// GET /api/pipeline?domain=iran-oil&cached=false
//
// Streams PipelineEvents as SSE to the frontend.
// The frontend connects via EventSource and receives each step as it completes.

app.get('/api/pipeline', async (req, reply) => {
  const { domain = 'iran-oil', cached = 'false', role = '', org = '' } = req.query as {
    domain?: string;
    cached?: string;
    role?: string;
    org?: string;
  };
  const useCached = cached === 'true';

  // Set SSE headers — keep connection open, disable buffering
  reply.raw.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no',      // disable nginx buffering if proxied
  });
  reply.raw.flushHeaders();

  // Emit helper — writes a PipelineEvent as an SSE message
  function emit(event: object) {
    reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  // Heartbeat — send a comment line every 20s to prevent proxy/browser timeout
  const heartbeat = setInterval(() => {
    reply.raw.write(': heartbeat\n\n');
  }, 20_000);

  // Close stream if client disconnects early
  req.raw.on('close', () => {
    clearInterval(heartbeat);
    reply.raw.end();
  });

  try {
    await runPipeline(emit, domain, useCached, role, org);
  } catch (err: any) {
    emit({ step: 'error', status: 'failed', message: err?.message ?? 'Unknown error' });
  } finally {
    clearInterval(heartbeat);
    reply.raw.end();
  }
});

// ── Start server ──────────────────────────────────────────────────────────────

const port = Number(process.env.PORT) || 3001;
await app.listen({ port, host: '0.0.0.0' });
