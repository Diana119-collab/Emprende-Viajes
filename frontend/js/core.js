/**
 * Núcleo de negocio de Emprende Viajes.
 *
 * Módulo ESM sin dependencias: lo usa el backend (Node) y el frontend en
 * "modo demo" (navegador + localStorage), así las reglas viven en un solo lugar.
 *
 * Regla del modelo (pitch): comisión = 30% de la utilidad de cada venta.
 */

export const COMMISSION_RATE = 0.3;
export const STATUSES = ['en_proceso', 'confirmada', 'en_viaje', 'finalizada'];
export const STATUS_LABEL = {
  en_proceso: 'En proceso',
  confirmada: 'Confirmada',
  en_viaje: 'En viaje',
  finalizada: 'Finalizada',
};
export const NEXT_ACTION = {
  en_proceso: 'Confirmación de reservas',
  confirmada: 'Voucher enviado',
  en_viaje: 'Seguimiento en destino',
  finalizada: 'Encuesta y cierre',
};
/** La comisión pasa a "pagada" desde este estado en adelante. */
export const COMMISSION_PAID_FROM = 'confirmada';
export const TICKET_CATEGORIES = ['Reservas', 'Documentación', 'Comisiones', 'Herramientas', 'Otro'];
export const TICKET_PRIORITIES = ['baja', 'media', 'alta'];

/* ---------- módulos de viaje internacional ---------- */
/** Ficha "Viaje internacional": checklist que se genera por venta. */
export const DOC_ITEMS = [
  { key: 'passport', label: 'Pasaporte registrado' },
  { key: 'flight', label: 'Vuelo confirmado' },
  { key: 'hotel', label: 'Hotel confirmado' },
  { key: 'insurance', label: 'Seguro de viaje' },
  { key: 'transfer', label: 'Traslado confirmado' },
  { key: 'entryDoc', label: 'Documento de entrada / visa' },
];
/** Travel Requirements: semáforo migratorio verificado por el agente contra fuentes oficiales. */
export const REQUIREMENT_ITEMS = [
  { key: 'passport', label: 'Pasaporte' },
  { key: 'visa', label: 'Visa o autorización de ingreso' },
  { key: 'health', label: 'Requisitos sanitarios' },
  { key: 'docs', label: 'Documentos y condiciones de entrada' },
  { key: 'insurance', label: 'Seguro recomendado u obligatorio' },
  { key: 'restrictions', label: 'Restricciones relevantes' },
];
export const REQUIREMENT_STATUSES = ['pendiente', 'verificado', 'no_aplica'];
/** Itinerario inteligente: tipos de componentes que arma un viaje. */
export const COMPONENT_TYPES = [
  { key: 'vuelo', label: 'Vuelo' },
  { key: 'hotel', label: 'Hotel' },
  { key: 'traslado', label: 'Traslado' },
  { key: 'actividad', label: 'Actividad' },
  { key: 'seguro', label: 'Seguro' },
];
/** Centro de incidencias internacionales: acciones sugeridas. */
export const INCIDENT_ACTIONS = [
  { key: 'contactar_proveedor', label: 'Contactar proveedor' },
  { key: 'modificar_traslado', label: 'Modificar traslado' },
  { key: 'avisar_cliente', label: 'Avisar al cliente' },
  { key: 'asignar', label: 'Asignar incidencia' },
];
/** Días de anticipación desde los que una venta internacional con pendientes pasa a "crítica". */
export const CRITICAL_WINDOW_DAYS = 5;

export const DESTINATIONS = [
  ['Cancún', 'México'], ['Punta Cana', 'R. Dominicana'], ['Madrid', 'España'],
  ['Nueva York', 'EE.UU.'], ['Miami', 'EE.UU.'], ['Río de Janeiro', 'Brasil'],
  ['Buenos Aires', 'Argentina'], ['Cartagena', 'Colombia'], ['Cusco', 'Perú'],
  ['París', 'Francia'], ['Roma', 'Italia'], ['Santiago', 'Chile'],
].map(([name, country]) => ({ name, country }));

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/* ---------- utilidades ---------- */
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const monthKey = (iso) => iso.slice(0, 7);
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export function daysBetween(fromISO, toISOStr) {
  const [a, b] = [fromISO, toISOStr].map((s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)));
  return Math.round((b - a) / 86400000);
}
const isISODate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const digits = (s) => String(s || '').replace(/\D/g, '');
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const pct = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);

export function computeSaleMoney(amount, cost) {
  const profit = round2(Math.max(0, amount - cost));
  return { profit, commission: round2(profit * COMMISSION_RATE) };
}

