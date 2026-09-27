import { api } from './api.js';
import { exportCommissionsExcel } from './report.js';
import {
  STATUSES, STATUS_LABEL, NEXT_ACTION, COMMISSION_RATE, DESTINATIONS, TICKET_CATEGORIES, HttpError, validateSale, computeSaleMoney, daysBetween,
  DOC_ITEMS, REQUIREMENT_ITEMS, COMPONENT_TYPES, INCIDENT_ACTIONS, HOTEL_TIER_LABEL,
} from './core.js';
import {
  $, $$, esc, money, fmtDate, monthNameCap, avatar, statusBadge, commBadge, icon, toast, openModal, closeModal,
  countUp, confetti, debounce, ring, barChart, fieldErr, downloadCSV, travelLevelBadge, dotStatus, reqBadge, openOutreach,
} from './ui.js';

/* ------------------------------------------------------------------ */
/* Estado compartido entre vistas                                     */
/* ------------------------------------------------------------------ */
export const shared = { meta: null, refresh: () => {}, go: (h) => { location.hash = h; } };

const monthsBack = (todayISO, n = 6) => {
  const out = [];
  let y = +todayISO.slice(0, 4), m = +todayISO.slice(5, 7);
  for (let i = 0; i < n; i++) { out.push(`${y}-${String(m).padStart(2, '0')}`); m--; if (!m) { m = 12; y--; } }
  return out;
};
const monthSelect = (id, current) => `<label class="sel-wrap"><span class="sr-only">Mes</span>
  <select id="${id}" class="select">${monthsBack(shared.meta.today).map((k) => `<option value="${k}" ${k === current ? 'selected' : ''}>${esc(monthNameCap(k))}</option>`).join('')}</select></label>`;

const pageHead = (title, sub, actions = '') => `<header class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}</div>${actions ? `<div class="head-actions">${actions}</div>` : ''}</header>`;
const empty = (title, text, cta = '') => `<div class="empty"><div class="empty-ico">${icon.plane}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${cta}</div>`;
const relDays = (n) => (n === 0 ? 'hoy' : n > 0 ? `en ${n} día${n === 1 ? '' : 's'}` : `hace ${-n} día${n === -1 ? '' : 's'}`);

/** Texto del mensaje que se le manda al cliente cuando le recordamos lo que falta antes de viajar. */
const reminderMessage = (s) => `Hola ${s.client.name.split(' ')[0]}, te escribimos de Emprende Viajes sobre tu viaje a ${s.destination}${s.country ? `, ${s.country}` : ''}. ${s.travelReason || 'Cualquier consulta, aquí estamos.'}`;

/** Envía un recordatorio al cliente (queda registrado en la venta) y abre WhatsApp o el correo con el mensaje listo, desde una lista, sin abrir el detalle. */
async function quickRemind(id) {
  try {
    const s = await api.sale(id);
    await api.sendReminder(id, { channel: 'whatsapp', note: s.travelReason });
    const opened = openOutreach('whatsapp', { phone: s.client.phone, text: reminderMessage(s) });
    toast(opened ? 'Recordatorio registrado. Se abrió WhatsApp con el mensaje listo para enviar.' : 'Recordatorio registrado (el cliente no tiene teléfono).');
  } catch (e) { toast(e.message, 'err'); }
}

/* ------------------------------------------------------------------ */
/* Detalle de venta (drawer)                                          */
/* ------------------------------------------------------------------ */
export async function openSaleDrawer(id, { onBack } = {}) {
  let s;
  try { s = await api.sale(id); } catch (e) { toast(e.message, 'err'); return; }
  const idx = STATUSES.indexOf(s.status);
  const next = STATUSES[idx + 1];
  const left = daysBetween(shared.meta.today, s.travelDate);
  const html = `
    <div class="drawer-head">
      <p class="eyebrow">Venta ${esc(s.id)}</p>
      <h2>${esc(s.destination)}${s.country ? `, ${esc(s.country)}` : ''}</h2>
      ${statusBadge(s.status)}${s.international ? travelLevelBadge(s.travelLevel) : ''}
    </div>
    ${s.international && s.travelReason ? `<div class="note ${s.travelLevel === 'critical' ? 'bad' : s.travelLevel === 'pending' ? 'warn' : 'good'}">
      <strong>${icon.warning} ¿Por qué ${s.travelLevel === 'critical' ? 'está crítico' : s.travelLevel === 'pending' ? 'está pendiente' : 'está al día'}?</strong>
      <p>${esc(s.travelReason)}</p></div>` : ''}
    <div class="person">${avatar(s.client.name, 48)}<div><strong>${esc(s.client.name)}</strong>
      <div class="contact">${s.client.phone ? `<a href="tel:${esc(s.client.phone.replace(/\s/g, ''))}">${icon.phone}${esc(s.client.phone)}</a>` : ''}
      ${s.client.email ? `<a href="mailto:${esc(s.client.email)}">${icon.mail}${esc(s.client.email)}</a>` : ''}</div></div></div>
    <ol class="timeline" aria-label="Progreso de la venta">
      ${STATUSES.map((st, i) => {
        const h = s.history.find((x) => x.status === st);
        return `<li class="${i < idx ? 'done' : i === idx ? 'now' : ''}"><span class="dot">${i < idx ? icon.check : i + 1}</span>
          <div><strong>${esc(STATUS_LABEL[st])}</strong><small>${h ? esc(fmtDate(h.at)) : esc(NEXT_ACTION[st])}</small></div></li>`;
      }).join('')}
    </ol>
    <dl class="facts">
      <div><dt>${icon.calendar} Fecha de viaje</dt><dd>${esc(fmtDate(s.travelDate))} <small>(${relDays(left)})</small></dd></div>
      <div><dt>${icon.users} Pasajeros</dt><dd>${s.passengers}</dd></div>
      <div><dt>Próxima acción</dt><dd>${esc(s.nextAction)}</dd></div>
      <div><dt>Fecha de venta</dt><dd>${esc(fmtDate(s.saleDate))}</dd></div>
    </dl>
    <div class="money-box">
      <div><span>Monto de venta</span><strong>${money(s.amount)}</strong></div>
      <div><span>Costo proveedor</span><strong>${money(s.cost)}</strong></div>
      <div><span>Utilidad</span><strong>${money(s.profit)}</strong></div>
      <div class="hl"><span>Tu comisión (${Math.round(COMMISSION_RATE * 100)}%)</span><strong>${money(s.commission)}</strong> ${commBadge(s.commissionStatus)}</div>
    </div>
    ${s.notes ? `<div class="note"><strong>Notas</strong><p>${esc(s.notes)}</p></div>` : ''}
    ${s.international ? intlBlock(s) : ''}
    ${next ? `<button class="btn ghost block" data-advance="${esc(s.id)}" data-next="${next}">Simular avance a “${esc(STATUS_LABEL[next])}” ${icon.arrow}</button>
      <p class="hint">Solo demo: en la operación real, el back office actualiza el estado por ti.</p>` : `<p class="hint ok">${icon.check} Venta finalizada. ¡Buen trabajo!</p>`}`;
  openModal(html, {
    drawer: true, label: `Detalle de venta ${s.id}`, onBack,
    onMount: (root) => {
      const b = $('[data-advance]', root);
      if (b) b.onclick = async () => {
        b.disabled = true;
        try {
          await api.setStatus(b.dataset.advance, b.dataset.next);
          toast(`Estado actualizado: ${STATUS_LABEL[b.dataset.next]}`);
          closeModal(true);
          await openSaleDrawer(id, { onBack });
          shared.refresh();
        } catch (e) { toast(e.message, 'err'); b.disabled = false; }
      };
      if (s.international) bindIntlBlock(root, s, onBack);
    },
  });
}

/* ------------------------------------------------------------------ */
/* Módulos de viaje internacional (dentro del detalle de venta)       */
/* ------------------------------------------------------------------ */
const COMPONENT_ICON = { vuelo: icon.plane, hotel: icon.home, traslado: icon.route, actividad: icon.award, seguro: icon.lock };

