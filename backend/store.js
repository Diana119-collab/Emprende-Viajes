import fs from 'node:fs';
import path from 'node:path';
import { seedDb } from '../frontend/js/core.js';

/**
 * Persistencia simple en un archivo JSON (suficiente para el piloto).
 * Para producción, reemplazar por PostgreSQL/SQLite manteniendo la misma
 * interfaz: load() y save(db).
 */
export function createFileStore(file) {
  const load = () => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      const db = seedDb();
      save(db);
      return db;
    }
  };
  const save = (db) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, file); // escritura atómica
  };
  return { load, save, file };
}

/** Store en memoria, usado por los tests. */
export function createMemoryStore() {
  let db = seedDb();
  return { load: () => db, save: (d) => { db = d; }, reset: () => { db = seedDb(); return db; } };
}
