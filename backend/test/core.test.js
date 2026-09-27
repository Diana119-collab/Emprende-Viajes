import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedDb, migrateDb, createEngine } from '../../frontend/js/core.js';

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