/* ---------- Ficha "Viaje internacional" ---------- */
/** Un viaje es internacional si el país del destino no es Perú (o no se indicó país). */
export function isInternational(country) {
  const n = norm(country);
  return !!n && n !== 'peru';
}
export function saleChecklist(sale) {
  const docs = sale.docs || {};
  return DOC_ITEMS.map((it) => ({ ...it, ok: !!docs[it.key] }));
}
/** Semáforo de International Travel Control: 'ok' | 'pending' | 'critical' | 'na' (no internacional o ya finalizada). */
export function saleTravelLevel(sale, todayISO) {
  if (!isInternational(sale.country) || sale.status === 'finalizada') return { level: 'na', missing: [], daysLeft: null };
  const missing = saleChecklist(sale).filter((c) => !c.ok);
  const daysLeft = daysBetween(todayISO, sale.travelDate);
  const level = !missing.length ? 'ok' : (daysLeft <= CRITICAL_WINDOW_DAYS ? 'critical' : 'pending');
  return { level, missing, daysLeft };
}
/** Explica en una frase por qué una venta internacional está crítica, pendiente o al día. */
export function travelReasonText({ level, daysLeft, missing }) {
  if (!level || level === 'na') return '';
  const when = daysLeft == null ? ''
    : daysLeft === 0 ? 'hoy'
    : daysLeft > 0 ? `en ${daysLeft} día${daysLeft === 1 ? '' : 's'}`
    : `hace ${-daysLeft} día${-daysLeft === 1 ? '' : 's'}`;
  if (level === 'ok') return 'Todo en orden: no falta nada por completar antes del viaje.';
  const n = missing.length;
  const items = missing.join(', ');
  if (level === 'critical') return `Crítico: el viaje sale ${when} y todavía falta${n === 1 ? '' : 'n'} ${n} ítem${n === 1 ? '' : 's'} por completar: ${items}.`;
  return `Pendiente: falta${n === 1 ? '' : 'n'} ${n} ítem${n === 1 ? '' : 's'} antes del viaje (sale ${when}): ${items}.`;
}

/* ---------- validación ---------- */
export function validateSale(p, today) {
  const errors = {};
  const c = p?.client || {};
  const name = String(c.name || '').trim();
  const phone = String(c.phone || '').trim();
  const email = String(c.email || '').trim();
  if (name.length < 3) errors.name = 'Ingresa el nombre completo del cliente.';
  if (digits(phone).length < 7 || digits(phone).length > 15) errors.phone = 'Ingresa un teléfono válido (7 a 15 dígitos).';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'El correo no tiene un formato válido.';

  const destination = String(p?.destination || '').trim();
  if (!destination) errors.destination = 'Elige o escribe un destino.';
  if (!isISODate(p?.travelDate)) errors.travelDate = 'Elige la fecha de viaje.';
  else if (p.travelDate < today) errors.travelDate = 'La fecha de viaje no puede estar en el pasado.';
  const passengers = Number(p?.passengers);
  if (!Number.isInteger(passengers) || passengers < 1 || passengers > 30) errors.passengers = 'Pasajeros: de 1 a 30.';

  const amount = Number(p?.amount);
  const cost = Number(p?.cost);
  if (!(amount > 0)) errors.amount = 'El monto de venta debe ser mayor que 0.';
  if (!(cost >= 0) || p?.cost === '' || p?.cost == null) errors.cost = 'Ingresa el costo del proveedor (puede ser 0).';
  else if (amount > 0 && cost > amount) errors.cost = 'El costo no puede superar el monto de venta.';

  if (Object.keys(errors).length) throw new HttpError(400, 'Datos inválidos', errors);
  return {
    client: { name, phone, email },
    destination,
    country: String(p.country || '').trim(),
    travelDate: p.travelDate,
    passengers,
    amount: round2(amount),
    cost: round2(cost),
    notes: String(p.notes || '').trim().slice(0, 500),
  };
}