function intlBlock(s) {
  const missing = s.checklist.filter((c) => !c.ok);
  return `
    <section class="intl-block">
      <div class="intl-head"><h3>${icon.globe} Ficha de viaje internacional</h3>${travelLevelBadge(s.travelLevel)}</div>
      <p class="hint">${missing.length ? `Faltan ${missing.length} de ${s.checklist.length} ítems.` : 'Checklist completo.'}</p>
      <ul class="doc-list">${s.checklist.map((c) => `<li><label class="check"><input type="checkbox" data-doc="${c.key}" ${c.ok ? 'checked' : ''}><span class="box">${icon.check}</span><span class="lt">${esc(c.label)}</span></label></li>`).join('')}</ul>

      <h3 class="mini-title">${icon.route} Itinerario</h3>
      ${s.components.length ? `<ol class="itin-list">${s.components.map((it) => `<li><span class="itin-ico">${COMPONENT_ICON[it.type] || icon.route}</span>
        <div class="itin-main"><strong>${esc(it.time)} · ${esc(it.title)}</strong>${it.notes ? `<small>${esc(it.notes)}</small>` : ''}</div>
        <button type="button" class="icon-btn tiny" data-rm-itin="${esc(it.id)}" aria-label="Quitar">${icon.x}</button></li>`).join('')}</ol>`
        : '<p class="hint">Aún no agregaste vuelos, hotel, traslados ni actividades.</p>'}
      <form id="itin-form" class="itin-form">
        <select name="type" aria-label="Tipo">${COMPONENT_TYPES.map((t) => `<option value="${t.key}">${t.label}</option>`).join('')}</select>
        <input type="time" name="time" value="09:00" aria-label="Hora">
        <input type="text" name="title" placeholder="Ej. Vuelo Lima → Madrid" aria-label="Título">
        <button type="submit" class="btn ghost tiny">${icon.plus} Agregar</button>
      </form>

      <div class="intl-actions">
        <button type="button" class="btn ghost" data-client-view>${icon.plane} Vista del cliente</button>
        <button type="button" class="btn ghost" data-open-req>${icon.lock} Requisitos migratorios</button>
        <button type="button" class="btn ghost" data-remind="${esc(s.id)}">${icon.bell} Enviar recordatorio</button>
      </div>
      ${s.reminders && s.reminders.length ? `<p class="hint">${icon.check} Último recordatorio enviado: ${esc(fmtDate(s.reminders[s.reminders.length - 1].at))} (${esc(s.reminders[s.reminders.length - 1].channel)}).</p>` : ''}
    </section>`;
}

function bindIntlBlock(root, s, onBack) {
  $$('[data-doc]', root).forEach((cb) => {
    cb.onchange = async () => {
      cb.disabled = true;
      try { await api.updateSaleDocs(s.id, { [cb.dataset.doc]: cb.checked }); shared.refresh(); closeModal(true); await openSaleDrawer(s.id, { onBack }); }
      catch (e) { toast(e.message, 'err'); cb.checked = !cb.checked; cb.disabled = false; }
    };
  });
  $$('[data-rm-itin]', root).forEach((b) => {
    b.onclick = async () => {
      try { await api.removeItineraryItem(s.id, b.dataset.rmItin); closeModal(true); await openSaleDrawer(s.id, { onBack }); }
      catch (e) { toast(e.message, 'err'); }
    };
  });
  const form = $('#itin-form', root);
  if (form) form.onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      await api.addItineraryItem(s.id, { type: form.type.value, time: form.time.value, title: form.title.value });
      closeModal(true); await openSaleDrawer(s.id, { onBack });
    } catch (e) { toast(e instanceof HttpError && e.details ? Object.values(e.details)[0] : e.message, 'err'); }
  };
  const cv = $('[data-client-view]', root);
  if (cv) cv.onclick = () => { closeModal(true); openClientView(s.id, { onBack: () => openSaleDrawer(s.id, { onBack }) }); };
  const rq = $('[data-open-req]', root);
  if (rq) rq.onclick = () => { closeModal(true); openRequirementsModal(s.id, { onBack: () => openSaleDrawer(s.id, { onBack }) }); };
  const rem = $('[data-remind]', root);
  if (rem) rem.onclick = async () => {
    rem.disabled = true;
    try {
      await api.sendReminder(s.id, { channel: 'whatsapp', note: s.travelReason });
      openOutreach('whatsapp', { phone: s.client.phone, text: reminderMessage(s) });
      toast('Recordatorio registrado. Se abrió WhatsApp con el mensaje listo para enviar.');
      closeModal(true); await openSaleDrawer(s.id, { onBack });
    } catch (e) { toast(e.message, 'err'); rem.disabled = false; }
  };
}

/* ------------------------------------------------------------------ */
/* Módulo 5: Cliente preparado para viajar (vista de solo lectura)    */
/* ------------------------------------------------------------------ */
export async function openClientView(id, { onBack } = {}) {
  let s;
  try { s = await api.sale(id); } catch (e) { toast(e.message, 'err'); return; }
  const left = daysBetween(shared.meta.today, s.travelDate);
  const doneCount = s.checklist.filter((c) => c.ok).length;
  openModal(`
    <div class="drawer-head"><p class="eyebrow">Vista del cliente</p><h2>${esc(s.client.name.split(' ')[0])}, tu viaje a ${esc(s.destination)} ${left >= 0 ? 'está en camino' : 'ya comenzó'}</h2></div>
    <p class="sub">${left > 0 ? `Faltan ${left} día${left === 1 ? '' : 's'}.` : left === 0 ? 'Hoy es el día del viaje.' : 'Buen viaje.'} ${doneCount}/${s.checklist.length} listo.</p>
    <ul class="checks client-checks">${s.checklist.map((c) => dotStatus(c.ok, c.label)).join('')}</ul>
    <div class="cv-tips">
      <div class="cv-tip"><h3>Antes de viajar</h3><p>Ten a mano tu pasaporte, la reserva y confirma el check-in online 24 horas antes.</p></div>
      <div class="cv-tip"><h3>Al llegar</h3><p>${s.components.find((c) => c.type === 'traslado') ? `Tu traslado te recoge a las ${esc(s.components.find((c) => c.type === 'traslado').time)}.` : 'Coordina tu traslado con la agencia antes de salir.'}</p></div>
      <div class="cv-tip"><h3>Durante el viaje</h3><p>Cualquier imprevisto, escríbenos: estamos para resolverlo por ti.</p></div>
    </div>
    ${s.components.length ? `<h3 class="mini-title">Tu itinerario</h3><ol class="itin-list">${s.components.map((it) => `<li><span class="itin-ico">${COMPONENT_ICON[it.type] || icon.route}</span><div class="itin-main"><strong>${esc(it.time)} · ${esc(it.title)}</strong>${it.notes ? `<small>${esc(it.notes)}</small>` : ''}</div></li>`).join('')}</ol>` : ''}
    <div class="person"><span class="avatar" style="--s:40px;background:#f28c28" aria-hidden="true">${esc((shared.meta.agent.name || '?')[0])}</span>
      <div><strong>${esc(shared.meta.agent.name)}</strong><small>Tu agente · ${esc(shared.meta.agent.role)}</small></div></div>
    <p class="hint">Así es como lo ve tu cliente: tú vendes, nosotros operamos y tu cliente lo siente.</p>`,
  { label: `Vista del cliente ${s.id}`, onBack });
}

/* ------------------------------------------------------------------ */
/* Módulo 3: Travel Requirements (semáforo migratorio)                */
/* ------------------------------------------------------------------ */
export async function openRequirementsModal(id, { onBack } = {}) {
  const r = await api.requirements(id);
  const draw = (data) => `
    <div class="drawer-head"><p class="eyebrow">Requisitos · ${esc(data.saleId)}</p><h2>${esc(data.destination)}${data.country ? `, ${esc(data.country)}` : ''}</h2></div>
    <ul class="req-list">${data.items.map((it) => `<li class="req-row">
      <div class="req-main"><strong>${esc(it.label)}</strong>${it.source ? `<small>${esc(it.source)}${it.checkedAt ? ` · ${esc(fmtDate(it.checkedAt))}` : ''}</small>` : ''}</div>
      ${reqBadge(it.status)}
      <select data-req="${it.key}" aria-label="Estado de ${esc(it.label)}">
        <option value="pendiente" ${it.status === 'pendiente' ? 'selected' : ''}>Falta verificar</option>
        <option value="verificado" ${it.status === 'verificado' ? 'selected' : ''}>Verificado</option>
        <option value="no_aplica" ${it.status === 'no_aplica' ? 'selected' : ''}>No aplica</option>
      </select></li>`).join('')}</ul>`;
  openModal(draw(r), {
    label: `Requisitos de viaje ${r.saleId}`, onBack,
    onMount: (root) => {
      $$('[data-req]', root).forEach((sel) => {
        sel.onchange = async () => {
          try {
            const updated = await api.updateRequirement(id, sel.dataset.req, { status: sel.value });
            root.innerHTML = draw(updated);
            $$('[data-req]', root).forEach((s2) => { s2.onchange = sel.onchange; });
          } catch (e) { toast(e.message, 'err'); }
        };
      });
    },
  });
}

