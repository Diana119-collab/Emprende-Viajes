/* Utilidades de interfaz: formato, iconos, toasts, modales, animaciones. */
import { STATUS_LABEL } from './core.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const money = (n) => {
  const v = Number(n) || 0;
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
};
const MONTHS = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'];
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const fmtDate = (iso) => (iso ? `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}` : '—');
export const monthName = (key) => `${MONTHS_LONG[+key.slice(5, 7) - 1]} ${key.slice(0, 4)}`;
export const monthNameCap = (key) => { const s = monthName(key); return s[0].toUpperCase() + s.slice(1); };

export const initials = (name) => String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const AV = ['#12a5a5', '#f28c28', '#1c62c9', '#7a4fd6', '#d6457a', '#2f9e5f', '#c2571a'];
export const avatar = (name, size = 40) => {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `<span class="avatar" style="--s:${size}px;background:${AV[h % AV.length]}" aria-hidden="true">${esc(initials(name))}</span>`;
};

export const statusBadge = (s) => `<span class="badge st-${s}">${esc(STATUS_LABEL[s] || s)}</span>`;
export const commBadge = (s) => `<span class="badge ${s === 'pagada' ? 'st-confirmada' : 'st-en_proceso'}">${s === 'pagada' ? 'Pagada' : 'En proceso'}</span>`;

/* ---------- módulos de viaje internacional ---------- */
const TRAVEL_LEVEL = { critical: ['lvl-bad', 'Crítico'], pending: ['lvl-warn', 'Pendiente'], ok: ['lvl-ok', 'Al día'] };
export const travelLevelBadge = (level) => { const [cls, label] = TRAVEL_LEVEL[level] || ['lvl-na', '—']; return `<span class="badge ${cls}">${label}</span>`; };
export const dotStatus = (ok, label) => `<span class="dot-row"><span class="dot-ico ${ok ? 'on' : 'off'}" aria-hidden="true"></span>${label ? `<span>${esc(label)}</span>` : ''}</span>`;
const REQ_STATUS_LABEL = { verificado: 'Verificado', pendiente: 'Falta verificar', no_aplica: 'No aplica' };
export const reqBadge = (status) => {
  const cls = status === 'verificado' ? 'lvl-ok' : status === 'no_aplica' ? 'lvl-na' : 'lvl-warn';
  return `<span class="badge ${cls}">${esc(REQ_STATUS_LABEL[status] || status)}</span>`;
};

