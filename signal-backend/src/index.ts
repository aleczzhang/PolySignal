import Fastify from 'fastify';
import cors from '@fastify/cors';

const app = Fastify({ logger: true });

await app.register(cors, { origin: 'http://localhost:5173' });

// Routes will be registered here

app.get('/health', async () => ({ status: 'ok' }));

const port = Number(process.env.PORT) || 3001;
await app.listen({ port, host: '0.0.0.0' });