/* ------------------------------------------------------------------ */
/* Cotización rápida (modal)                                          */
/* ------------------------------------------------------------------ */
export function openQuote() {
  const html = `<h2>Crear cotización</h2><p class="sub">Calcula rápido el precio y tu comisión estimada antes de vender.</p>
    <form id="quote" class="form" novalidate>
      <label class="field"><span>Destino</span><input list="dest-list" name="destination" placeholder="Ej. Cancún" autocomplete="off"></label>
      <div class="row2">
        <label class="field"><span>Pasajeros</span><input type="number" name="pax" min="1" max="30" value="2" inputmode="numeric"></label>
        <label class="field"><span>Precio por persona (US$)</span><input type="number" name="price" min="0" step="0.01" placeholder="0" inputmode="decimal"></label>
      </div>
      <label class="field"><span>Costo por persona (US$)</span><input type="number" name="cost" min="0" step="0.01" placeholder="0" inputmode="decimal"></label>
      <div class="calc" aria-live="polite">
        <div><span>Total a cotizar</span><strong data-o="total">$0</strong></div>
        <div><span>Utilidad</span><strong data-o="profit">$0</strong></div>
        <div class="hl"><span>Tu comisión (${Math.round(COMMISSION_RATE * 100)}%)</span><strong data-o="comm">$0</strong></div>
      </div>
      <p class="err" data-o="warn" role="alert"></p>
      <button type="button" class="btn primary block" data-use disabled>Usar en una venta ${icon.arrow}</button>
    </form>`;
  openModal(html, {
    label: 'Crear cotización',
    onMount: (root) => {
      const f = $('#quote', root);
      const read = () => {
        const pax = Math.max(1, Math.floor(+f.pax.value) || 1), price = +f.price.value || 0, cost = +f.cost.value || 0;
        return { pax, total: price * pax, totalCost: cost * pax };
      };
      const upd = () => {
        const { total, totalCost } = read();
        const m = computeSaleMoney(total, totalCost);
        $('[data-o=total]', f).textContent = money(total);
        $('[data-o=profit]', f).textContent = money(total > totalCost ? m.profit : 0);
        $('[data-o=comm]', f).textContent = money(m.commission);
        $('[data-o=warn]', f).textContent = total > 0 && totalCost > total ? 'El costo supera el precio: no habría utilidad.' : '';
        $('[data-use]', f).disabled = !(total > 0 && totalCost <= total);
      };
      f.addEventListener('input', upd);
      $('[data-use]', f).onclick = () => {
        const { pax, total, totalCost } = read();
        const dest = DESTINATIONS.find((d) => d.name.toLowerCase() === f.destination.value.trim().toLowerCase());
        draft = blankDraft();
        Object.assign(draft, { destination: f.destination.value.trim(), country: dest?.country || '', passengers: pax, amount: String(total), cost: String(totalCost) });
        wizard = { step: 1, done: null, errors: {} };
        closeModal(true);
        shared.go('#/venta');
        toast('Cotización cargada en una nueva venta');
      };
    },
  });
}

/* ------------------------------------------------------------------ */
/* Inicio                                                             */
/* ------------------------------------------------------------------ */
let dashMonth = null;
export async function inicio(root) {
  dashMonth = dashMonth || shared.meta.today.slice(0, 7);
  const d = await api.dashboard(dashMonth);
  const delta = (v) => (v == null ? '<span class="delta flat">Sin datos del mes anterior</span>'
    : v === 0 ? '<span class="delta flat">= igual que el mes anterior</span>'
    : `<span class="delta ${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '▲' : '▼'} ${v >= 0 ? '+' : ''}${v}% vs. mes anterior</span>`);
  const t = d.nextTrip;
  const tips = ['Verifica los datos del cliente', 'Confirma el destino y las fechas', 'Revisa las condiciones del viaje'];
  root.innerHTML = `
  <section class="hero">
    <div class="hero-art" aria-hidden="true">
      <svg viewBox="0 0 600 260" preserveAspectRatio="xMaxYMid slice"><defs><linearGradient id="sun" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd08a"/><stop offset="1" stop-color="#f28c28"/></linearGradient></defs>
        <circle cx="470" cy="80" r="46" fill="url(#sun)" opacity=".95"/>
        <path d="M0 200 Q75 170 150 200 T300 200 T450 200 T600 200 V260 H0Z" fill="#fff" opacity=".12"/>
        <path d="M0 225 Q75 195 150 225 T300 225 T450 225 T600 225 V260 H0Z" fill="#fff" opacity=".18"/>
        <g class="plane"><path d="M300 70l70-24-22 46-18-14-10 18-6-20z" fill="#fff" opacity=".95"/></g></svg>
    </div>
    <div class="hero-text">
      <h1>¡Hola, ${esc(d.agent.name)}!</h1>
      <p>Tu próxima gran venta puede estar más cerca de lo que imaginas.</p>
      <span class="tag">Tú vendes. Nosotros operamos.</span>
    </div>
  </section>
  <section class="quick" aria-label="Acciones rápidas">
    <button class="qa" data-qa="quote"><span class="qi c-blue">${icon.quote}</span><strong>Crear cotización</strong><small>Calcula precio y comisión</small></button>
    <a class="qa" href="#/venta"><span class="qi c-green">${icon.sale}</span><strong>Registrar venta</strong><small>En 4 pasos simples</small></a>
    <a class="qa" href="#/clientes"><span class="qi c-purple">${icon.users}</span><strong>Mis clientes</strong><small>Tu cartera</small></a>
    <a class="qa" href="#/comisiones"><span class="qi c-orange">${icon.coin}</span><strong>Mis comisiones</strong><small>Ingresos y estados</small></a>
  </section>

  <div class="grid-main">
    <section class="card">
      <div class="card-head"><h2>Mis resultados</h2>${monthSelect('dash-month', d.month)}</div>
      <div class="kpis">
        <div class="kpi"><span>Ventas cerradas</span><strong data-count="${d.kpi.closed}" data-f="int">0</strong>${delta(d.delta.closed)}</div>
        <div class="kpi"><span>Ingresos generados</span><strong data-count="${d.kpi.income}" data-f="money">$0</strong>${delta(d.delta.income)}</div>
        <div class="kpi"><span>Comisión estimada</span><strong data-count="${d.kpi.commission}" data-f="money">$0</strong>${delta(d.delta.commission)}</div>
      </div>
      <h3 class="mini-title">Comisión de los últimos 6 meses</h3>
      ${barChart(d.series, d.month)}
    </section>

    <aside class="side-col">
      <section class="card next">
        <h2>Mi próximo paso</h2>
        ${t ? `<div class="next-body"><div class="next-ico">${icon.plane}</div>
          <div><strong>${esc(t.destination)}</strong><p>${esc(t.client.name)}</p>
          <p class="when">${icon.calendar} Sale ${relDays(t.daysLeft)} · ${esc(fmtDate(t.travelDate))}</p>${statusBadge(t.status)}</div></div>
          <button class="btn ghost block" data-sale="${esc(t.id)}">Ver más ${icon.arrow}</button>`
          : empty('Todo al día', 'Registra una venta para empezar.', '<a class="btn primary" href="#/venta">Registrar venta</a>')}
      </section>
      <section class="card">
        <h2>Capacitación</h2>
        <div class="train-mini">${ring(d.training.percent, 84)}
          <div><p>${d.training.next ? `Sigue con: <strong>${esc(d.training.next.lesson.title)}</strong>` : '¡Completaste todo el programa!'}</p>
          <a class="link" href="#/capacitacion">Continuar ${icon.arrow}</a></div></div>
      </section>
    </aside>
  </div>

  <div class="grid-2">
    <section class="card">
      <div class="card-head"><h2>Operaciones en proceso</h2><a class="link" href="#/operaciones">Ver todas ${icon.arrow}</a></div>
      ${d.pending.length ? `<ul class="list">${d.pending.slice(0, 4).map((s) => `<li><button class="list-row" data-sale="${esc(s.id)}">
        ${avatar(s.client.name, 38)}<span class="lr-main"><strong>${esc(s.client.name)}</strong><small>${esc(s.destination)} · ${esc(s.nextAction)}</small></span>${statusBadge(s.status)}</button></li>`).join('')}</ul>`
        : empty('Sin operaciones pendientes', 'Cuando registres una venta, la verás aquí.')}
    </section>
    <section class="card tips">
      <h2>${icon.bulb} Consejos</h2>
      <ul class="checks">${tips.map((x) => `<li>${icon.check}${esc(x)}</li>`).join('')}</ul>
      ${d.openTickets ? `<p class="hint">Tienes ${d.openTickets} solicitud${d.openTickets > 1 ? 'es' : ''} abierta${d.openTickets > 1 ? 's' : ''} en <a href="#/soporte">Soporte</a>.</p>` : ''}
    </section>
  </div>`;

  $$('[data-count]', root).forEach((el) => countUp(el, +el.dataset.count, el.dataset.f === 'money' ? money : (v) => String(Math.round(v))));
  $('#dash-month', root).onchange = (e) => { dashMonth = e.target.value; inicio(root); };
  $('[data-qa=quote]', root).onclick = openQuote;
  shared.refresh = () => inicio(root);
}

/* ------------------------------------------------------------------ */
/* Registrar venta (asistente de 4 pasos)                             */
/* ------------------------------------------------------------------ */
const blankDraft = () => ({ client: { name: '', phone: '', email: '' }, destination: '', country: '', travelDate: '', passengers: 2, amount: '', cost: '', notes: '' });
let draft = blankDraft();
let wizard = { step: 1, done: null, errors: {} };
const STEP_FIELDS = { 1: ['name', 'phone', 'email'], 2: ['destination', 'travelDate', 'passengers'], 3: ['amount', 'cost'] };
const STEPS = ['Cliente', 'Viaje', 'Detalles', 'Confirmación'];

export function prefillClient(c) {
  draft = blankDraft();
  draft.client = { name: c.name, phone: c.phone, email: c.email || '' };
  wizard = { step: 2, done: null, errors: {} };
}

