// Configuración del frontend.
//
// apiBase: URL del backend, sin "/" al final. Ejemplos:
//   ''                                  -> mismo origen (cuando corres `npm start`)
//   'https://mi-backend.example.com'    -> backend desplegado por separado
//
// Si el backend no responde, la app entra sola en "modo demo": los datos se
// guardan en el navegador (localStorage). Así funciona en GitHub Pages sin servidor.
window.EV_CONFIG = {
  apiBase: '',
};
