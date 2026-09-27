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
npm test           # 13 pruebas de la API
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
| POST | `/reset` | Restablece datos de ejemplo |

Los errores de validación devuelven `400` con `{ error, details: { campo: mensaje } }`.

## Límites actuales del MVP (a decidir en el piloto)

- **Sin autenticación ni multiusuario**: hay un solo agente ("Magda"). El siguiente paso natural es login y un panel de back office.
- **Los estados de las ventas los cambia el back office** en la operación real; el botón "Simular avance" del detalle es solo para demostración.
- **La comisión pasa a "Pagada" al confirmar la venta** (constante `COMMISSION_PAID_FROM`); ajústala a la política real de pagos.
- Los datos de ejemplo (clientes, montos) son ficticios.
- Persistencia en archivo JSON: reemplazar `backend/store.js` por una base de datos al escalar.