function stepErrors(step) {
  try { validateSale(draft, shared.meta.today); return {}; } catch (e) {
    const all = e.details || {};
    const keep = {};
    (STEP_FIELDS[step] || Object.values(STEP_FIELDS).flat()).forEach((k) => { if (all[k]) keep[k] = all[k]; });
    return keep;
  }
}
const stepOfError = (errs) => Number(Object.keys(STEP_FIELDS).find((s) => STEP_FIELDS[s].some((k) => errs[k]))) || 1;

export async function venta(root) {
  const clients = await api.clients();
  const draw = () => {
    const w = wizard, e = w.errors;
    if (w.done) return drawDone(root, w.done);
    const inv = (k) => (e[k] ? 'aria-invalid="true"' : '');
    const stepper = `<ol class="stepper">${STEPS.map((s, i) => `<li class="${i + 1 < w.step ? 'done' : ''} ${i + 1 === w.step ? 'cur' : ''}" ${i + 1 === w.step ? 'aria-current="step"' : ''}>
      <span class="sn">${i + 1 < w.step ? icon.check : i + 1}</span><span class="sl">${s}</span></li>`).join('')}</ol>`;
    const d = draft, m = computeSaleMoney(+d.amount || 0, +d.cost || 0);
    let body = '';
    if (w.step === 1) {
      body = `<h2>Datos del cliente</h2><p class="sub">Si ya es tu cliente, elige su nombre y completamos el resto.</p>
        <label class="field"><span>Nombre completo</span><input data-f="client.name" list="client-list" value="${esc(d.client.name)}" placeholder="Laura García" autocomplete="off" ${inv('name')}>${fieldErr(e, 'name')}</label>
        <datalist id="client-list">${clients.items.map((c) => `<option value="${esc(c.name)}"></option>`).join('')}</datalist>
        <div class="row2"><label class="field"><span>Teléfono</span><input data-f="client.phone" type="tel" inputmode="tel" value="${esc(d.client.phone)}" placeholder="987 654 321" ${inv('phone')}>${fieldErr(e, 'phone')}</label>
        <label class="field"><span>Correo <em>(opcional)</em></span><input data-f="client.email" type="email" inputmode="email" value="${esc(d.client.email)}" placeholder="laura@email.com" ${inv('email')}>${fieldErr(e, 'email')}</label></div>
        <p class="hint" id="existing" ${clients.items.some((c) => c.name === d.client.name) ? '' : 'hidden'}>${icon.check} Cliente existente: su ficha se actualizará.</p>`;
    } else if (w.step === 2) {
      body = `<h2>Datos del viaje</h2><p class="sub">Elige un destino de la lista o escribe el tuyo.</p>
        <div class="row2"><label class="field"><span>Destino</span><input data-f="destination" list="dest-list" value="${esc(d.destination)}" placeholder="Cancún" autocomplete="off" ${inv('destination')}>${fieldErr(e, 'destination')}</label>
        <label class="field"><span>País</span><input data-f="country" value="${esc(d.country)}" placeholder="México"></label></div>
        <div class="row2"><label class="field"><span>Fecha de viaje</span><input data-f="travelDate" type="date" min="${shared.meta.today}" value="${esc(d.travelDate)}" ${inv('travelDate')}>${fieldErr(e, 'travelDate')}</label>
        <div class="field"><span id="pax-l">Pasajeros</span><div class="stepper-num" role="group" aria-labelledby="pax-l">
          <button type="button" class="icon-btn" data-pax="-1" aria-label="Menos pasajeros">−</button><output id="pax-o">${d.passengers}</output>
          <button type="button" class="icon-btn" data-pax="1" aria-label="Más pasajeros">+</button></div>${fieldErr(e, 'passengers')}</div></div>`;
    } else if (w.step === 3) {
      body = `<h2>Detalles económicos</h2><p class="sub">Con el costo del proveedor calculamos tu utilidad y tu comisión al instante.</p>
        <div class="row2"><label class="field"><span>Monto de venta (US$)</span><input data-f="amount" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(d.amount)}" placeholder="4850" ${inv('amount')}>${fieldErr(e, 'amount')}</label>
        <label class="field"><span>Costo del proveedor (US$)</span><input data-f="cost" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(d.cost)}" placeholder="4180" ${inv('cost')}>${fieldErr(e, 'cost')}</label></div>
        <div class="calc" id="calc" aria-live="polite">
          <div><span>Utilidad</span><strong data-o="profit">${money(m.profit)}</strong></div>
          <div><span>Margen</span><strong data-o="margin">${+d.amount > 0 ? Math.round((m.profit / d.amount) * 100) : 0}%</strong></div>
          <div class="hl"><span>Tu comisión (${Math.round(COMMISSION_RATE * 100)}%)</span><strong data-o="comm">${money(m.commission)}</strong></div></div>
        <label class="field"><span>Notas para el back office <em>(opcional)</em></span><textarea data-f="notes" rows="3" maxlength="500" placeholder="Preferencias, alergias, aerolínea deseada…">${esc(d.notes)}</textarea></label>`;
    } else {
      const row = (label, val, st) => `<div class="rv-row"><span>${label}</span><strong>${val || '—'}</strong><button type="button" class="link" data-edit="${st}">Editar</button></div>`;
      body = `<h2>Revisa y confirma</h2><p class="sub">Verifica que todo esté correcto. El back office se encargará del resto.</p>
        <div class="review">
          ${row('Cliente', `${esc(d.client.name)}<small>${esc(d.client.phone)}${d.client.email ? ' · ' + esc(d.client.email) : ''}</small>`, 1)}
          ${row('Viaje', `${esc(d.destination)}${d.country ? ', ' + esc(d.country) : ''}<small>${esc(fmtDate(d.travelDate))} · ${d.passengers} pasajero${d.passengers > 1 ? 's' : ''}</small>`, 2)}
          ${row('Venta', `${money(+d.amount)}<small>Costo ${money(+d.cost)} · Utilidad ${money(m.profit)}</small>`, 3)}
          <div class="rv-row hl"><span>Tu comisión estimada</span><strong>${money(m.commission)}</strong></div>
        </div>${w.errors._server ? `<p class="err" role="alert">${esc(w.errors._server)}</p>` : ''}`;
    }
    root.innerHTML = `${pageHead('Registrar nueva venta', 'Completa los datos en pocos pasos.')}
    <div class="grid-wiz"><section class="card wiz">${stepper}<form id="wf" novalidate>${body}</form>
      <div class="wiz-actions">${w.step > 1 ? `<button class="btn ghost" data-back>${icon.back} Atrás</button>` : '<span></span>'}
        <button class="btn ${w.step === 4 ? 'accent' : 'primary'}" data-next>${w.step === 4 ? `${icon.check} Confirmar venta` : `Siguiente ${icon.arrow}`}</button></div></section>
      <aside class="side-col"><section class="card help"><div class="help-ico">${icon.help}</div><h3>¿Necesitas ayuda?</h3><p>Nuestro equipo te acompaña en todo el proceso.</p>
        <button class="btn ghost block" data-help>Contactar soporte</button></section>
      <section class="card tips"><h3>${icon.bulb} Consejos</h3><ul class="checks"><li>${icon.check}Verifica los datos del cliente</li><li>${icon.check}Confirma el destino y las fechas</li><li>${icon.check}Revisa las condiciones del viaje</li></ul></section></aside></div>
    <datalist id="dest-list">${DESTINATIONS.map((x) => `<option value="${esc(x.name)}">${esc(x.country)}</option>`).join('')}</datalist>`;
    bind();
  };

  const bind = () => {
    const form = $('#wf', root);
    form.onsubmit = (ev) => { ev.preventDefault(); next(); };
    form.oninput = (ev) => {
      const el = ev.target, path = el.dataset.f;
      if (!path) return;
      const ks = path.split('.');
      if (ks.length === 2) draft[ks[0]][ks[1]] = el.value; else draft[path] = el.value;
      if (path === 'client.name') {
        const c = clients.items.find((x) => x.name === el.value);
        $('#existing', root).hidden = !c;
        if (c) {
          draft.client.phone = c.phone; draft.client.email = c.email || '';
          form.querySelector('[data-f="client.phone"]').value = c.phone;
          form.querySelector('[data-f="client.email"]').value = c.email || '';
        }
      }
      if (path === 'destination') {
        const dst = DESTINATIONS.find((x) => x.name.toLowerCase() === el.value.trim().toLowerCase());
        if (dst) { draft.country = dst.country; form.querySelector('[data-f=country]').value = dst.country; }
      }
      if (path === 'amount' || path === 'cost') {
        const m = computeSaleMoney(+draft.amount || 0, +draft.cost || 0), c = $('#calc', root);
        $('[data-o=profit]', c).textContent = money(m.profit);
        $('[data-o=comm]', c).textContent = money(m.commission);
        $('[data-o=margin]', c).textContent = `${+draft.amount > 0 ? Math.round((m.profit / draft.amount) * 100) : 0}%`;
      }
      if (el.getAttribute('aria-invalid')) { el.removeAttribute('aria-invalid'); el.parentElement.querySelector('.err')?.remove(); }
    };
    $$('[data-pax]', root).forEach((b) => { b.onclick = () => { draft.passengers = Math.min(30, Math.max(1, draft.passengers + +b.dataset.pax)); $('#pax-o', root).textContent = draft.passengers; }; });
    $$('[data-edit]', root).forEach((b) => { b.onclick = () => { wizard.step = +b.dataset.edit; wizard.errors = {}; draw(); }; });
    $('[data-back]', root)?.addEventListener('click', () => { wizard.step--; wizard.errors = {}; draw(); scrollTo({ top: 0, behavior: 'smooth' }); });
    $('[data-next]', root).onclick = next;
    $('[data-help]', root).onclick = () => openTicketModal('Reservas');
  };

  const next = async () => {
    const w = wizard;
    if (w.step < 4) {
      w.errors = stepErrors(w.step);
      if (Object.keys(w.errors).length) { draw(); $('[aria-invalid=true]', root)?.focus(); return; }
      w.step++; draw(); scrollTo({ top: 0, behavior: 'smooth' }); return;
    }
    const btn = $('[data-next]', root);
    btn.disabled = true; btn.textContent = 'Registrando…';
    try {
      const sale = await api.createSale(draft);
      w.done = sale; draw(); confetti();
    } catch (e) {
      if (e instanceof HttpError && e.details) { w.errors = e.details; w.step = stepOfError(e.details); toast('Revisa los datos marcados', 'err'); }
      else { w.errors = { _server: e.message }; toast(e.message, 'err'); }
      draw();
    }
  };
  draw();
}

