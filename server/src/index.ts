import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { config } from './config.js';
import routes from './routes/index.js';
import { setupWebSocket } from './ws/index.js';

const app = express();

app.use(cors({ origin: config.corsOrigins }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', routes);

const server = createServer(app);

setupWebSocket(server);

server.listen(config.port, () => {
  console.log(`Conquest server running on http://localhost:${config.port}`);
});
