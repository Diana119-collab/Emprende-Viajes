import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { createFileStore } from './store.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const DB_FILE = process.env.DB_FILE || path.join(here, '../data/db.json');

http.createServer(createApp(createFileStore(DB_FILE))).listen(PORT, () => {
  console.log(`\n  Emprende Viajes listo en  http://localhost:${PORT}\n  Datos guardados en        ${DB_FILE}\n`);
});