function drawDone(root, s) {
  root.innerHTML = `<section class="card done-card">
    <div class="done-check">${icon.check}</div><h1>¡Venta registrada!</h1>
    <p class="sub">Ya la recibió el back office. Tú sigue vendiendo: nosotros operamos.</p>
    <div class="review small"><div class="rv-row"><span>Código</span><strong>${esc(s.id)}</strong></div>
      <div class="rv-row"><span>Cliente</span><strong>${esc(s.client.name)}</strong></div>
      <div class="rv-row"><span>Destino</span><strong>${esc(s.destination)}</strong></div>
      <div class="rv-row"><span>Monto</span><strong>${money(s.amount)}</strong></div>
      <div class="rv-row hl"><span>Tu comisión estimada</span><strong>${money(s.commission)}</strong></div></div>
    <div class="done-actions"><a class="btn primary" href="#/operaciones" data-sale-open="${esc(s.id)}">Ver en operaciones ${icon.arrow}</a>
      <button class="btn ghost" data-again>Registrar otra venta</button></div></section>`;
  $('[data-again]', root).onclick = () => { draft = blankDraft(); wizard = { step: 1, done: null, errors: {} }; venta(root); };
}

/* ------------------------------------------------------------------ */
/* Operaciones                                                        */
/* ------------------------------------------------------------------ */
const opsState = { status: 'todas', q: '' };
export async function operaciones(root) {
  root.innerHTML = `${pageHead('Operaciones', 'Aquí puedes hacer seguimiento al estado de tus ventas. Nosotros nos encargamos de todo el back office.')}
    <section class="card"><div class="toolbar"><div class="tabs" id="tabs" role="tablist" aria-label="Filtrar por estado"></div>
      <label class="search">${icon.search}<span class="sr-only">Buscar</span><input id="q" type="search" placeholder="Buscar cliente o destino" value="${esc(opsState.q)}"></label></div>
      <div id="ops-list"></div></section>`;
  const load = async () => {
    const { items, counts } = await api.sales({ status: opsState.status, q: opsState.q });
    const tabs = [['todas', 'Todas'], ...STATUSES.map((s) => [s, STATUS_LABEL[s]])];
    $('#tabs', root).innerHTML = tabs.map(([k, l]) => `<button role="tab" aria-selected="${k === opsState.status}" class="tab ${k === opsState.status ? 'on' : ''}" data-tab="${k}">${l} <span>${counts[k] ?? 0}</span></button>`).join('');
    $('#ops-list', root).innerHTML = items.length ? `<div class="table-wrap"><table class="table cardify"><thead><tr><th>Cliente / Viaje</th><th>Fecha de venta</th><th>Estado</th><th>Próxima acción</th><th></th></tr></thead><tbody>
      ${items.map((s) => `<tr data-sale="${esc(s.id)}" tabindex="0"><td data-label="Cliente / Viaje"><div class="cell-person">${avatar(s.client.name, 38)}<div><strong>${esc(s.client.name)}</strong><small>${esc(s.destination)}${s.country ? ', ' + esc(s.country) : ''}</small></div></div></td>
        <td data-label="Fecha de venta">${esc(fmtDate(s.saleDate))}</td><td data-label="Estado">${statusBadge(s.status)}</td><td data-label="Próxima acción">${esc(s.nextAction)}</td>
        <td class="end"><span class="btn tiny ghost">Ver detalle ${icon.arrow}</span></td></tr>`).join('')}</tbody></table></div>`
      : empty('Sin resultados', opsState.q ? 'Prueba con otra búsqueda o cambia el filtro.' : 'Aún no hay ventas en este estado.', '<a class="btn primary" href="#/venta">Registrar venta</a>');
    $$('[data-tab]', root).forEach((b) => { b.onclick = () => { opsState.status = b.dataset.tab; load(); }; });
  };
  $('#q', root).oninput = debounce((e) => { opsState.q = e.target.value; load(); }, 200);
  shared.refresh = load;
  await load();
}

/* ------------------------------------------------------------------ */
/* Módulo 2: International Travel Control                             */
/* ------------------------------------------------------------------ */
export async function travelControl(root) {
  root.innerHTML = `${pageHead('Control de viajes', 'En vez de revisar cada venta manualmente, el sistema te dice qué falta y por qué (International Travel Control).')}<div id="tc-body"></div>`;
  const load = async () => {
    const d = await api.travelControl();
    const row = (s) => `<li class="tc-row-item">
      <button class="list-row tc-row" data-sale="${esc(s.id)}" title="${esc(s.reason || '')}">
      ${avatar(s.client.name, 38)}<span class="lr-main"><strong>${esc(s.destination)}${s.country ? `, ${esc(s.country)}` : ''}</strong>
      <small>${esc(s.client.name)} · Sale ${s.daysLeft != null ? relDays(s.daysLeft) : '—'}</small>
      <small class="tc-missing">${s.missing.map((m) => esc(m)).join(' · ')}</small></span>${travelLevelBadge(s.level)}</button>
      <button type="button" class="btn ghost tiny tc-remind" data-remind="${esc(s.id)}" title="Enviar recordatorio al cliente">${icon.bell}</button></li>`;
    $('#tc-body', root).innerHTML = `
      <div class="kpis three">
        <div class="kpi ic tc-crit"><span class="qi tc-ic-bad">${icon.warning}</span><div><span>Críticos</span><strong>${d.counts.critical}</strong></div></div>
        <div class="kpi ic tc-pend"><span class="qi tc-ic-warn">${icon.warning}</span><div><span>Pendientes</span><strong>${d.counts.pending}</strong></div></div>
        <div class="kpi ic tc-ok"><span class="qi tc-ic-ok">${icon.check}</span><div><span>En orden</span><strong>${d.counts.ok}</strong></div></div>
      </div>
      ${d.critical.length ? `<section class="card"><h2>${icon.warning} Críticos — salen pronto y les falta algo</h2><ul class="list">${d.critical.map(row).join('')}</ul></section>` : ''}
      ${d.pending.length ? `<section class="card"><h2>Pendientes</h2><ul class="list">${d.pending.map(row).join('')}</ul></section>` : ''}
      ${!d.critical.length && !d.pending.length ? `<section class="card">${empty('Todo en orden', 'No hay viajes internacionales con documentación pendiente en este momento.')}</section>` : ''}`;
    $$('[data-remind]', root).forEach((b) => { b.onclick = () => quickRemind(b.dataset.remind); });
  };
  shared.refresh = load;
  await load();
}

/* ------------------------------------------------------------------ */
/* Módulo 3: Travel Requirements — lista de viajes internacionales    */
/* ------------------------------------------------------------------ */
export async function requisitos(root) {
  root.innerHTML = `${pageHead('Requisitos de viaje', 'Semáforo migratorio: lo verifica el agente contra fuentes oficiales, la IA solo organiza y explica.')}<div id="req-body"></div>`;
  const load = async () => {
    const { items } = await api.sales({ status: 'todas' });
    const intl = items.filter((s) => s.international && s.status !== 'finalizada');
    $('#req-body', root).innerHTML = intl.length ? `<div class="cards-grid">${intl.map((s) => `<button class="client-card" data-req-sale="${esc(s.id)}">
      <div class="cc-top">${avatar(s.client.name, 46)}<div><strong>${esc(s.destination)}, ${esc(s.country)}</strong><small>${esc(s.client.name)}</small></div></div>
      <small class="cc-last">Viaja ${esc(fmtDate(s.travelDate))}</small>
      <div class="req-mini">${travelLevelBadge(s.travelLevel)}</div></button>`).join('')}</div>`
      : empty('Sin viajes internacionales activos', 'Cuando registres una venta a otro país, aparecerá aquí.');
    $$('[data-req-sale]', root).forEach((b) => { b.onclick = () => openRequirementsModal(b.dataset.reqSale); });
  };
  shared.refresh = load;
  await load();
}

