import { createEngine, seedDb, HttpError } from './core.js';

/**
 * Capa de datos. Intenta hablar con el backend REST; si no está disponible
 * (p. ej. GitHub Pages), usa el mismo motor de negocio en el navegador
 * con persistencia en localStorage ("modo demo").
 */
const LS_KEY = 'emprende-viajes:demo-db:v1';
const cfg = () => (window.EV_CONFIG && window.EV_CONFIG.apiBase) || '';

let mode = 'local';
let engine = null;
let memoryDb = null;

const lsGet = () => { try { return localStorage.getItem(LS_KEY); } catch { return null; } };
const lsSet = (v) => { try { localStorage.setItem(LS_KEY, v); } catch { /* modo privado: queda en memoria */ } };

function loadLocal() {
  let db = null;
  const raw = lsGet();
  if (raw) { try { db = JSON.parse(raw); } catch { db = null; } }
  if (!db) { db = seedDb(); lsSet(JSON.stringify(db)); }
  memoryDb = db;
  engine = createEngine(db, { save: (d) => { memoryDb = d; lsSet(JSON.stringify(d)); } });
}

async function probeBackend() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 1500);
  try {
    const r = await fetch(`${cfg()}/api/health`, { signal: ctrl.signal });
    if (!r.ok) return false;
    const j = await r.json();
    return j && j.ok === true;
  } catch { return false; } finally { clearTimeout(t); }
}

async function remote(method, path, body) {
  let r;
  try {
    r = await fetch(`${cfg()}/api${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new HttpError(0, 'No se pudo conectar con el servidor. Revisa tu conexión.');
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(r.status, data.error || 'Ocurrió un error', data.details);
  return data;
}

function run(method, path, body, localFn) {
  if (mode === 'remote') return remote(method, path, body);
  try {
    return Promise.resolve(structuredClone(localFn(engine)));
  } catch (e) {
    return Promise.reject(e);
  }
}

const qs = (o) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => { if (v != null && v !== '') p.set(k, v); });
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const api = {
  get mode() { return mode; },
  async init() {
    if (await probeBackend()) mode = 'remote';
    else { mode = 'local'; loadLocal(); }
    return mode;
  },
  meta: () => run('GET', '/meta', null, (e) => e.meta()),
  dashboard: (month) => run('GET', `/dashboard${qs({ month })}`, null, (e) => e.dashboard(month)),
  sales: (f = {}) => run('GET', `/sales${qs(f)}`, null, (e) => e.listSales(f)),
  sale: (id) => run('GET', `/sales/${id}`, null, (e) => e.getSale(id)),
  createSale: (p) => run('POST', '/sales', p, (e) => e.createSale(p)),
  setStatus: (id, status) => run('PATCH', `/sales/${id}/status`, { status }, (e) => e.updateSaleStatus(id, status)),
  clients: (f = {}) => run('GET', `/clients${qs(f)}`, null, (e) => e.listClients(f)),
  client: (id) => run('GET', `/clients/${id}`, null, (e) => e.getClient(id)),
  createClient: (p) => run('POST', '/clients', p, (e) => e.createClient(p)),
  commissions: (month) => run('GET', `/commissions${qs({ month })}`, null, (e) => e.commissions(month)),
  training: () => run('GET', '/training', null, (e) => e.training()),
  toggleLesson: (id) => run('POST', `/training/lessons/${id}/toggle`, {}, (e) => e.toggleLesson(id)),
  tickets: () => run('GET', '/tickets', null, (e) => e.listTickets()),
  createTicket: (p) => run('POST', '/tickets', p, (e) => e.createTicket(p)),
  async reset() {
    if (mode === 'remote') return remote('POST', '/reset', {});
    memoryDb = seedDb(); lsSet(JSON.stringify(memoryDb));
    engine = createEngine(memoryDb, { save: (d) => { memoryDb = d; lsSet(JSON.stringify(d)); } });
    return { ok: true };
  },
};
