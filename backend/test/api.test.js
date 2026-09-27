import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../app.js';
import { createMemoryStore } from '../store.js';
import { toISO, addDays, computeSaleMoney } from '../../frontend/js/core.js';

let server, base, store;
const j = async (method, url, body) => {
  const r = await fetch(base + url, {
    method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json() };
};
const future = (n = 30) => toISO(addDays(new Date(), n));
const validSale = (over = {}) => ({
  client: { name: 'María Pérez', phone: '999 111 222', email: 'maria@mail.com' },
  destination: 'Cancún', country: 'México', travelDate: future(), passengers: 2, amount: 5000, cost: 4400, ...over,
});

before(async () => {
  store = createMemoryStore();
  server = http.createServer(createApp(store));
  await new Promise((res) => server.listen(0, res));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());
beforeEach(() => j('POST', '/reset'));

test('health responde ok', async () => {
  const r = await j('GET', '/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
});

test('comisión = 30% de la utilidad', () => {
  assert.deepEqual(computeSaleMoney(5000, 4400), { profit: 600, commission: 180 });
  assert.deepEqual(computeSaleMoney(1000, 1200), { profit: 0, commission: 0 });
});

test('crear venta calcula utilidad/comisión y crea al cliente nuevo', async () => {
  const before = (await j('GET', '/clients')).body.items.length;
  const r = await j('POST', '/sales', validSale());
  assert.equal(r.status, 201);
  assert.equal(r.body.profit, 600);
  assert.equal(r.body.commission, 180);
  assert.equal(r.body.status, 'en_proceso');
  assert.match(r.body.id, /^V-\d+$/);
  assert.equal((await j('GET', '/clients')).body.items.length, before + 1);
});

test('una venta a un cliente existente (mismo teléfono) no lo duplica', async () => {
  const before = (await j('GET', '/clients')).body.items.length;
  await j('POST', '/sales', validSale({ client: { name: 'Laura García', phone: '987654321', email: '' } }));
  assert.equal((await j('GET', '/clients')).body.items.length, before);
});

test('validación: devuelve 400 con detalle por campo', async () => {
  const r = await j('POST', '/sales', validSale({
    client: { name: 'A', phone: '12', email: 'mal' }, travelDate: '2020-01-01', passengers: 0, amount: 100, cost: 500,
  }));
  assert.equal(r.status, 400);
  for (const k of ['name', 'phone', 'email', 'travelDate', 'passengers', 'cost']) assert.ok(r.body.details[k], `falta error de ${k}`);
});

test('listar ventas filtra por estado y busca por texto', async () => {
  const all = (await j('GET', '/sales')).body;
  assert.equal(all.counts.todas, all.items.length);
  const proc = (await j('GET', '/sales?status=en_proceso')).body;
  assert.ok(proc.items.length > 0 && proc.items.every((s) => s.status === 'en_proceso'));
  const q = (await j('GET', '/sales?q=cancun')).body; // sin tilde
  assert.ok(q.items.length > 0 && q.items.every((s) => s.destination === 'Cancún'));
});

test('cambiar estado registra historial y valida el estado', async () => {
  const created = (await j('POST', '/sales', validSale())).body;
  const r = await j('PATCH', `/sales/${created.id}/status`, { status: 'confirmada' });
  assert.equal(r.status, 200);
  assert.equal(r.body.commissionStatus, 'pagada');
  assert.equal(r.body.history.length, 2);
  assert.equal((await j('PATCH', `/sales/${created.id}/status`, { status: 'nada' })).status, 400);
  assert.equal((await j('PATCH', '/sales/V-0/status', { status: 'confirmada' })).status, 404);
});

test('dashboard: KPIs del mes consistentes con las ventas', async () => {
  const d = (await j('GET', '/dashboard')).body;
  const month = d.month;
  const sales = (await j('GET', '/sales')).body.items.filter((s) => s.saleDate.startsWith(month));
  assert.equal(d.kpi.closed, sales.length);
  assert.equal(d.kpi.income, sales.reduce((t, s) => t + s.amount, 0));
  assert.equal(d.series.length, 6);
});

test('comisiones: generada = pagada + en proceso', async () => {
  const c = (await j('GET', '/commissions')).body;
  assert.equal(Math.round((c.summary.paid + c.summary.pending) * 100), Math.round(c.summary.generated * 100));
  assert.equal(c.rate, 0.3);
});

test('capacitación: alternar lección actualiza el progreso', async () => {
  const t0 = (await j('GET', '/training')).body;
  const lesson = t0.courses.flatMap((c) => c.lessons).find((l) => !l.done);
  const t1 = (await j('POST', `/training/lessons/${lesson.id}/toggle`)).body;
  assert.equal(t1.overall.completed, t0.overall.completed + 1);
  assert.equal((await j('POST', '/training/lessons/L-999/toggle')).status, 404);
});

test('tickets: crear con validación y respuesta automática', async () => {
  assert.equal((await j('POST', '/tickets', { subject: '', message: '' })).status, 400);
  const r = await j('POST', '/tickets', { subject: 'Duda con un voucher', message: 'No me llegó el voucher', category: 'Reservas', priority: 'alta' });
  assert.equal(r.status, 201);
  assert.equal(r.body.status, 'abierto');
  assert.equal(r.body.replies.length, 1);
});

test('clientes: crear, rechazar duplicado y ver detalle', async () => {
  const c = await j('POST', '/clients', { name: 'Nuevo Cliente', phone: '955 000 111', email: '' });
  assert.equal(c.status, 201);
  assert.equal((await j('POST', '/clients', { name: 'Otro Nombre', phone: '955000111' })).status, 409);
  const detail = await j('GET', `/clients/${c.body.id}`);
  assert.deepEqual(detail.body.sales, []);
});

test('rutas inexistentes y JSON roto devuelven errores limpios', async () => {
  assert.equal((await j('GET', '/nada')).status, 404);
  const r = await fetch(`${base}/sales`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{malo' });
  assert.equal(r.status, 400);
});

/* ---------- módulos de viaje internacional ---------- */

test('ficha de viaje: una venta internacional trae checklist y marcarlo la actualiza', async () => {
  const created = (await j('POST', '/sales', validSale())).body; // México → internacional
  assert.equal(created.international, true);
  assert.equal(created.checklist.length, 6);
  assert.ok(created.checklist.every((c) => c.ok === false));
  const r = await j('PATCH', `/sales/${created.id}/docs`, { passport: true, flight: true });
  assert.equal(r.status, 200);
  assert.equal(r.body.checklist.find((c) => c.key === 'passport').ok, true);
  assert.equal(r.body.checklist.find((c) => c.key === 'hotel').ok, false);
});

test('ficha de viaje: una venta nacional (Perú) no es internacional', async () => {
  const created = (await j('POST', '/sales', validSale({ destination: 'Cusco', country: 'Perú' }))).body;
  assert.equal(created.international, false);
  assert.deepEqual(created.checklist, []);
});

test('International Travel Control: agrupa por crítico/pendiente/al día', async () => {
  const r = await j('GET', '/travel-control');
  assert.equal(r.status, 200);
  const { counts, critical, pending, ok } = r.body;
  assert.equal(counts.critical + counts.pending + counts.ok, critical.length + pending.length + ok.length);
  critical.concat(pending).forEach((s) => assert.ok(s.missing.length > 0));
});

test('Travel Requirements: semáforo por venta, se puede verificar y persiste', async () => {
  const created = (await j('POST', '/sales', validSale())).body;
  const r0 = await j('GET', `/sales/${created.id}/requirements`);
  assert.equal(r0.body.items.length, 6);
  assert.ok(r0.body.items.every((it) => it.status === 'pendiente'));
  const r1 = await j('PATCH', `/sales/${created.id}/requirements/passport`, { status: 'verificado', source: 'migraciones.gob.pe' });
  assert.equal(r1.body.items.find((it) => it.key === 'passport').status, 'verificado');
  assert.ok(r1.body.items.find((it) => it.key === 'passport').checkedAt);
  assert.equal((await j('PATCH', `/sales/${created.id}/requirements/no-existe`, { status: 'verificado' })).status, 404);
});

test('Itinerario inteligente: agregar y quitar componentes, ordenados por hora', async () => {
  const created = (await j('POST', '/sales', validSale())).body;
  await j('POST', `/sales/${created.id}/itinerary`, { type: 'hotel', title: 'Check-in hotel', time: '15:00' });
  const withFlight = await j('POST', `/sales/${created.id}/itinerary`, { type: 'vuelo', title: 'Vuelo de ida', time: '06:30' });
  assert.equal(withFlight.body.components.length, 2);
  assert.equal(withFlight.body.components[0].title, 'Vuelo de ida'); // 06:30 antes que 15:00
  const itemId = withFlight.body.components[0].id;
  const after = await j('DELETE', `/sales/${created.id}/itinerary/${itemId}`);
  assert.equal(after.body.components.length, 1);
  assert.equal((await j('POST', `/sales/${created.id}/itinerary`, { title: '' })).status, 400);
});

test('Recordatorio al cliente: se registra con fecha y queda en el historial de la venta', async () => {
  const created = (await j('POST', '/sales', validSale())).body;
  const r = await j('POST', `/sales/${created.id}/reminders`, { channel: 'whatsapp', note: 'Falta el seguro de viaje' });
  assert.equal(r.status, 201);
  assert.equal(r.body.reminders.length, 1);
  assert.equal(r.body.reminders[0].channel, 'whatsapp');
  assert.ok(r.body.reminders[0].at);
});

test('Editar cliente: PATCH actualiza sus datos y los propaga a sus ventas', async () => {
  const created = (await j('POST', '/sales', validSale())).body;
  const r = await j('PATCH', `/clients/${created.clientId}`, { name: 'María Pérez G.', phone: '999 111 222', email: 'maria.g@mail.com' });
  assert.equal(r.status, 200);
  assert.equal(r.body.name, 'María Pérez G.');
  const sale = (await j('GET', `/sales/${created.id}`)).body;
  assert.equal(sale.client.name, 'María Pérez G.');
  assert.equal(sale.client.email, 'maria.g@mail.com');
});

test('Perfil de viajero y paquetes sugeridos: detecta gustos por destino y sugiere del catálogo', async () => {
  const client = (await j('POST', '/clients', { name: 'Viajero Playa', phone: '999 222 333' })).body;
  await j('POST', '/sales', validSale({ client: { name: 'Viajero Playa', phone: '999 222 333' }, destination: 'Cancún', country: 'México', amount: 6000, cost: 4800, passengers: 2 }));
  const r = await j('GET', `/clients/${client.id}`);
  assert.equal(r.status, 200);
  assert.ok(r.body.profile.topTags.some((t) => t.key === 'playa'));
  assert.ok(r.body.recommendedPackages.length > 0);
  assert.ok(r.body.recommendedPackages.every((p) => p.reason));
});

test('Enviar sugerencia de paquete al cliente: queda registrada con fecha y canal', async () => {
  const client = (await j('POST', '/clients', { name: 'Cliente Sugerido', phone: '999 333 444' })).body;
  const r = await j('POST', `/clients/${client.id}/suggestions`, { channel: 'email', packageIds: ['PKG-01'], note: 'Te puede interesar' });
  assert.equal(r.status, 201);
  assert.equal(r.body.suggestions.length, 1);
  assert.equal(r.body.suggestions[0].channel, 'email');
  assert.equal(r.body.suggestions[0].packages[0].id, 'PKG-01');
});

test('Centro de incidencias: crea, detecta conflicto con el traslado y se resuelve', async () => {
  const created = (await j('POST', '/sales', validSale())).body;
  const inc = await j('POST', '/incidents', {
    saleId: created.id, problem: 'Vuelo retrasado', originalTime: '14:30', newTime: '17:45', transferTime: '18:30',
  });
  assert.equal(inc.status, 201);
  assert.equal(inc.body.conflict, true); // 17:45 + 1h margen > 18:30
  assert.equal((await j('POST', '/incidents', { saleId: created.id, problem: '' })).status, 400);
  await j('PATCH', `/incidents/${inc.body.id}/actions/contactar_proveedor`, { done: true });
  const resolved = await j('PATCH', `/incidents/${inc.body.id}/resolve`);
  assert.equal(resolved.body.status, 'resuelta');
  assert.ok(Object.values(resolved.body.actions).every(Boolean));
});