/* ------------------------------------------------------------------ */
/* Módulo 6: Centro de incidencias internacionales                    */
/* ------------------------------------------------------------------ */
export async function incidencias(root) {
  root.innerHTML = `${pageHead('Centro de incidencias internacionales', 'Tú vendes. Nosotros operamos: aquí resolvemos lo que cambia a último momento.', `<button class="btn primary" id="new-inc">${icon.plus} Nueva incidencia</button>`)}<div id="inc-body"></div>`;
  const load = async () => {
    const { items } = await api.incidents();
    $('#inc-body', root).innerHTML = items.length ? items.map((inc) => `
      <section class="card incident ${inc.status === 'resuelta' ? 'resolved' : ''}">
        <div class="card-head"><div><h2>${esc(inc.id)} — ${esc(inc.sale?.destination || '—')}</h2>
          <p class="sub">${esc(inc.sale?.client.name || '')} · ${esc(inc.problem)}</p></div>
          <span class="badge ${inc.status === 'resuelta' ? 'lvl-ok' : 'lvl-bad'}">${inc.status === 'resuelta' ? 'Resuelta' : 'Abierta'}</span></div>
        ${inc.originalTime || inc.newTime || inc.transferTime ? `<div class="inc-times">
          ${inc.originalTime ? `<div><span>Hora original</span><strong>${esc(inc.originalTime)}</strong></div>` : ''}
          ${inc.newTime ? `<div><span>Nueva hora</span><strong>${esc(inc.newTime)}</strong></div>` : ''}
          ${inc.transferTime ? `<div><span>Traslado reservado</span><strong>${esc(inc.transferTime)}</strong></div>` : ''}
        </div>` : ''}
        ${inc.conflict ? `<div class="note bad"><strong>${icon.warning} Posible conflicto</strong><p>El cliente podría perder el traslado ya reservado.</p></div>` : ''}
        ${inc.notes ? `<p class="hint">${esc(inc.notes)}</p>` : ''}
        <ul class="inc-actions">${INCIDENT_ACTIONS.map((a) => `<li><label class="check"><input type="checkbox" data-inc-action="${a.key}" data-inc="${esc(inc.id)}" ${inc.actions[a.key] ? 'checked' : ''}><span class="box">${icon.check}</span><span class="lt">${esc(a.label)}</span></label></li>`).join('')}</ul>
        ${inc.sale ? `<button class="btn ghost tiny" data-sale="${esc(inc.sale.id)}">Ver venta ${icon.arrow}</button>` : ''}
      </section>`).join('')
      : `<section class="card">${empty('Sin incidencias', 'Cuando algo cambie a último momento, regístralo aquí.')}</section>`;
    $$('[data-inc-action]', root).forEach((cb) => {
      cb.onchange = async () => {
        cb.disabled = true;
        try { await api.setIncidentAction(cb.dataset.inc, cb.dataset.incAction, cb.checked); await load(); }
        catch (e) { toast(e.message, 'err'); cb.checked = !cb.checked; cb.disabled = false; }
      };
    });
  };
  $('#new-inc', root).onclick = () => openIncidentForm(load);
  shared.refresh = load;
  await load();
}

function openIncidentForm(onDone) {
  openModal(`<h2>Registrar incidencia</h2><p class="sub">Cuéntanos qué cambió y con qué venta está relacionado.</p>
    <form id="if" class="form" novalidate>
      <label class="field"><span>Venta</span><select name="saleId" id="if-sale"></select><span class="err" data-e="saleId"></span></label>
      <label class="field"><span>¿Qué pasó?</span><input name="problem" placeholder="Ej. Vuelo retrasado por la aerolínea" autocomplete="off"><span class="err" data-e="problem"></span></label>
      <div class="row3">
        <label class="field"><span>Hora original</span><input name="originalTime" type="time"></label>
        <label class="field"><span>Nueva hora</span><input name="newTime" type="time"></label>
        <label class="field"><span>Traslado reservado</span><input name="transferTime" type="time"></label>
      </div>
      <label class="field"><span>Notas <em>(opcional)</em></span><textarea name="notes" rows="3" maxlength="300"></textarea></label>
      <button class="btn primary block" type="submit">Registrar incidencia</button></form>`, {
    label: 'Registrar incidencia',
    onMount: async (r) => {
      const sel = $('#if-sale', r);
      const { items } = await api.sales({ status: 'todas' });
      const active = items.filter((s) => s.status !== 'finalizada');
      sel.innerHTML = active.map((s) => `<option value="${esc(s.id)}">${esc(s.id)} · ${esc(s.client.name)} · ${esc(s.destination)}</option>`).join('');
      const f = $('#if', r);
      f.onsubmit = async (ev) => {
        ev.preventDefault();
        $$('[data-e]', f).forEach((x) => { x.textContent = ''; });
        try {
          await api.createIncident({ saleId: f.saleId.value, problem: f.problem.value, originalTime: f.originalTime.value, newTime: f.newTime.value, transferTime: f.transferTime.value, notes: f.notes.value });
          toast('Incidencia registrada'); closeModal(); onDone();
        } catch (e) { if (e.details) Object.entries(e.details).forEach(([k, v]) => { const el = $(`[data-e=${k}]`, f); if (el) el.textContent = v; }); else toast(e.message, 'err'); }
      };
    },
  });
}

/* ------------------------------------------------------------------ */
/* Clientes                                                           */
/* ------------------------------------------------------------------ */
let clientQ = '';
export async function clientes(root) {
  root.innerHTML = `${pageHead('Mis clientes', 'Tu cartera de contactos y su historial de compras.', `<button class="btn primary" id="add-client">${icon.plus} Nuevo cliente</button>`)}
    <section class="card"><label class="search wide">${icon.search}<span class="sr-only">Buscar</span><input id="cq" type="search" placeholder="Buscar por nombre, teléfono o correo" value="${esc(clientQ)}"></label><div id="cl-list"></div></section>`;
  const load = async () => {
    const { items } = await api.clients({ q: clientQ });
    $('#cl-list', root).innerHTML = items.length ? `<div class="cards-grid">${items.map((c) => `<button class="client-card" data-client="${esc(c.id)}">
      <div class="cc-top">${avatar(c.name, 46)}<div><strong>${esc(c.name)}</strong><small>${esc(c.phone)}</small></div></div>
      <div class="cc-stats"><div><span>Ventas</span><strong>${c.salesCount}</strong></div><div><span>Total vendido</span><strong>${money(c.totalAmount)}</strong></div></div>
      <small class="cc-last">${c.lastDestination ? `Último destino: ${esc(c.lastDestination)}` : 'Aún sin ventas'}</small></button>`).join('')}</div>`
      : empty('No encontramos clientes', clientQ ? 'Prueba con otro nombre o teléfono.' : 'Agrega tu primer cliente para empezar.');
    $$('[data-client]', root).forEach((b) => { b.onclick = () => openClientDrawer(b.dataset.client); });
  };
  $('#cq', root).oninput = debounce((e) => { clientQ = e.target.value; load(); }, 200);
  $('#add-client', root).onclick = () => openClientForm(load);
  shared.refresh = load;
  await load();
}

