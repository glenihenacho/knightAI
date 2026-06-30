import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { config } from './config.js';
import './db.js'; // ensure schema is initialised on boot
import { startPoller } from './poller.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerConnectionRoutes } from './routes/connections.js';
import { registerStreamRoutes } from './routes/streams.js';
import { registerChannelRoutes } from './routes/channels.js';
import { registerChatRoutes } from './routes/chat.js';

async function main(): Promise<void> {
  const app = Fastify({
    logger: {
      transport:
        process.env.NODE_ENV === 'production'
          ? undefined
          : { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
    },
  });

  await app.register(cors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : true,
  });
  await app.register(websocket);

  app.get('/api/health', async () => ({
    status: 'ok',
    demoMode: config.demoMode,
    time: new Date().toISOString(),
  }));

  registerAuthRoutes(app);
  registerConnectionRoutes(app);
  registerStreamRoutes(app);
  registerChannelRoutes(app);
  registerChatRoutes(app);

  startPoller((msg) => app.log.info(msg));

  await app.listen({ port: config.port, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error('Failed to start API:', err);
  process.exit(1);
});
