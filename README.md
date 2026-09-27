# Emprende Viajes

Plataforma para agentes de viaje emprendedores — **Tú vendes. Nosotros operamos.**
MVP basado en el pitch de Opera Ligero (Startup Weekend): el agente registra ventas, sigue el estado de sus operaciones, administra clientes, consulta sus comisiones y se capacita; el back office central se encarga del resto.

## Qué incluye

| Pantalla | Qué hace |
|---|---|
| **Inicio** | Saludo, accesos rápidos, KPIs del mes (ventas, ingresos, comisión) con comparación vs. mes anterior, gráfico de 6 meses, próximo viaje, avance de capacitación |
| **Registrar venta** | Asistente de 4 pasos (Cliente → Viaje → Detalles → Confirmación) con validación, autocompletado de clientes existentes y cálculo de comisión en vivo |
| **Operaciones** | Seguimiento por estado (En proceso / Confirmada / En viaje / Finalizada), búsqueda y detalle con línea de tiempo |
| **Clientes** | Cartera con historial de compras; alta de clientes; "nueva venta" desde la ficha |
| **Comisiones** | Comisión generada / en proceso / pagada por mes, gráfico y exportación a CSV |
| **Capacitación** | 5 cursos con lecciones marcables y certificación al llegar al 100 % |
| **Soporte** | Preguntas frecuentes y solicitudes al back office |
| Extras | Cotizador rápido, modo oscuro, diseño responsive, accesible por teclado |

### Acceso

MVP: pantalla de acceso con **contraseña temporal `admin`** (validada en el navegador, sin backend de autenticación todavía). Es un candado provisional para no dejar la demo abierta a cualquiera; el siguiente paso natural es un login real contra el back office, con usuarios por agente. La sesión se guarda en `sessionStorage` (se cierra al cerrar la pestaña) y hay un botón "Cerrar sesión" en el menú lateral.

### Módulos de viaje internacional

| Módulo | Qué hace |
|---|---|
| **Ficha "Viaje internacional"** | Al detectar que el destino no es Perú, arma un checklist (pasaporte, vuelo, hotel, seguro, traslado, documento de entrada) dentro del detalle de la venta; el agente lo va marcando |
| **Control de viajes** (International Travel Control) | Agrupa todas las ventas internacionales activas en Críticas / Pendientes / Al día, explicando qué falta en cada una y por qué, para no revisarlas una por una. Un resumen con lo crítico aparece también en **Inicio**, apenas entra el agente, y cada venta muestra el motivo ("Crítico: sale en 2 días y falta el seguro de viaje") al abrir su detalle |
| **Travel Requirements** | Semáforo migratorio por venta (pasaporte, visa, sanidad, documentos, seguro, restricciones); el agente lo verifica contra la fuente oficial y anota fuente + fecha — la app organiza, nunca inventa el requisito |
| **Itinerario inteligente** | El agente arma vuelo, hotel, traslados y actividades por hora; se ordena solo y se muestra en una versión lista para el cliente |
| **Cliente preparado para viajar** | Vista de solo lectura pensada para compartir con el cliente: días para el viaje, checklist, consejos antes/al llegar/durante y contacto de la agencia |
| **Centro de incidencias internacionales** | Registra imprevistos (vuelos con retraso, cambios de hotel, etc.) contra una venta, detecta si el nuevo horario choca con el traslado ya reservado y da seguimiento a las acciones (contactar proveedor, modificar traslado, avisar al cliente). Los datos de ejemplo incluyen dos vuelos retrasados con conflicto de horario, un imprevisto de hotel y un caso ya resuelto |
| **Recordatorio al cliente** | Desde el detalle de una venta, Control de viajes o Inicio, el agente puede enviar un recordatorio (demo: WhatsApp/correo simulado) al cliente sobre lo que falta antes del viaje; queda registrado con fecha en la venta |

**Regla de negocio (del pitch):** comisión = **30 % de la utilidad** de cada venta (monto − costo del proveedor). Está en `frontend/js/core.js` (`COMMISSION_RATE`).

## Arquitectura

```
frontend/            SPA en JavaScript puro (ES modules), sin build ni dependencias
  js/core.js         Reglas de negocio + datos de ejemplo (compartido con el backend)
  js/api.js          Usa el backend si responde; si no, "modo demo" en localStorage
backend/             API REST en Node.js (solo módulos nativos: cero dependencias)
  app.js  server.js  store.js  test/api.test.js
```