async function openClientDrawer(id) {
  const c = await api.client(id);
  const total = c.sales.reduce((t, s) => t + s.amount, 0);
  const lastSg = c.suggestions && c.suggestions.length ? c.suggestions[c.suggestions.length - 1] : null;
  openModal(`<div class="drawer-head"><p class="eyebrow">Cliente ${esc(c.id)}</p><h2>${esc(c.name)}</h2></div>
    <div class="person">${avatar(c.name, 48)}<div><div class="contact">${c.phone ? `<a href="tel:${esc(c.phone.replace(/\s/g, ''))}">${icon.phone}${esc(c.phone)}</a>` : ''}${c.email ? `<a href="mailto:${esc(c.email)}">${icon.mail}${esc(c.email)}</a>` : ''}</div></div>
      <button type="button" class="btn ghost tiny" data-edit-client>${icon.edit} Editar</button></div>
    <div class="money-box"><div><span>Ventas</span><strong>${c.sales.length}</strong></div><div class="hl"><span>Total vendido</span><strong>${money(total)}</strong></div></div>

    <section class="profile-block">
      <h3 class="mini-title">${icon.sparkle} Perfil de viajero</h3>
      <p class="hint">${esc(c.profile.summary)}</p>
      ${c.profile.topTags.length ? `<div class="tag-row">${c.profile.topTags.map((t) => `<span class="chip">${icon.tag}${esc(t.label)}</span>`).join('')}</div>` : ''}
    </section>

    <section class="suggest-block">
      <h3 class="mini-title">${icon.sparkle} Paquetes sugeridos para ${esc(c.name.split(' ')[0])}</h3>
      ${c.recommendedPackages.length ? `<ul class="pkg-list">${c.recommendedPackages.map((p) => `<li class="pkg-card">
        <div class="pkg-main"><strong>${esc(p.destination)}</strong><small>${esc(p.country)} · desde ${money(p.priceFrom)} · ${esc(HOTEL_TIER_LABEL[p.hotelTier])}</small>
        <p class="hint">${esc(p.reason)}</p></div>
        <div class="pkg-actions">
          <button type="button" class="btn ghost tiny" data-send-pkg="${esc(p.id)}" data-channel="whatsapp" data-reason="${esc(p.reason)}">${icon.chat} WhatsApp</button>
          <button type="button" class="btn ghost tiny" data-send-pkg="${esc(p.id)}" data-channel="email" data-reason="${esc(p.reason)}">${icon.mail} Correo</button>
        </div></li>`).join('')}</ul>`
        : '<p class="hint">Aún no hay viajes registrados para sugerir algo a la medida.</p>'}
      ${lastSg ? `<p class="hint">${icon.check} Última sugerencia enviada: ${esc(fmtDate(lastSg.at))} (${esc(lastSg.channel === 'whatsapp' ? 'WhatsApp' : 'correo')}).</p>` : ''}
    </section>

    <h3 class="mini-title">Historial</h3>
    ${c.sales.length ? `<ul class="list">${c.sales.map((s) => `<li><button class="list-row" data-sale="${esc(s.id)}"><span class="lr-main"><strong>${esc(s.destination)}</strong><small>${esc(fmtDate(s.saleDate))} · ${money(s.amount)}</small></span>${statusBadge(s.status)}</button></li>`).join('')}</ul>` : '<p class="hint">Todavía no tiene ventas.</p>'}
    <button class="btn accent block" data-newsale>Nueva venta para ${esc(c.name.split(' ')[0])} ${icon.arrow}</button>`, {
    drawer: true, label: `Cliente ${c.name}`,
    onMount: (r) => {
      $('[data-newsale]', r).onclick = () => { prefillClient(c); closeModal(true); shared.go('#/venta'); };
      $('[data-edit-client]', r).onclick = () => openClientForm(async () => { closeModal(true); await openClientDrawer(id); }, c);
      $$('[data-send-pkg]', r).forEach((b) => {
        b.onclick = async () => {
          b.disabled = true;
          const pkg = c.recommendedPackages.find((p) => p.id === b.dataset.sendPkg);
          const channel = b.dataset.channel;
          const text = `Hola ${c.name.split(' ')[0]}, te queremos recomendar un viaje a ${pkg.destination}, ${pkg.country} (desde ${money(pkg.priceFrom)}). ${pkg.reason}`;
          try {
            await api.sendClientSuggestion(id, { channel, packageIds: [b.dataset.sendPkg], note: b.dataset.reason });
            const opened = openOutreach(channel, { phone: c.phone, email: c.email, subject: `Una recomendación de viaje para ti: ${pkg.destination}`, text });
            toast(opened ? `Sugerencia registrada. Se abrió ${channel === 'whatsapp' ? 'WhatsApp' : 'tu correo'} con el mensaje listo para enviar.` : `Sugerencia registrada (el cliente no tiene ${channel === 'whatsapp' ? 'teléfono' : 'correo'}).`);
            closeModal(true); await openClientDrawer(id);
          } catch (e) { toast(e.message, 'err'); b.disabled = false; }
        };
      });
      $$('[data-sale]', r).forEach((b) => {
        b.onclick = (e) => { e.stopPropagation(); closeModal(true); openSaleDrawer(b.dataset.sale, { onBack: () => openClientDrawer(id) }); };
      });
    },
  });
}

function openClientForm(onDone, existing = null) {
  const isEdit = !!existing;
  openModal(`<h2>${isEdit ? 'Editar cliente' : 'Nuevo cliente'}</h2><form id="cf" class="form" novalidate>
    <label class="field"><span>Nombre completo</span><input name="name" autocomplete="off" value="${esc(existing?.name || '')}"><span class="err" data-e="name"></span></label>
    <div class="row2"><label class="field"><span>Teléfono</span><input name="phone" type="tel" inputmode="tel" value="${esc(existing?.phone || '')}"><span class="err" data-e="phone"></span></label>
    <label class="field"><span>Correo <em>(opcional)</em></span><input name="email" type="email" value="${esc(existing?.email || '')}"><span class="err" data-e="email"></span></label></div>
    <button class="btn primary block" type="submit">${isEdit ? 'Guardar cambios' : 'Guardar cliente'}</button></form>`, {
    label: isEdit ? `Editar ${existing.name}` : 'Nuevo cliente',
    onMount: (r) => {
      const f = $('#cf', r);
      f.onsubmit = async (ev) => {
        ev.preventDefault();
        $$('[data-e]', f).forEach((x) => { x.textContent = ''; });
        try {
          const payload = { name: f.name.value, phone: f.phone.value, email: f.email.value };
          if (isEdit) await api.updateClient(existing.id, payload); else await api.createClient(payload);
          toast(isEdit ? 'Cliente actualizado' : 'Cliente guardado'); closeModal(); onDone();
        } catch (e) { if (e.details) Object.entries(e.details).forEach(([k, v]) => { const el = $(`[data-e=${k}]`, f); if (el) el.textContent = v; }); else toast(e.message, 'err'); }
      };
    },
  });
}

/* ------------------------------------------------------------------ */
/* Comisiones                                                         */
/* ------------------------------------------------------------------ */
let commMonth = null;
let commView = 'mensual'; // 'mensual' | 'anual'
let commYear = null;
const yearSelect = (id, years, current) => `<label class="sel-wrap"><span class="sr-only">Año</span>
  <select id="${id}" class="select">${years.map((y) => `<option value="${y}" ${y === current ? 'selected' : ''}>${y}</option>`).join('')}</select></label>`;

export async function comisiones(root) {
  commMonth = commMonth || shared.meta.today.slice(0, 7);
  const c = commView === 'anual'
    ? await api.annualCommissions(commYear || undefined)
    : await api.commissions(commMonth);
  if (commView === 'anual') commYear = c.year;
  const S = c.summary;
  const toggle = `<div class="seg" role="group" aria-label="Periodo">
    <button type="button" class="seg-btn ${commView === 'mensual' ? 'on' : ''}" data-view="mensual">Mensual</button>
    <button type="button" class="seg-btn ${commView === 'anual' ? 'on' : ''}" data-view="anual">Anual</button>
  </div>`;
  const picker = commView === 'anual' ? yearSelect('cm-year', c.years, c.year) : monthSelect('cm-month', c.month);
  root.innerHTML = `${pageHead('Mis comisiones', 'Consulta tus ingresos y el detalle de tus comisiones.', `${toggle}${picker}<button class="btn ghost" id="csv" ${c.rows.length ? '' : 'disabled'}>${icon.download} Exportar CSV</button><button class="btn ghost" id="xlsx" ${c.rows.length ? '' : 'disabled'}>${icon.download} Exportar Excel</button>`)}
    <div class="kpis three">
      <div class="kpi ic"><span class="qi c-green">${icon.coin}</span><div><span>Comisión generada</span><strong data-count="${S.generated}" data-f="money">$0</strong></div></div>
      <div class="kpi ic"><span class="qi c-purple">${icon.check}</span><div><span>Ventas cerradas</span><strong data-count="${S.closed}" data-f="int">0</strong></div></div>
      <div class="kpi ic"><span class="qi c-orange">${icon.ops}</span><div><span>Comisión en proceso</span><strong data-count="${S.pending}" data-f="money">$0</strong></div></div>
    </div>
    <div class="grid-2">
      <section class="card"><h2>${commView === 'anual' ? `Comisión mes a mes · ${esc(c.year)}` : 'Evolución de tu comisión'}</h2>${barChart(c.series, c.month)}</section>
      <section class="card explain"><h2>${icon.bulb} ¿Cómo se calcula?</h2>
        <p>Tu comisión es el <strong>${Math.round(c.rate * 100)}% de la utilidad</strong> de cada venta (monto de venta − costo del proveedor).</p>
        <p>Pasa de <span class="badge st-en_proceso">En proceso</span> a <span class="badge st-confirmada">Pagada</span> cuando la venta queda confirmada.</p>
        <div class="paid-total"><span>Ya cobrado (histórico)</span><strong>${money(c.allTime.paid)}</strong></div></section>
    </div>
    <section class="card"><h2>${commView === 'anual' ? `Detalle del año ${esc(c.year)}` : 'Detalle del mes'}</h2>
      ${c.rows.length ? `<div class="table-wrap"><table class="table cardify"><thead><tr><th>Fecha</th><th>Cliente</th><th>Destino</th><th class="num">Monto de venta</th><th class="num">Utilidad</th><th class="num">Comisión</th><th>Estado</th></tr></thead><tbody>
      ${c.rows.map((r) => `<tr data-sale="${esc(r.id)}" tabindex="0"><td data-label="Fecha">${esc(fmtDate(r.saleDate))}</td><td data-label="Cliente">${esc(r.client.name)}</td><td data-label="Destino">${esc(r.destination)}</td>
        <td class="num" data-label="Monto de venta">${money(r.amount)}</td><td class="num" data-label="Utilidad">${money(r.profit)}</td><td class="num" data-label="Comisión"><strong>${money(r.commission)}</strong></td><td data-label="Estado">${commBadge(r.commissionStatus)}</td></tr>`).join('')}</tbody></table></div>`
        : empty(commView === 'anual' ? 'Sin ventas este año' : 'Sin ventas este mes', 'Cuando registres ventas, tus comisiones aparecerán aquí.', '<a class="btn primary" href="#/venta">Registrar venta</a>')}</section>`;
  $$('[data-count]', root).forEach((el) => countUp(el, +el.dataset.count, el.dataset.f === 'money' ? money : (v) => String(Math.round(v))));
  $$('[data-view]', root).forEach((b) => { b.onclick = () => { commView = b.dataset.view; comisiones(root); }; });
  $('#cm-month', root)?.addEventListener('change', (e) => { commMonth = e.target.value; comisiones(root); });
  $('#cm-year', root)?.addEventListener('change', (e) => { commYear = e.target.value; comisiones(root); });
  const csv = $('#csv', root);
  if (csv) csv.onclick = () => downloadCSV(`comisiones-${commView === 'anual' ? c.year : c.month}.csv`, [['Fecha', 'Cliente', 'Destino', 'Monto de venta', 'Utilidad', 'Comisión', 'Estado'],
    ...c.rows.map((r) => [r.saleDate, r.client.name, r.destination, r.amount, r.profit, r.commission, r.commissionStatus === 'pagada' ? 'Pagada' : 'En proceso'])]);
  const xlsxBtn = $('#xlsx', root);
  if (xlsxBtn) xlsxBtn.onclick = async () => {
    xlsxBtn.disabled = true; xlsxBtn.textContent = 'Generando…';
    try { await exportCommissionsExcel(c, commView); }
    catch (e) { toast('No se pudo generar el Excel. Intenta de nuevo.', 'err'); }
    finally { xlsxBtn.disabled = false; xlsxBtn.innerHTML = `${icon.download} Exportar Excel`; }
  };
  shared.refresh = () => comisiones(root);
}

