import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { connectDB } from './config/db.js';
import { validateServerEnv } from './config/env.js';
import { initSocket } from './socket/index.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import mediaRoutes from './routes/mediaRoutes.js';
import statusRoutes from './routes/statusRoutes.js';

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 5000;
const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

app.use(cors({ origin: clientUrl, credentials: true }));
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'aqua-chat-server' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/statuses', statusRoutes);

let io;
try {
  io = initSocket(server);
  app.set('io', io);
} catch (error) {
  console.error(`Socket.IO initialization failed: ${error.message}`);
  throw error;
}

app.use((err, _req, res, _next) => {
  const status = err.statusCode || 500;
  res.status(status).json({
    message: err.message || 'Something went wrong',
    details: process.env.NODE_ENV === 'production' ? undefined : err.stack
  });
});

const startServer = async () => {
  try {
    validateServerEnv();
    await connectDB();
    server.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Server failed to start.');
    if (error?.codeName === 'AtlasError' || /auth/i.test(error?.message || '')) {
      console.error('MongoDB authentication failed. Check MONGODB_URI username, password, database user permissions, and Atlas network access.');
    } else {
      console.error(error.message);
    }
    process.exit(1);
  }
};

startServer();
