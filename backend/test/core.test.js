import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedDb, migrateDb, createEngine, estimateHotelTier } from '../../frontend/js/core.js';

test('migrateDb repara una base de datos guardada antes de los módulos de viaje internacional', () => {
  const old = {
    agent: { name: 'Magda', role: 'Ejecutiva de Viajes' },
    clients: [{ id: 'C-01', name: 'Ana', phone: '999', email: '' }],
    sales: [{
      id: 'V-1001', clientId: 'C-01', client: { name: 'Ana', phone: '999', email: '' },
      destination: 'Madrid', country: 'España', passengers: 2, amount: 100, cost: 50,
      profit: 50, commission: 15, saleDate: '2026-01-01', travelDate: '2026-02-01',
      status: 'en_proceso', notes: '', history: [],
      // sin docs, requirements, components, reminders (base "vieja")
    }],
    training: { courses: [], completed: [] },
    tickets: [],
    // sin incidents ni seq completo
    seq: { sale: 1002, client: 2 },
  };

  const fixed = migrateDb(old);
  assert.ok(Array.isArray(fixed.incidents));
  assert.equal(fixed.incidents.length, 0);
  assert.equal(fixed.seq.incident, 1);
  assert.equal(fixed.seq.itin, 1);
  assert.equal(fixed.seq.reminder, 1);
  assert.deepEqual(fixed.sales[0].docs, {});
  assert.deepEqual(fixed.sales[0].components, []);
  assert.deepEqual(fixed.sales[0].reminders, []);

  // El motor debe poder operar de inmediato sobre la base reparada (antes esto lanzaba
  // "can't access property Symbol.iterator, db.incidents is undefined").
  const engine = createEngine(fixed, { save: () => {} });
  assert.deepEqual(engine.listIncidents().items, []);
  const withReminder = engine.sendReminder('V-1001', { channel: 'whatsapp' });
  assert.equal(withReminder.reminders.length, 1);
});

test('seedDb ya incluye varios incidentes de ejemplo (vuelos con retraso y un caso no relacionado a vuelos)', () => {
  const db = seedDb();
  assert.ok(db.incidents.length >= 3);
  const problems = db.incidents.map((i) => i.problem.toLowerCase());
  assert.ok(problems.some((p) => p.includes('vuelo')));
  assert.ok(problems.some((p) => !p.includes('vuelo')));
  assert.ok(db.incidents.some((i) => i.status === 'resuelta'));
});

test('estimateHotelTier clasifica por monto de venta por pasajero', () => {
  assert.equal(estimateHotelTier(1000, 2), 'economico'); // 500/pax
  assert.equal(estimateHotelTier(3000, 2), 'estandar'); // 1500/pax
  assert.equal(estimateHotelTier(6000, 2), 'lujo'); // 3000/pax
});

test('travelerProfile detecta el gusto por playa y sugiere paquetes acordes; editar cliente actualiza sus ventas', () => {
  const db = seedDb();
  const engine = createEngine(db, { save: () => {} });
  // Ana Torres (C-03): Punta Cana (playa) y Cusco (aventura/naturaleza/cultura).
  const profile = engine.travelerProfile('C-03');
  assert.equal(profile.sampleSize, 2);
  assert.ok(profile.topTags.some((t) => t.key === 'playa'));
  assert.ok(profile.summary.length > 0);

  const suggestions = engine.suggestPackages('C-03');
  assert.ok(suggestions.length > 0);
  assert.ok(suggestions.every((p) => p.reason));

  const updated = engine.updateClient('C-03', { name: 'Ana Torres V.', phone: '985 333 444', email: 'ana.v@email.com' });
  assert.equal(updated.name, 'Ana Torres V.');
  assert.ok(db.sales.filter((s) => s.clientId === 'C-03').every((s) => s.client.name === 'Ana Torres V.'));

  const sent = engine.sendClientSuggestion('C-03', { channel: 'whatsapp', packageIds: [suggestions[0].id], note: suggestions[0].reason });
  assert.equal(sent.suggestions.length, 1);
  assert.equal(sent.suggestions[0].packages[0].id, suggestions[0].id);
});

test('annualCommissions agrega los 12 meses del año y lista los años con datos', () => {
  const db = seedDb();
  const engine = createEngine(db, { save: () => {} });
  const thisYear = Number(db.sales[0].saleDate.slice(0, 4));
  const annual = engine.annualCommissions(thisYear);
  assert.equal(annual.series.length, 12);
  assert.ok(annual.years.includes(String(thisYear)));
  const monthly = annual.series.reduce((sum, m) => sum + m.commission, 0);
  assert.ok(Math.abs(monthly - annual.summary.generated) < 0.01);
});