const I = (d, extra = '') => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
export const icon = {
  home: I('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>'),
  sale: I('<path d="M4 4h16v13H8l-4 4z"/><path d="M12 8v6M9 11h6"/>'),
  ops: I('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
  users: I('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.5 3.2-5.5 6.5-5.5s6 2 6.5 5.5"/><path d="M16 5a3.3 3.3 0 010 6.3M18 14.8c2 .7 3.2 2.4 3.5 5.2"/>'),
  coin: I('<circle cx="12" cy="12" r="9"/><path d="M14.8 9.2c-.5-1-1.5-1.5-2.8-1.5-1.6 0-2.8.8-2.8 2s1 1.7 2.8 2.1 2.8.9 2.8 2.1-1.2 2-2.8 2c-1.4 0-2.4-.6-2.9-1.6M12 6v1.7M12 16.3V18"/>'),
  book: I('<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 19V5M8 7h7"/>'),
  help: I('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.3a2.6 2.6 0 015 .9c0 1.7-2.5 2.2-2.5 3.8M12 17.2v.1"/>'),
  quote: I('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>'),
  plane: I('<path d="M2.5 13.5l19-8.5-6 15-3.2-6.3z"/><path d="M12.3 13.7L21.5 5"/>'),
  check: I('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  x: I('<path d="M6 6l12 12M18 6L6 18"/>'),
  menu: I('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  arrow: I('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  back: I('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
  search: I('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
  plus: I('<path d="M12 5v14M5 12h14"/>'),
  phone: I('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A15 15 0 013 6a2 2 0 012-2z"/>'),
  mail: I('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
  calendar: I('<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  bulb: I('<path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z"/>'),
  download: I('<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>'),
  moon: I('<path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/>'),
  sun: I('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  chevron: I('<path d="M6 9l6 6 6-6"/>'),
  award: I('<circle cx="12" cy="9" r="5.5"/><path d="M8.5 13.5L7 21l5-2.7 5 2.7-1.5-7.5"/>'),
  lock: I('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 118 0v3"/>'),
  ticket: I('<path d="M3 8a2 2 0 002-2h14a2 2 0 002 2v2a2 2 0 000 4v2a2 2 0 00-2 2H5a2 2 0 00-2-2v-2a2 2 0 000-4z"/><path d="M14 6v12" stroke-dasharray="2 2.5"/>'),
  warning: I('<path d="M12 3.5l9.5 16.5H2.5z"/><path d="M12 10v4.2M12 17.3v.1"/>'),
  globe: I('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18"/>'),
  wrench: I('<path d="M14.7 6.3a4 4 0 00-5.6 5l-6 6 2 2 6-6a4 4 0 005-5.6l-2.4 2.4-2-2 2.4-2.4z"/>'),
  route: I('<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8 7l4 3-4 3 4 3"/><path d="M12 10h4a3 3 0 000-6"/>'),
  bell: I('<path d="M6 17v-5a6 6 0 1112 0v5l1.6 2.4H4.4z"/><path d="M9.5 21.5a2.5 2.5 0 005 0"/>'),
  logout: I('<path d="M9 6V4a1 1 0 011-1h9a1 1 0 011 1v16a1 1 0 01-1 1h-9a1 1 0 01-1-1v-2"/><path d="M3 12h12M11 8l4 4-4 4"/>'),
  chat: I('<path d="M4 5h16v11H9l-4 4z"/><path d="M8 9h8M8 12.5h5"/>'),
  edit: I('<path d="M4 16.5V20h3.5L18 9.5l-3.5-3.5z"/><path d="M13 7l3.5 3.5"/>'),
  tag: I('<path d="M11 3H4v7l10 10 7-7z"/><circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" stroke="none"/>'),
  sparkle: I('<path d="M12 3l1.7 4.8L18.5 9.5l-4.8 1.7L12 16l-1.7-4.8L5.5 9.5l4.8-1.7z"/>'),
};

/* ---------- toasts ---------- */
export function toast(msg, type = 'ok') {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${type === 'err' ? icon.x : icon.check}<span>${esc(msg)}</span>`;
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 300); }, 3800);
}

/* ---------- modal / drawer ---------- */
let lastFocus = null;
export function openModal(html, { drawer = false, onMount, label = 'Ventana', onBack } = {}) {
  closeModal(true);
  lastFocus = document.activeElement;
  const root = $('#modal-root');
  root.innerHTML = `<div class="backdrop" data-close></div>
    <section class="modal ${drawer ? 'drawer' : ''}" role="dialog" aria-modal="true" aria-label="${esc(label)}">
      ${onBack ? `<button class="icon-btn modal-back" data-back aria-label="Volver">${icon.back}</button>` : ''}
      <button class="icon-btn modal-x" data-close aria-label="Cerrar">${icon.x}</button>
      <div class="modal-body">${html}</div></section>`;
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => root.classList.add('open'));
  root.onclick = (e) => {
    if (e.target.closest('[data-back]')) { onBack(); return; }
    if (e.target.closest('[data-close]')) closeModal();
  };
  const first = $('input:not([type=hidden]), select, textarea, button:not(.modal-x)', $('.modal-body', root));
  (first || $('.modal-x', root)).focus({ preventScroll: true });
  if (onMount) onMount($('.modal-body', root));
  return $('.modal-body', root);
}
export function closeModal(silent = false) {
  const root = $('#modal-root');
  if (!root.firstChild) return;
  root.classList.remove('open');
  root.innerHTML = '';
  document.body.classList.remove('modal-open');
  if (!silent && lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'Tab') {
    const m = $('#modal-root .modal');
    if (!m) return;
    const f = $$('a[href], button:not([disabled]), input:not([type=hidden]), select, textarea', m).filter((x) => x.offsetParent);
    if (!f.length) return;
    const [a, b] = [f[0], f[f.length - 1]];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus(); }
    else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); }
  }
});

/* ---------- animaciones ---------- */
export const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function countUp(el, to, fmt = (v) => String(Math.round(v)), ms = 800) {
  if (reduceMotion() || !to) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / ms);
    el.textContent = fmt(to * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function confetti() {
  if (reduceMotion()) return;
  const c = document.createElement('canvas');
  c.className = 'confetti';
  c.width = innerWidth; c.height = innerHeight;
  document.body.appendChild(c);
  const ctx = c.getContext('2d');
  const colors = ['#12a5a5', '#f28c28', '#0b2c50', '#7fd6d6', '#ffd08a'];
  const ps = Array.from({ length: 110 }, () => ({
    x: c.width / 2 + (Math.random() - 0.5) * 200, y: c.height * 0.35,
    vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 12 - 3,
    s: 5 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
    col: colors[(Math.random() * colors.length) | 0],
  }));
  let frames = 0;
  (function tick() {
    ctx.clearRect(0, 0, c.width, c.height);
    ps.forEach((p) => {
      p.vy += 0.32; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.col; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
    });
    if (++frames < 130) requestAnimationFrame(tick); else c.remove();
  })();
}

export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/* ---------- componentes pequeños ---------- */
export function ring(percent, size = 96) {
  const r = 40, c = 2 * Math.PI * r;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="${percent}% completado">
    <circle cx="50" cy="50" r="${r}" class="ring-bg"/>
    <circle cx="50" cy="50" r="${r}" class="ring-fg" stroke-dasharray="${(c * percent) / 100} ${c}" transform="rotate(-90 50 50)"/>
    <text x="50" y="56" text-anchor="middle" class="ring-t">${percent}%</text></svg>`;
}

export function barChart(series, selected, key = 'commission') {
  const W = 520, H = 210, padB = 30, padT = 26, gap = 14;
  const max = Math.max(1, ...series.map((s) => s[key]));
  const bw = (W - gap * (series.length + 1)) / series.length;
  const bars = series.map((s, i) => {
    const h = Math.max(s[key] ? 4 : 0, ((H - padB - padT) * s[key]) / max);
    const x = gap + i * (bw + gap), y = H - padB - h;
    return `<g class="bar ${s.month === selected ? 'sel' : ''}" tabindex="0" role="img" aria-label="${esc(s.label)}: ${esc(money(s[key]))}">
      <rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="7"/>
      <text x="${x + bw / 2}" y="${y - 7}" text-anchor="middle" class="bar-v">${s[key] ? esc(money(Math.round(s[key]))) : ''}</text>
      <text x="${x + bw / 2}" y="${H - 9}" text-anchor="middle" class="bar-l">${esc(s.label)}</text></g>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"><line x1="0" x2="${W}" y1="${H - padB}" y2="${H - padB}" class="axis"/>${bars}</svg>`;
}

export function fieldErr(errors, k) {
  return errors && errors[k] ? `<span class="err" role="alert">${esc(errors[k])}</span>` : '';
}

/* ---------- envío real (abre WhatsApp / el correo con el mensaje listo) ---------- */
/** wa.me necesita el número con código de país; asumimos Perú (51) si no trae uno ya. */
export function waLink(phone, text) {
  const digits = String(phone || '').replace(/\D/g, '');
  const withCC = digits.length > 0 && digits.length <= 9 ? `51${digits}` : digits;
  return `https://wa.me/${withCC}?text=${encodeURIComponent(text)}`;
}
export function mailLink(email, subject, text) {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
}
/** Abre WhatsApp (pestaña nueva) o el cliente de correo del agente con el mensaje ya escrito, listo para enviar. */
export function openOutreach(channel, { phone, email, subject, text }) {
  if (channel === 'email') { if (email) location.href = mailLink(email, subject, text); return !!email; }
  if (!phone) return false;
  window.open(waLink(phone, text), '_blank', 'noopener');
  return true;
}

export function downloadCSV(name, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
