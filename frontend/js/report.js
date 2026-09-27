/**
 * Exportación a Excel (.xlsx) de la página de Comisiones, con formato y gráficos
 * de barra incrustados (no solo columnas, como en el CSV).
 *
 * Usa ExcelJS desde un CDN (frontend/index.html) porque generar un .xlsx con estilos
 * e imágenes desde el navegador, sin backend, requiere una librería: no hay forma de
 * escribir el formato binario de Excel a mano de manera razonable. Los gráficos se
 * incrustan como imagen (PNG), reutilizando el mismo SVG que ya se ve en pantalla,
 * porque las librerías de xlsx gratuitas para navegador no saben crear gráficos nativos
 * de Excel (eso sí lo hace, por ejemplo, un reporte generado con Python/openpyxl).
 */
import { api } from './api.js';
import { barChart, toast } from './ui.js';

const NAVY = 'FF0B2C50';
const MONEY_FMT = '"$"#,##0.00';

function headerStyle(cell) {
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
}

/**
 * Estilos del gráfico, embebidos a mano: el SVG de `barChart` se apoya en clases CSS
 * (`.chart .bar rect { fill: var(--teal) }`, etc.) que solo existen en `styles.css`. Al
 * rasterizarlo aislado (como imagen `data:` independiente, fuera del documento) esas
 * reglas no aplican y el navegador cae a sus valores por defecto — texto y barras en
 * negro sólido. Por eso se incrusta aquí una copia de esas reglas, con colores fijos
 * (paleta clara, para que el reporte se vea bien sin depender del tema del navegador).
 */
const CHART_STYLE = `<style>
  .axis { stroke: #cfd9e6; stroke-width: 1.5; }
  .bar rect { fill: #12a5a5; }
  .bar.sel rect { fill: #f28c28; }
  .bar-v { font: 700 11px Arial, Helvetica, sans-serif; fill: #33455e; }
  .bar-l { font: 12px Arial, Helvetica, sans-serif; fill: #5a6c83; text-transform: capitalize; }
</style>`;

/** Rasteriza el SVG del gráfico de barras (el mismo `barChart` de la pantalla) a un PNG en memoria. */
function svgToPngDataUrl(svgHtml, width, height, scale = 2) {
  return new Promise((resolve, reject) => {
    const wrap = document.createElement('div');
    wrap.innerHTML = svgHtml;
    const svg = wrap.querySelector('svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.insertAdjacentHTML('afterbegin', CHART_STYLE);
    const xml = new XMLSerializer().serializeToString(svg);
    const svg64 = btoa(unescape(encodeURIComponent(xml)));
    const img = new Image();
    img.onerror = reject;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = `data:image/svg+xml;base64,${svg64}`;
  });
}

function addSeriesSheet(wb, name, series, periodHeader = 'Periodo') {
  const ws = wb.addWorksheet(name);
  ws.columns = [
    { header: periodHeader, key: 'p', width: 14 },
    { header: 'Ventas', key: 'n', width: 10 },
    { header: 'Monto vendido', key: 'income', width: 16 },
    { header: 'Comisión', key: 'commission', width: 14 },
  ];
  ws.getRow(1).eachCell(headerStyle);
  series.forEach((s) => ws.addRow({ p: s.label, n: s.count, income: s.income, commission: s.commission }));
  ws.getColumn('income').numFmt = MONEY_FMT;
  ws.getColumn('commission').numFmt = MONEY_FMT;
  return ws;
}

/**
 * Genera y descarga el reporte de comisiones en Excel.
 * @param {object} c - resultado de api.commissions() o api.annualCommissions().
 * @param {'mensual'|'anual'} view
 */
export async function exportCommissionsExcel(c, view) {
  if (!window.ExcelJS) {
    toast('No se pudo cargar el generador de Excel (revisa tu conexión) — usa "Exportar CSV" mientras tanto.', 'err');
    return;
  }
  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'Emprende Viajes';
  wb.created = new Date();

  const wsD = wb.addWorksheet('Detalle');
  wsD.columns = [
    { header: 'Fecha', key: 'date', width: 12 },
    { header: 'Cliente', key: 'client', width: 20 },
    { header: 'Destino', key: 'dest', width: 18 },
    { header: 'Monto de venta', key: 'amount', width: 16 },
    { header: 'Utilidad', key: 'profit', width: 14 },
    { header: 'Comisión', key: 'commission', width: 14 },
    { header: 'Estado', key: 'status', width: 14 },
  ];
  wsD.getRow(1).eachCell(headerStyle);
  c.rows.forEach((r) => wsD.addRow({
    date: r.saleDate, client: r.client.name, dest: r.destination, amount: r.amount,
    profit: r.profit, commission: r.commission, status: r.commissionStatus === 'pagada' ? 'Pagada' : 'En proceso',
  }));
  ['amount', 'profit', 'commission'].forEach((k) => { wsD.getColumn(k).numFmt = MONEY_FMT; });
  wsD.autoFilter = { from: 'A1', to: 'G1' };
  wsD.views = [{ state: 'frozen', ySplit: 1 }];

  const wsR = addSeriesSheet(wb, view === 'anual' ? 'Resumen mensual' : 'Evolución', c.series);
  const monthlyPng = await svgToPngDataUrl(barChart(c.series, null), 520, 210);
  const monthlyImgId = wb.addImage({ base64: monthlyPng, extension: 'png' });
  wsR.addImage(monthlyImgId, { tl: { col: 5, row: 1 }, ext: { width: 520, height: 210 } });

  if (view === 'anual' && c.years?.length) {
    const perYear = await Promise.all(c.years.map((y) => api.annualCommissions(y)));
    const yearSeries = perYear.map((yc) => ({ label: yc.year, count: yc.summary.closed, income: yc.summary.salesAmount, commission: yc.summary.generated }));
    const wsY = addSeriesSheet(wb, 'Resumen anual', yearSeries, 'Año');
    const yearlyPng = await svgToPngDataUrl(barChart(yearSeries, null), 520, 210);
    const yearlyImgId = wb.addImage({ base64: yearlyPng, extension: 'png' });
    wsY.addImage(yearlyImgId, { tl: { col: 5, row: 1 }, ext: { width: 520, height: 210 } });
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `comisiones-${view === 'anual' ? c.year : c.month}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