/* ---------- datos de ejemplo ---------- */
export function seedDb(now = new Date()) {
  const today = toISO(now);
  const curKey = monthKey(today);
  const dayInMonth = (offset, day) => {
    const key = shiftMonth(curKey, offset);
    const [y, m] = key.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    const d = Math.min(day, last);
    return `${key}-${pad(d)}`;
  };
  const clamp = (iso) => (iso > today ? today : iso);

  const clients = [
    ['Laura García', '987 654 321', 'laura@email.com'],
    ['Carlos Romero', '986 111 222', 'carlos.romero@email.com'],
    ['Ana Torres', '985 333 444', 'ana.torres@email.com'],
    ['Jorge Silva', '984 555 666', 'jorge.silva@email.com'],
    ['Patricia Mendoza', '983 777 888', 'patricia.m@email.com'],
    ['Marcos Vidal', '982 999 000', 'marcos.vidal@email.com'],
    ['Rosa Quispe', '981 212 323', 'rosa.quispe@email.com'],
    ['Diego Paredes', '980 434 545', ''],
  ].map(([name, phone, email], i) => ({
    id: `C-${pad(i + 1)}`, name, phone, email, createdAt: today,
  }));

  // [cliente, destino, país, mesOffset, día, viaje(±días desde hoy), pax, monto, costo, estado]
  const rows = [
    [0, 'Cancún', 'México', 0, 2, 38, 2, 4850, 4180, 'confirmada'],
    [1, 'Madrid', 'España', 0, 5, 62, 2, 3800, 3290, 'en_proceso'],
    [2, 'Punta Cana', 'R. Dominicana', 0, 9, 21, 3, 4900, 4260, 'confirmada'],
    [3, 'Nueva York', 'EE.UU.', -1, 20, -1, 1, 7100, 6180, 'en_viaje'],
    [4, 'Río de Janeiro', 'Brasil', -1, 12, 15, 2, 3800, 3300, 'en_proceso'],
    [5, 'Cusco', 'Perú', -1, 5, -12, 4, 2600, 2240, 'finalizada'],
    [6, 'Cartagena', 'Colombia', -2, 18, -35, 2, 3100, 2700, 'finalizada'],
    [7, 'Miami', 'EE.UU.', -2, 6, -50, 2, 5200, 4560, 'finalizada'],
    [0, 'Buenos Aires', 'Argentina', -3, 15, -75, 2, 4100, 3580, 'finalizada'],
    [1, 'Cancún', 'México', -4, 10, -110, 2, 3600, 3140, 'finalizada'],
    [2, 'Cusco', 'Perú', -5, 3, -140, 2, 2200, 1900, 'finalizada'],
  ];
  // Ficha "Viaje internacional": estado de documentos de ejemplo por fila (índice = fila de `rows`).
  const DOCS_BY_ROW = {
    0: { passport: true, flight: true, hotel: true, insurance: false, transfer: true, entryDoc: true }, // falta seguro
    1: { passport: true, flight: false, hotel: false, insurance: false, transfer: false, entryDoc: true }, // recién arrancando
    2: { passport: true, flight: true, hotel: true, insurance: true, transfer: true, entryDoc: true }, // completo
    3: { passport: true, flight: true, hotel: true, insurance: true, transfer: false, entryDoc: true }, // ya viajando, falta traslado
    4: { passport: false, flight: false, hotel: true, insurance: false, transfer: false, entryDoc: false },
  };
  // Travel Requirements: semáforo pre-cargado solo para la venta ya lista (Punta Cana) y una a medio verificar (Cancún).
  const REQUIREMENTS_BY_ROW = {
    0: REQUIREMENT_ITEMS.map((it, i) => ({ key: it.key, status: i < 3 ? 'verificado' : 'pendiente', source: i < 3 ? 'Cancillería - migraciones.gob.pe' : '', checkedAt: i < 3 ? today : null })),
    2: REQUIREMENT_ITEMS.map((it) => ({ key: it.key, status: 'verificado', source: 'Embajada R. Dominicana en Perú', checkedAt: today })),
  };
  // Itinerario inteligente: componentes de ejemplo para la venta ya confirmada de Punta Cana.
  const COMPONENTS_BY_ROW = {
    2: [
      { id: 'IT-001', type: 'vuelo', title: 'Vuelo Lima → Punta Cana', date: null, time: '06:30', notes: 'Vuelo directo' },
      { id: 'IT-002', type: 'traslado', title: 'Traslado aeropuerto → hotel', date: null, time: '13:10', notes: '' },
      { id: 'IT-003', type: 'hotel', title: 'Check-in hotel', date: null, time: '15:00', notes: 'Todo incluido' },
    ],
  };
  const sales = rows.map(([ci, destination, country, mOff, day, travelOff, passengers, amount, cost, status], i) => {
    const c = clients[ci];
    const saleDate = clamp(dayInMonth(mOff, day));
    const idx = STATUSES.indexOf(status);
    const travelDate = toISO(addDays(now, travelOff));
    const components = (COMPONENTS_BY_ROW[i] || []).map((x) => ({ ...x, date: x.date || travelDate }));
    return {
      id: `V-${1001 + i}`,
      clientId: c.id,
      client: { name: c.name, phone: c.phone, email: c.email },
      destination, country, passengers, amount, cost,
      ...computeSaleMoney(amount, cost),
      saleDate,
      travelDate,
      status,
      notes: '',
      history: STATUSES.slice(0, idx + 1).map((s) => ({ status: s, at: saleDate })),
      docs: DOCS_BY_ROW[i] || {},
      requirements: REQUIREMENTS_BY_ROW[i] || null,
      components,
      reminders: [],
    };
  });

  const lessons = (titles) => titles.map(([title, minutes]) => ({ title, minutes }));
  const courseDefs = [
    ['Fundamentos del turismo', 'Cómo funciona la industria: proveedores, mayoristas y tipos de producto.',
      lessons([['El ecosistema turístico', 12], ['Tipos de viajes y perfiles de cliente', 15], ['Temporadas y tarifas', 10], ['Glosario esencial', 8]])],
    ['Cotizar y armar paquetes', 'Convierte una necesidad del cliente en una propuesta clara y rentable.',
      lessons([['Descubrir la necesidad del cliente', 14], ['Armar una cotización paso a paso', 18], ['Márgenes y utilidad', 12], ['Cómo presentar y cerrar', 15]])],
    ['Reservas, documentación y visas', 'Lo que el cliente necesita antes de viajar; el back office lo ejecuta contigo.',
      lessons([['Flujo de reserva', 10], ['Documentos de viaje y visas', 16], ['Seguros de viaje', 9]])],
    ['Cobros, comisiones y contabilidad', 'Cómo se registra cada venta y cuándo se paga tu comisión.',
      lessons([['Registrar una venta correctamente', 8], ['Cómo se calcula tu comisión', 10], ['Comprobantes y pagos', 11]])],
    ['Atención de incidencias', 'Qué hacer cuando algo cambia: vuelos, hoteles, reclamos.',
      lessons([['Cambios y cancelaciones', 13], ['Comunicar malas noticias', 9], ['Escalar al soporte', 6]])],
  ];
  let lid = 0;
  const courses = courseDefs.map(([title, description, ls], i) => ({
    id: `K-${i + 1}`, title, description,
    lessons: ls.map((l) => ({ id: `L-${++lid}`, ...l })),
  }));
  const completed = ['L-1', 'L-2', 'L-3', 'L-4', 'L-5', 'L-6'];

  return {
    agent: { name: 'Magda', role: 'Ejecutiva de Viajes', commissionRate: COMMISSION_RATE },
    clients,
    sales,
    training: { courses, completed },
    tickets: [{
      id: 'T-001', subject: '¿Cómo cargo un proveedor nuevo?', category: 'Herramientas', priority: 'baja',
      message: 'Quiero registrar un mayorista con el que ya trabajé.', status: 'resuelto', createdAt: today,
      replies: [{ from: 'Soporte', text: 'Escríbenos el nombre y RUC del proveedor y lo damos de alta en el día.', at: today }],
    }],
    // Centro de incidencias internacionales: ejemplos variados (vuelos con retraso, un caso sin
    // conflicto de horario, un imprevisto que no es de vuelo y un caso ya resuelto).
    incidents: [
      {
        // Vuelo retrasado por la aerolínea, con conflicto: la nueva hora de llegada choca con el traslado ya reservado.
        id: 'INC-001', saleId: sales[1].id, problem: 'Vuelo retrasado por la aerolínea',
        originalTime: '14:30', newTime: '17:45', transferTime: '18:30',
        notes: 'La aerolínea notificó el cambio esta mañana.',
        actions: { contactar_proveedor: false, modificar_traslado: false, avisar_cliente: false, asignar: false },
        status: 'abierta', createdAt: today,
      },
      {
        // Otro vuelo con retraso (aterrizaje reprogramado) que también choca con el traslado.
        id: 'INC-002', saleId: sales[0].id, problem: 'Vuelo retrasado: aterrizaje reprogramado',
        originalTime: '09:15', newTime: '12:40', transferTime: '13:00',
        notes: 'La aerolínea recién confirmó la nueva hora de llegada.',
        actions: { contactar_proveedor: true, modificar_traslado: false, avisar_cliente: false, asignar: false },
        status: 'abierta', createdAt: today,
      },
      {
        // Imprevisto que no es de vuelo: overbooking de hotel.
        id: 'INC-003', saleId: sales[4].id, problem: 'Hotel informó overbooking y reasignó habitación',
        originalTime: '', newTime: '', transferTime: '',
        notes: 'Se gestiona el cambio a un hotel equivalente en la misma zona.',
        actions: { contactar_proveedor: true, modificar_traslado: false, avisar_cliente: false, asignar: false },
        status: 'abierta', createdAt: today,
      },
      {
        // Vuelo de regreso adelantado, sin traslado registrado (sin conflicto) — ya resuelta.
        id: 'INC-004', saleId: sales[3].id, problem: 'Vuelo de regreso adelantado por la aerolínea',
        originalTime: '22:10', newTime: '19:40', transferTime: '',
        notes: 'Se avisó al cliente y se reprogramó la recogida.',
        actions: { contactar_proveedor: true, modificar_traslado: true, avisar_cliente: true, asignar: true },
        status: 'resuelta', createdAt: today,
      },
    ],
    seq: { sale: 1001 + rows.length, client: clients.length + 1, ticket: 2, itin: 3, incident: 5, reminder: 1 },
  };
}

