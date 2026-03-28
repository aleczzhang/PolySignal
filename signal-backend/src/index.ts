import Fastify from 'fastify';
import cors from '@fastify/cors';
import { runPipeline } from './orchestrator/index.js';
import { listDomains } from './domains.js';

const app = Fastify({ logger: true });

await app.register(cors, { origin: 'http://localhost:5173' });

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/health', async () => ({ status: 'ok' }));

// ── List available domains ────────────────────────────────────────────────────

app.get('/api/domains', async () => listDomains());

// ── Pipeline SSE stream ───────────────────────────────────────────────────────
// GET /api/pipeline?domain=iran-oil&cached=false
//
// Streams PipelineEvents as SSE to the frontend.
// The frontend connects via EventSource and receives each step as it completes.

app.get('/api/pipeline', async (req, reply) => {
  const { domain = 'iran-oil', cached = 'false' } = req.query as {
    domain?: string;
    cached?: string;
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

  // Close stream if client disconnects early
  req.raw.on('close', () => {
    reply.raw.end();
  });

  try {
    await runPipeline(emit, domain, useCached);
  } catch (err: any) {
    emit({ step: 'error', status: 'failed', message: err?.message ?? 'Unknown error' });
  } finally {
    reply.raw.end();
  }
});

// ── Start server ──────────────────────────────────────────────────────────────

const port = Number(process.env.PORT) || 3001;
await app.listen({ port, host: '0.0.0.0' });