- **Sin dependencias**: no hace falta `npm install`. Requiere Node 18+.
- El backend sirve también el frontend, así que un solo comando levanta todo.
- Los datos se guardan en `data/db.json` (suficiente para un piloto).

## Ejecutar en local

```bash
npm start          # http://localhost:3000  (API + frontend)
npm test           # pruebas de la API y del motor de negocio
```

Variables opcionales: `PORT`, `DB_FILE`.

## Desplegar en GitHub Pages

GitHub Pages solo sirve archivos estáticos, así que allí la app corre en **modo demo**: la interfaz completa funciona y los datos viven en el navegador de cada visitante (botón "Restablecer datos demo" en el menú).

1. Sube el repositorio a GitHub (rama `main`).
2. En **Settings → Pages → Build and deployment**, elige **GitHub Actions**.
3. Cada push a `main` ejecuta las pruebas y publica la carpeta `frontend/` (`.github/workflows/pages.yml`).

### Conectar un backend real (opcional)

Despliega `backend/` en cualquier hosting de Node (Render, Railway, Fly.io…) con `npm start` y edita `frontend/config.js`:

```js
window.EV_CONFIG = { apiBase: 'https://tu-backend.example.com' };
```

El backend permite CORS desde cualquier origen.

## API

Base: `/api`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health`, `/meta` | Estado y datos de configuración |
| GET | `/dashboard?month=YYYY-MM` | KPIs, próximo viaje, serie de 6 meses |
| GET / POST | `/sales` | Listar (`status`, `q`) / crear venta |
| GET | `/sales/:id` | Detalle |
| PATCH | `/sales/:id/status` | Cambiar estado `{ "status": "confirmada" }` |
| GET / POST | `/clients` · GET `/clients/:id` | Clientes |
| GET | `/commissions?month=YYYY-MM` | Resumen y detalle de comisiones |
| GET | `/training` · POST `/training/lessons/:id/toggle` | Capacitación |
| GET / POST | `/tickets` | Soporte |
| PATCH | `/sales/:id/docs` | Ficha de viaje: marcar ítems del checklist `{ passport, flight, hotel, insurance, transfer, entryDoc }` |
| GET | `/travel-control` | Control de viajes (International Travel Control): ventas internacionales agrupadas en críticas / pendientes / al día, con el motivo de cada una |
| GET | `/sales/:id/requirements` · PATCH `/sales/:id/requirements/:key` | Travel Requirements: semáforo migratorio por venta `{ status, source }` |
| POST | `/sales/:id/itinerary` · DELETE `/sales/:id/itinerary/:itemId` | Itinerario inteligente: agregar/quitar un componente `{ type, time, title, notes }` |
| POST | `/sales/:id/reminders` | Enviar (simular) un recordatorio al cliente `{ channel, note }` |
| GET / POST | `/incidents` | Centro de incidencias: listar / registrar `{ saleId, problem, originalTime, newTime, transferTime }` |
| PATCH | `/incidents/:id/actions/:key` · PATCH `/incidents/:id/resolve` | Marcar una acción `{ done }` / resolver la incidencia |
| POST | `/reset` | Restablece datos de ejemplo |

Los errores de validación devuelven `400` con `{ error, details: { campo: mensaje } }`.

## Límites actuales del MVP (a decidir en el piloto)

- **Sin autenticación real ni multiusuario**: la pantalla de acceso con contraseña `admin` es solo un candado de demo (se valida en el navegador); hay un solo agente ("Magda"). El siguiente paso natural es login real y un panel de back office.
- **Los recordatorios al cliente son simulados**: quedan registrados en la venta, pero no se envía un WhatsApp/correo real todavía; falta conectar un proveedor de mensajería.
- **Los estados de las ventas los cambia el back office** en la operación real; el botón "Simular avance" del detalle es solo para demostración.
- **La comisión pasa a "Pagada" al confirmar la venta** (constante `COMMISSION_PAID_FROM`); ajústala a la política real de pagos.
- Los datos de ejemplo (clientes, montos) son ficticios.
- Persistencia en archivo JSON: reemplazar `backend/store.js` por una base de datos al escalar.