/**
 * Repara una base de datos guardada por una versión anterior (localStorage del navegador o
 * `data/db.json` del backend) para que tenga los campos que agregaron los módulos nuevos.
 * Sin esto, abrir una sesión vieja rompe pantallas como Incidencias con "db.incidents is undefined".
 */
export function migrateDb(db) {
  db.agent = db.agent || { name: 'Magda', role: 'Ejecutiva de Viajes', commissionRate: COMMISSION_RATE };
  db.clients = db.clients || [];
  db.sales = (db.sales || []).map((s) => ({
    ...s,
    docs: s.docs || {},
    requirements: s.requirements || null,
    components: s.components || [],
    reminders: s.reminders || [],
  }));
  db.training = db.training || { courses: [], completed: [] };
  db.tickets = db.tickets || [];
  db.incidents = db.incidents || [];
  db.seq = db.seq || {};
  db.seq.sale = db.seq.sale || (1001 + db.sales.length);
  db.seq.client = db.seq.client || (db.clients.length + 1);
  db.seq.ticket = db.seq.ticket || (db.tickets.length + 1);
  db.seq.itin = db.seq.itin || 1;
  db.seq.incident = db.seq.incident || (db.incidents.length + 1);
  db.seq.reminder = db.seq.reminder || 1;
  return db;
}

