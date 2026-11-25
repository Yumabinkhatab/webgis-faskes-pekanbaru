import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { closeDb, getDb } from './db.js';
import apiRouter from './routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const WEB_DIST_DIR = path.join(ROOT_DIR, 'web', 'dist');

const PORT = Number(process.env.PORT || 3000);
const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use('/api', apiRouter);

// Serve built frontend bundle when available (production / npm start)
if (fs.existsSync(WEB_DIST_DIR)) {
  app.use(express.static(WEB_DIST_DIR));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(WEB_DIST_DIR, 'index.html'));
  });
}

app.use((err, _req, res, _next) => {
  console.error('[API Error]', err);
  res.status(500).json({
    error: 'Terjadi kesalahan pada server analisis spasial.',
    detail: err.message,
  });
});

let server;

async function startServer() {
  try {
    const db = await getDb();
    console.log(`[DB] Terhubung ke MongoDB Atlas (${db.databaseName})`);
  } catch (err) {
    console.error('[DB] Peringatan koneksi awal gagal:', err.message);
  }

  server = app.listen(PORT, () => {
    console.log(`[API] Server WebGIS berjalan di http://localhost:${PORT}`);
  });
}

async function shutdown() {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await closeDb();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

startServer();
