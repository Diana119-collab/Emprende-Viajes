import { api } from './api.js';
import { $, $$, esc, icon, toast } from './ui.js';
import * as V from './views.js';

const ROUTES = {
  inicio: { title: 'Inicio', icon: 'home', view: V.inicio },
  venta: { title: 'Registrar venta', icon: 'sale', view: V.venta },
  operaciones: { title: 'Operaciones', icon: 'ops', view: V.operaciones },
  clientes: { title: 'Clientes', icon: 'users', view: V.clientes },
  comisiones: { title: 'Comisiones', icon: 'coin', view: V.comisiones },
  capacitacion: { title: 'Capacitación', icon: 'book', view: V.capacitacion },
  soporte: { title: 'Soporte', icon: 'help', view: V.soporte },
};

const main = () => $('#view');
let renderToken = 0;

function currentRoute() {
  const key = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] || 'inicio';
  return ROUTES[key] ? key : 'inicio';
}

async function render() {
  const key = currentRoute();
  const r = ROUTES[key];
  const token = ++renderToken;
  $$('.nav a').forEach((a) => {
    const on = a.dataset.route === key;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.title = `${r.title} · Emprende Viajes`;
  closeNav();
  const root = main();
  V.shared.refresh = () => {};
  root.innerHTML = '<div class="loading" aria-busy="true"><span class="spinner"></span> Cargando…</div>';
  try {
    await r.view(root);
    if (token !== renderToken) return;
    root.classList.remove('enter'); void root.offsetWidth; root.classList.add('enter');
    scrollTo({ top: 0 });
    root.focus({ preventScroll: true });
  } catch (e) {
    if (token !== renderToken) return;
    console.error(e);
    root.innerHTML = `<div class="card empty"><h3>No pudimos cargar esta sección</h3><p>${esc(e.message || 'Error inesperado')}</p><button class="btn primary" id="retry">Reintentar</button></div>`;
    $('#retry').onclick = render;
  }
}

/* ---------- navegación móvil ---------- */
const openNav = () => { $('#sidebar').classList.add('open'); $('#scrim').hidden = false; $('#menu-btn').setAttribute('aria-expanded', 'true'); };
function closeNav() { $('#sidebar').classList.remove('open'); $('#scrim').hidden = true; $('#menu-btn')?.setAttribute('aria-expanded', 'false'); }

/* ---------- tema ---------- */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  $('#theme-btn').innerHTML = t === 'dark' ? `${icon.sun}<span>Modo claro</span>` : `${icon.moon}<span>Modo oscuro</span>`;
  try { localStorage.setItem('ev-theme', t); } catch { /* sin almacenamiento */ }
}

async function boot() {
  const mode = await api.init();
  V.shared.meta = await api.meta();
  const { agent } = V.shared.meta;

  $('#nav').innerHTML = Object.entries(ROUTES).map(([k, r]) => `<li><a href="#/${k}" data-route="${k}">${icon[r.icon]}<span>${r.title}</span></a></li>`).join('');
  $('#agent').innerHTML = `<span class="avatar" style="--s:40px;background:#f28c28" aria-hidden="true">${esc(agent.name[0])}</span><div><strong>${esc(agent.name)}</strong><small>${esc(agent.role)}</small></div>`;
  $('#mode-badge').innerHTML = mode === 'remote' ? '<i class="dot-on"></i> Conectado al servidor' : '<i class="dot-demo"></i> Modo demo (datos en tu navegador)';

  let theme = 'light';
  try { theme = localStorage.getItem('ev-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch { /* ignore */ }
  applyTheme(theme);
  $('#theme-btn').onclick = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  $('#menu-btn').onclick = () => ($('#sidebar').classList.contains('open') ? closeNav() : openNav());
  $('#scrim').onclick = closeNav;
  $('#reset-btn').onclick = async () => {
    if (!confirm('¿Restablecer los datos de ejemplo? Se perderán las ventas y clientes que hayas creado.')) return;
    await api.reset();
    toast('Datos de ejemplo restablecidos');
    render();
  };

  // Delegación global: abrir detalle de venta desde cualquier lista.
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-sale]');
    if (t) { e.preventDefault(); V.openSaleDrawer(t.dataset.sale); return; }
    const o = e.target.closest('[data-sale-open]');
    if (o) { /* el enlace navega a #/operaciones; luego abrimos el detalle */ setTimeout(() => V.openSaleDrawer(o.dataset.saleOpen), 350); }
  });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr[data-sale]')) { e.preventDefault(); V.openSaleDrawer(e.target.dataset.sale); }
  });

  window.addEventListener('hashchange', render);
  $('#boot').remove();
  render();
}

boot().catch((e) => {
  console.error(e);
  $('#boot').innerHTML = `<p>No pudimos iniciar la aplicación.</p><pre>${esc(e.message)}</pre>`;
});
