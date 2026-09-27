import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEngine, seedDb, HttpError } from '../frontend/js/core.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.join(here, '../frontend');
const MAX_BODY = 100 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
  'access-control-allow-headers': 'content-type',
};

function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { ...CORS, 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new HttpError(413, 'Cuerpo demasiado grande')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, 'JSON inválido')); }
    });
    req.on('error', reject);
  });
}

/**
 * Crea el manejador HTTP (sin dependencias externas).
 * Recibe un `store` con { load, save }. Sirve la API en /api y el frontend estático.
 */
export function createApp(store) {
  let db = store.load();
  const engine = () => createEngine(db, { save: store.save });

  // [método, ruta, handler({ params, query, body })  →  { status?, data }]
  const routes = [
    ['GET', '/api/health', () => ({ data: { ok: true, service: 'emprende-viajes', time: new Date().toISOString() } })],
    ['GET', '/api/meta', () => ({ data: engine().meta() })],
    ['GET', '/api/dashboard', ({ query }) => ({ data: engine().dashboard(query.get('month') || undefined) })],
    ['GET', '/api/sales', ({ query }) => ({ data: engine().listSales({ status: query.get('status'), q: query.get('q') }) })],
    ['POST', '/api/sales', ({ body }) => ({ status: 201, data: engine().createSale(body) })],
    ['GET', '/api/sales/:id', ({ params }) => ({ data: engine().getSale(params.id) })],
    ['PATCH', '/api/sales/:id/status', ({ params, body }) => ({ data: engine().updateSaleStatus(params.id, body?.status) })],
    ['GET', '/api/clients', ({ query }) => ({ data: engine().listClients({ q: query.get('q') }) })],
    ['POST', '/api/clients', ({ body }) => ({ status: 201, data: engine().createClient(body) })],
    ['GET', '/api/clients/:id', ({ params }) => ({ data: engine().getClient(params.id) })],
    ['GET', '/api/commissions', ({ query }) => ({ data: engine().commissions(query.get('month') || undefined) })],
    ['GET', '/api/training', () => ({ data: engine().training() })],
    ['POST', '/api/training/lessons/:id/toggle', ({ params }) => ({ data: engine().toggleLesson(params.id) })],
    ['GET', '/api/tickets', () => ({ data: engine().listTickets() })],
    ['POST', '/api/tickets', ({ body }) => ({ status: 201, data: engine().createTicket(body) })],
    ['POST', '/api/reset', () => { db = seedDb(); store.save(db); return { data: { ok: true } }; }],
  ].map(([method, pattern, handler]) => ({
    method, handler,
    regex: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}/?$`),
  }));

  function serveStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Método no permitido' });
    let rel;
    try { rel = decodeURIComponent(pathname); } catch { return send(res, 400, { error: 'URL inválida' }); }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.normalize(path.join(FRONTEND_DIR, rel));
    if (!file.startsWith(FRONTEND_DIR + path.sep)) return send(res, 403, { error: 'Prohibido' });
    fs.readFile(file, (err, buf) => {
      if (err) return send(res, 404, { error: 'No encontrado' });
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : buf);
    });
  }

  return async function handler(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }

      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        for (const r of routes) {
          const m = r.regex.exec(url.pathname);
          if (!m) continue;
          if (r.method !== req.method) continue;
          const body = req.method === 'POST' || req.method === 'PATCH' ? await readJson(req) : {};
          const out = r.handler({ params: m.groups || {}, query: url.searchParams, body });
          return send(res, out.status || 200, out.data);
        }
        const pathExists = routes.some((r) => r.regex.test(url.pathname));
        throw new HttpError(pathExists ? 405 : 404, pathExists ? 'Método no permitido' : 'Ruta no encontrada');
      }
      return serveStatic(req, res, url.pathname);
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, { error: err.message, details: err.details });
      console.error(err);
      return send(res, 500, { error: 'Error interno del servidor' });
    }
  };
}