/* ---------- motor de negocio ---------- */
export function createEngine(db, { save = () => {}, now = () => new Date() } = {}) {
  const today = () => toISO(now());
  const commit = () => save(db);
  const withCommission = (s) => {
    const travel = saleTravelLevel(s, today());
    const intl = isInternational(s.country);
    const checklist = intl ? saleChecklist(s) : [];
    return {
      ...s,
      commissionStatus: STATUSES.indexOf(s.status) >= STATUSES.indexOf(COMMISSION_PAID_FROM) ? 'pagada' : 'en_proceso',
      nextAction: NEXT_ACTION[s.status],
      international: intl,
      checklist,
      travelLevel: travel.level,
      daysLeft: travel.daysLeft,
      travelReason: intl ? travelReasonText({ level: travel.level, daysLeft: travel.daysLeft, missing: checklist.filter((c) => !c.ok).map((c) => c.label) }) : '',
      reminders: s.reminders || [],
    };
  };
  const toMin = (hhmm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  const withIncident = (inc) => {
    const sale = db.sales.find((x) => x.id === inc.saleId);
    const newMin = toMin(inc.newTime);
    const transferMin = toMin(inc.transferTime);
    const conflict = newMin != null && transferMin != null && (newMin + 60) > transferMin;
    return {
      ...inc, conflict,
      sale: sale ? { id: sale.id, destination: sale.destination, country: sale.country, client: sale.client, travelDate: sale.travelDate } : null,
    };
  };
  const findSale = (id) => {
    const s = db.sales.find((x) => x.id === id);
    if (!s) throw new HttpError(404, 'Venta no encontrada');
    return s;
  };
  const sumBy = (arr, k) => round2(arr.reduce((t, x) => t + x[k], 0));
  const paidOf = (arr) => arr.filter((s) => withCommission(s).commissionStatus === 'pagada');

  const engine = {
    meta() {
      return {
        agent: db.agent, destinations: DESTINATIONS, statuses: STATUSES, statusLabel: STATUS_LABEL,
        commissionRate: COMMISSION_RATE, ticketCategories: TICKET_CATEGORIES, today: today(),
      };
    },

    dashboard(month = monthKey(today())) {
      const prevKey = shiftMonth(month, -1);
      const cur = db.sales.filter((s) => monthKey(s.saleDate) === month);
      const prev = db.sales.filter((s) => monthKey(s.saleDate) === prevKey);
      const kpi = {
        closed: cur.length, income: sumBy(cur, 'amount'), commission: sumBy(cur, 'commission'),
      };
      const prevKpi = { closed: prev.length, income: sumBy(prev, 'amount'), commission: sumBy(prev, 'commission') };
      const t = today();
      const upcoming = db.sales
        .filter((s) => s.status !== 'finalizada' && s.travelDate >= t)
        .sort((a, b) => a.travelDate.localeCompare(b.travelDate));
      const nextTrip = upcoming[0]
        ? { ...withCommission(upcoming[0]), daysLeft: daysBetween(t, upcoming[0].travelDate) }
        : null;
      const pending = db.sales.filter((s) => s.status === 'en_proceso').map(withCommission);
      const series = [];
      for (let i = 5; i >= 0; i--) {
        const key = shiftMonth(month, -i);
        const list = db.sales.filter((s) => monthKey(s.saleDate) === key);
        series.push({
          month: key, label: MONTH_SHORT[Number(key.slice(5)) - 1],
          income: sumBy(list, 'amount'), commission: sumBy(list, 'commission'), count: list.length,
        });
      }
      const training = engine.training();
      return {
        month, agent: db.agent, kpi,
        delta: {
          closed: pct(kpi.closed, prevKpi.closed), income: pct(kpi.income, prevKpi.income),
          commission: pct(kpi.commission, prevKpi.commission),
        },
        nextTrip, pending, series,
        training: { percent: training.overall.percent, next: training.next },
        openTickets: db.tickets.filter((x) => x.status !== 'resuelto').length,
      };
    },

    listSales({ status, q } = {}) {
      const needle = norm(q);
      let list = db.sales.map(withCommission);
      if (status && status !== 'todas') list = list.filter((s) => s.status === status);
      if (needle) list = list.filter((s) => norm(`${s.client.name} ${s.destination} ${s.country} ${s.id}`).includes(needle));
      list.sort((a, b) => b.saleDate.localeCompare(a.saleDate) || b.id.localeCompare(a.id));
      const counts = { todas: db.sales.length };
      STATUSES.forEach((s) => { counts[s] = db.sales.filter((x) => x.status === s).length; });
      return { items: list, counts };
    },

    getSale: (id) => withCommission(findSale(id)),

    createSale(payload) {
      const v = validateSale(payload, today());
      const phoneKey = digits(v.client.phone);
      let client = db.clients.find((c) => digits(c.phone) === phoneKey)
        || (v.client.email && db.clients.find((c) => c.email && c.email.toLowerCase() === v.client.email.toLowerCase()));
      if (!client) {
        client = { id: `C-${pad(db.seq.client++)}`, ...v.client, createdAt: today() };
        db.clients.push(client);
      } else {
        client.name = v.client.name || client.name;
        client.email = v.client.email || client.email;
      }
      const sale = {
        id: `V-${db.seq.sale++}`,
        clientId: client.id,
        client: { name: client.name, phone: client.phone, email: client.email },
        destination: v.destination, country: v.country, passengers: v.passengers,
        amount: v.amount, cost: v.cost, ...computeSaleMoney(v.amount, v.cost),
        saleDate: today(), travelDate: v.travelDate, status: 'en_proceso', notes: v.notes,
        history: [{ status: 'en_proceso', at: today() }],
      };
      db.sales.push(sale);
      commit();
      return withCommission(sale);
    },

    updateSaleStatus(id, status) {
      if (!STATUSES.includes(status)) throw new HttpError(400, 'Estado inválido', { status: `Usa: ${STATUSES.join(', ')}` });
      const s = findSale(id);
      if (s.status !== status) {
        s.status = status;
        s.history.push({ status, at: today() });
        commit();
      }
      return withCommission(s);
    },

    listClients({ q } = {}) {
      const needle = norm(q);
      const items = db.clients.map((c) => {
        const mine = db.sales.filter((s) => s.clientId === c.id);
        const last = [...mine].sort((a, b) => b.saleDate.localeCompare(a.saleDate))[0];
        return { ...c, salesCount: mine.length, totalAmount: sumBy(mine, 'amount'), lastDestination: last?.destination || null };
      }).filter((c) => !needle || norm(`${c.name} ${c.email} ${c.phone}`).includes(needle));
      items.sort((a, b) => b.totalAmount - a.totalAmount || a.name.localeCompare(b.name));
      return { items };
    },

    getClient(id) {
      const c = db.clients.find((x) => x.id === id);
      if (!c) throw new HttpError(404, 'Cliente no encontrado');
      return { ...c, sales: db.sales.filter((s) => s.clientId === id).map(withCommission) };
    },

    createClient(p) {
      const name = String(p?.name || '').trim();
      const phone = String(p?.phone || '').trim();
      const email = String(p?.email || '').trim();
      const errors = {};
      if (name.length < 3) errors.name = 'Ingresa el nombre completo.';
      if (digits(phone).length < 7 || digits(phone).length > 15) errors.phone = 'Ingresa un teléfono válido.';
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Correo inválido.';
      if (Object.keys(errors).length) throw new HttpError(400, 'Datos inválidos', errors);
      if (db.clients.some((c) => digits(c.phone) === digits(phone))) {
        throw new HttpError(409, 'Ya existe un cliente con ese teléfono', { phone: 'Teléfono ya registrado.' });
      }
      const c = { id: `C-${pad(db.seq.client++)}`, name, phone, email, createdAt: today() };
      db.clients.push(c);
      commit();
      return c;
    },

    commissions(month = monthKey(today())) {
      const rows = db.sales.filter((s) => monthKey(s.saleDate) === month).map(withCommission)
        .sort((a, b) => b.saleDate.localeCompare(a.saleDate));
      const paid = rows.filter((r) => r.commissionStatus === 'pagada');
      const pending = rows.filter((r) => r.commissionStatus !== 'pagada');
      const dash = engine.dashboard(month);
      return {
        month, rate: COMMISSION_RATE,
        summary: {
          generated: sumBy(rows, 'commission'), closed: rows.length,
          paid: sumBy(paid, 'commission'), pending: sumBy(pending, 'commission'),
          salesAmount: sumBy(rows, 'amount'),
        },
        series: dash.series, rows,
        allTime: { paid: sumBy(paidOf(db.sales), 'commission'), generated: sumBy(db.sales, 'commission') },
      };
    },

    training() {
      const done = new Set(db.training.completed);
      const courses = db.training.courses.map((c) => {
        const completed = c.lessons.filter((l) => done.has(l.id)).length;
        return {
          ...c,
          lessons: c.lessons.map((l) => ({ ...l, done: done.has(l.id) })),
          completed, total: c.lessons.length,
          percent: Math.round((completed / c.lessons.length) * 100),
          minutes: c.lessons.reduce((t, l) => t + l.minutes, 0),
        };
      });
      const totalL = courses.reduce((t, c) => t + c.total, 0);
      const doneL = courses.reduce((t, c) => t + c.completed, 0);
      const percent = totalL ? Math.round((doneL / totalL) * 100) : 0;
      const nextCourse = courses.find((c) => c.percent < 100);
      const next = nextCourse ? { course: nextCourse.title, lesson: nextCourse.lessons.find((l) => !l.done) } : null;
      return { courses, overall: { percent, completed: doneL, total: totalL, certified: percent === 100 }, next };
    },

    toggleLesson(lessonId) {
      const exists = db.training.courses.some((c) => c.lessons.some((l) => l.id === lessonId));
      if (!exists) throw new HttpError(404, 'Lección no encontrada');
      const set = new Set(db.training.completed);
      set.has(lessonId) ? set.delete(lessonId) : set.add(lessonId);
      db.training.completed = [...set];
      commit();
      return engine.training();
    },

    listTickets() {
      return { items: [...db.tickets].sort((a, b) => b.id.localeCompare(a.id)) };
    },

    /* ---- Módulo 1: Ficha "Viaje internacional" ---- */
    updateSaleDocs(id, patch) {
      const s = findSale(id);
      const next = { ...(s.docs || {}) };
      DOC_ITEMS.forEach((it) => { if (patch && Object.prototype.hasOwnProperty.call(patch, it.key)) next[it.key] = !!patch[it.key]; });
      s.docs = next;
      commit();
      return withCommission(s);
    },

    /* ---- Módulo 3: Travel Requirements (semáforo migratorio) ---- */
    listRequirements(id) {
      const s = findSale(id);
      const base = s.requirements || REQUIREMENT_ITEMS.map((it) => ({ key: it.key, status: 'pendiente', source: '', checkedAt: null }));
      return {
        saleId: s.id, destination: s.destination, country: s.country,
        items: REQUIREMENT_ITEMS.map((it) => ({ ...it, ...(base.find((r) => r.key === it.key) || { status: 'pendiente', source: '', checkedAt: null }) })),
      };
    },
    updateRequirement(id, key, patch) {
      const s = findSale(id);
      if (!REQUIREMENT_ITEMS.some((it) => it.key === key)) throw new HttpError(404, 'Requisito no encontrado');
      const status = REQUIREMENT_STATUSES.includes(patch?.status) ? patch.status : 'pendiente';
      const source = String(patch?.source || '').trim().slice(0, 200);
      const base = s.requirements || REQUIREMENT_ITEMS.map((it) => ({ key: it.key, status: 'pendiente', source: '', checkedAt: null }));
      s.requirements = base.map((r) => (r.key === key ? { key, status, source, checkedAt: status === 'pendiente' ? null : today() } : r));
      commit();
      return engine.listRequirements(id);
    },

    /* ---- Módulo 4: Itinerario inteligente ---- */
    addItineraryItem(id, p) {
      const s = findSale(id);
      const title = String(p?.title || '').trim();
      if (title.length < 2) throw new HttpError(400, 'Datos inválidos', { title: 'Escribe un título para este ítem.' });
      const type = COMPONENT_TYPES.some((t) => t.key === p?.type) ? p.type : 'actividad';
      const time = /^\d{1,2}:\d{2}$/.test(p?.time || '') ? p.time : '00:00';
      const date = isISODate(p?.date) ? p.date : s.travelDate;
      const item = { id: `IT-${String(db.seq.itin++).padStart(3, '0')}`, type, title, date, time, notes: String(p?.notes || '').trim().slice(0, 200) };
      s.components = [...(s.components || []), item].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
      commit();
      return withCommission(s);
    },
    removeItineraryItem(id, itemId) {
      const s = findSale(id);
      s.components = (s.components || []).filter((x) => x.id !== itemId);
      commit();
      return withCommission(s);
    },

    /* ---- Recordatorios al cliente (apoyo a los módulos 2 y 5) ---- */
    sendReminder(id, p) {
      const s = findSale(id);
      const channel = ['whatsapp', 'email', 'llamada'].includes(p?.channel) ? p.channel : 'whatsapp';
      const note = String(p?.note || '').trim().slice(0, 200);
      const rem = { id: `R-${String(db.seq.reminder++).padStart(3, '0')}`, channel, note, at: today() };
      s.reminders = [...(s.reminders || []), rem];
      commit();
      return withCommission(s);
    },

    /* ---- Módulo 2: International Travel Control ---- */
    travelControl() {
      const items = db.sales.map(withCommission).filter((s) => s.international && s.status !== 'finalizada');
      const bucket = (level) => items.filter((s) => s.travelLevel === level)
        .sort((a, b) => a.daysLeft - b.daysLeft)
        .map((s) => ({
          id: s.id, destination: s.destination, country: s.country, client: s.client,
          travelDate: s.travelDate, daysLeft: s.daysLeft, level: s.travelLevel,
          missing: s.checklist.filter((c) => !c.ok).map((c) => c.label),
          reason: s.travelReason,
        }));
      const critical = bucket('critical');
      const pending = bucket('pending');
      const ok = bucket('ok');
      return { counts: { critical: critical.length, pending: pending.length, ok: ok.length }, critical, pending, ok };
    },

    /* ---- Módulo 6: Centro de incidencias internacionales ---- */
    listIncidents() {
      return { items: [...db.incidents].sort((a, b) => b.id.localeCompare(a.id)).map(withIncident) };
    },
    getIncident(id) {
      const inc = db.incidents.find((x) => x.id === id);
      if (!inc) throw new HttpError(404, 'Incidencia no encontrada');
      return withIncident(inc);
    },
    createIncident(p) {
      const sale = db.sales.find((x) => x.id === p?.saleId);
      const errors = {};
      if (!sale) errors.saleId = 'Elige una venta válida.';
      const problem = String(p?.problem || '').trim();
      if (problem.length < 3) errors.problem = 'Describe el problema.';
      if (Object.keys(errors).length) throw new HttpError(400, 'Datos inválidos', errors);
      const inc = {
        id: `INC-${String(db.seq.incident++).padStart(3, '0')}`,
        saleId: sale.id, problem,
        originalTime: String(p?.originalTime || '').trim(), newTime: String(p?.newTime || '').trim(), transferTime: String(p?.transferTime || '').trim(),
        notes: String(p?.notes || '').trim().slice(0, 300),
        actions: Object.fromEntries(INCIDENT_ACTIONS.map((a) => [a.key, false])),
        status: 'abierta', createdAt: today(),
      };
      db.incidents.push(inc);
      commit();
      return withIncident(inc);
    },
    updateIncidentAction(id, key, done) {
      const inc = db.incidents.find((x) => x.id === id);
      if (!inc) throw new HttpError(404, 'Incidencia no encontrada');
      if (!INCIDENT_ACTIONS.some((a) => a.key === key)) throw new HttpError(404, 'Acción no encontrada');
      inc.actions = { ...inc.actions, [key]: !!done };
      if (Object.values(inc.actions).every(Boolean)) inc.status = 'resuelta';
      else if (inc.status === 'resuelta') inc.status = 'abierta';
      commit();
      return withIncident(inc);
    },
    resolveIncident(id) {
      const inc = db.incidents.find((x) => x.id === id);
      if (!inc) throw new HttpError(404, 'Incidencia no encontrada');
      inc.status = 'resuelta';
      Object.keys(inc.actions).forEach((k) => { inc.actions[k] = true; });
      commit();
      return withIncident(inc);
    },

    createTicket(p) {
      const subject = String(p?.subject || '').trim();
      const message = String(p?.message || '').trim();
      const category = TICKET_CATEGORIES.includes(p?.category) ? p.category : 'Otro';
      const priority = TICKET_PRIORITIES.includes(p?.priority) ? p.priority : 'media';
      const errors = {};
      if (subject.length < 3) errors.subject = 'Escribe un asunto.';
      if (message.length < 5) errors.message = 'Cuéntanos un poco más del problema.';
      if (Object.keys(errors).length) throw new HttpError(400, 'Datos inválidos', errors);
      const t = {
        id: `T-${String(db.seq.ticket++).padStart(3, '0')}`, subject, category, priority, message,
        status: 'abierto', createdAt: today(),
        replies: [{ from: 'Soporte', text: 'Recibimos tu solicitud. Un asesor del back office te responderá pronto.', at: today() }],
      };
      db.tickets.push(t);
      commit();
      return t;
    },
  };
  return engine;
}