/* ------------------------------------------------------------------ */
/* Capacitación                                                       */
/* ------------------------------------------------------------------ */
const openCourses = new Set(['K-2']);
export async function capacitacion(root) {
  const t = await api.training();
  const o = t.overall;
  root.innerHTML = `${pageHead('Capacitación y constancia', 'Aprende a vender turismo con criterio, a tu ritmo.')}
    <section class="card cert ${o.certified ? 'ok' : ''}"><div class="cert-ring">${ring(o.percent, 110)}</div>
      <div class="cert-text"><h2>${icon.award} Constancia en Venta de Turismo</h2>
        <p>${o.certified ? '¡Felicidades! Completaste todo el programa y estás lista para vender con respaldo.' : `Has completado <strong>${o.completed} de ${o.total}</strong> lecciones. Completa el 100% para obtener tu constancia.`}</p>
        ${t.next ? `<p class="hint">Siguiente: <strong>${esc(t.next.lesson.title)}</strong> · ${esc(t.next.course)}</p>` : ''}</div></section>
    <div class="courses">${t.courses.map((c) => `<details class="card course" data-course="${esc(c.id)}" ${openCourses.has(c.id) ? 'open' : ''}>
      <summary><div class="cs-main"><h3>${esc(c.title)}</h3><p>${esc(c.description)}</p>
        <div class="bar" role="progressbar" aria-valuenow="${c.percent}" aria-valuemin="0" aria-valuemax="100"><i style="width:${c.percent}%"></i></div></div>
        <div class="cs-side"><strong>${c.percent}%</strong><small>${c.completed}/${c.total} · ${c.minutes} min</small></div><span class="chev">${icon.chevron}</span></summary>
      <ul class="lessons">${c.lessons.map((l) => `<li><label class="check"><input type="checkbox" data-lesson="${esc(l.id)}" ${l.done ? 'checked' : ''}><span class="box">${icon.check}</span><span class="lt">${esc(l.title)}</span><small>${l.minutes} min</small></label></li>`).join('')}</ul></details>`).join('')}</div>`;
  $$('details.course', root).forEach((d) => d.addEventListener('toggle', () => { d.open ? openCourses.add(d.dataset.course) : openCourses.delete(d.dataset.course); }));
  $$('[data-lesson]', root).forEach((cb) => {
    cb.onchange = async () => {
      try {
        const after = await api.toggleLesson(cb.dataset.lesson);
        if (after.overall.certified && !o.certified) { confetti(); toast('¡Obtuviste tu constancia!'); }
        capacitacion(root);
      } catch (e) { toast(e.message, 'err'); cb.checked = !cb.checked; }
    };
  });
}

/* ------------------------------------------------------------------ */
/* Soporte                                                            */
/* ------------------------------------------------------------------ */
const FAQ = [
  ['¿Cuándo se paga mi comisión?', 'Tu comisión pasa a “Pagada” cuando la venta queda confirmada. Puedes ver el detalle en la sección Comisiones.'],
  ['¿Qué hace el back office por mí?', 'Ejecuta la operación: reservas, documentación, seguimiento, incidencias, administración y contabilidad. Tú te enfocas en vender.'],
  ['¿Cómo se calcula mi comisión?', `Es el ${Math.round(COMMISSION_RATE * 100)}% de la utilidad de cada venta: monto de venta menos el costo del proveedor.`],
  ['¿Puedo corregir una venta ya registrada?', 'Sí. Escribe a soporte indicando el código de la venta (por ejemplo V-1001) y el cambio que necesitas.'],
  ['¿Qué información necesito del cliente?', 'Nombre completo, teléfono y, si es posible, correo. Para el viaje: destino, fecha y número de pasajeros.'],
];
export async function soporte(root) {
  const { items } = await api.tickets();
  root.innerHTML = `${pageHead('Soporte', 'Personas expertas detrás de la tecnología.', `<button class="btn primary" id="new-ticket">${icon.plus} Nueva solicitud</button>`)}
    <div class="grid-2">
      <section class="card"><h2>Preguntas frecuentes</h2><div class="faq">${FAQ.map(([q, a]) => `<details><summary>${esc(q)}<span class="chev">${icon.chevron}</span></summary><p>${esc(a)}</p></details>`).join('')}</div></section>
      <section class="card"><h2>Mis solicitudes</h2>${items.length ? `<ul class="tickets">${items.map((t) => `<li><details><summary><span class="t-main"><strong>${esc(t.subject)}</strong><small>${esc(t.id)} · ${esc(t.category)} · ${esc(fmtDate(t.createdAt))}</small></span>
        <span class="badge ${t.status === 'resuelto' ? 'st-finalizada' : t.status === 'abierto' ? 'st-en_proceso' : 'st-en_viaje'}">${esc(t.status[0].toUpperCase() + t.status.slice(1))}</span></summary>
        <div class="t-body"><p class="you">${esc(t.message)}</p>${t.replies.map((r) => `<p class="reply"><strong>${esc(r.from)}</strong>${esc(r.text)}</p>`).join('')}</div></details></li>`).join('')}</ul>`
        : empty('Sin solicitudes', 'Si necesitas ayuda, crea una nueva solicitud.')}</section>
    </div>`;
  $('#new-ticket', root).onclick = () => openTicketModal();
  shared.refresh = () => soporte(root);
}

export function openTicketModal(category = 'Otro') {
  openModal(`<h2>Contactar soporte</h2><p class="sub">Cuéntanos qué necesitas y el back office te responderá.</p>
    <form id="tf" class="form" novalidate>
      <label class="field"><span>Asunto</span><input name="subject" autocomplete="off" placeholder="Ej. Duda con el voucher V-1001"><span class="err" data-e="subject"></span></label>
      <div class="row2"><label class="field"><span>Categoría</span><select name="category">${TICKET_CATEGORIES.map((c) => `<option ${c === category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
      <label class="field"><span>Prioridad</span><select name="priority"><option value="baja">Baja</option><option value="media" selected>Media</option><option value="alta">Alta</option></select></label></div>
      <label class="field"><span>Mensaje</span><textarea name="message" rows="4" maxlength="800" placeholder="Describe lo que necesitas…"></textarea><span class="err" data-e="message"></span></label>
      <button class="btn primary block" type="submit">Enviar solicitud</button></form>`, {
    label: 'Contactar soporte',
    onMount: (r) => {
      const f = $('#tf', r);
      f.onsubmit = async (ev) => {
        ev.preventDefault();
        $$('[data-e]', f).forEach((x) => { x.textContent = ''; });
        try {
          const t = await api.createTicket({ subject: f.subject.value, category: f.category.value, priority: f.priority.value, message: f.message.value });
          toast(`Solicitud ${t.id} enviada`); closeModal();
          if (location.hash.startsWith('#/soporte')) shared.refresh();
        } catch (e) { if (e.details) Object.entries(e.details).forEach(([k, v]) => { const el = $(`[data-e=${k}]`, f); if (el) el.textContent = v; }); else toast(e.message, 'err'); }
      };
    },
  });
}
