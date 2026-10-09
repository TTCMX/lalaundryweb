let loadPromise = null;

// Google no rechaza la llave al cargar el script: el script carga bien, llama
// al callback, y sólo cuando el autocompletado hace su primera petición
// responde que la llave no sirve. En ese momento inyecta su propio cartel gris
// ("Esta página no puede cargar Google Maps correctamente") encima de nuestro
// formulario, que parece una falla nuestra, y deja al cliente sin sugerencias
// y sin poder avanzar.
//
// El único aviso que da es esta función global. Sin ella no hay forma de saber
// que Maps dejó de servir, así que la página se quedaba esperando sugerencias
// que nunca iban a llegar.
let authFailed = false;
const authListeners = new Set();

export function googleMapsAuthFailed() {
  return authFailed;
}

// Devuelve la función para desuscribirse. Si la llave ya había fallado antes
// de suscribirse, avisa de inmediato: el fallo ocurre en cuanto el cliente
// teclea la primera letra, que bien puede ser antes de que monte el paso.
export function onGoogleMapsAuthFailure(fn) {
  if (authFailed) {
    fn();
    return () => {};
  }
  authListeners.add(fn);
  return () => authListeners.delete(fn);
}

function marcarFallo(motivo) {
  if (authFailed) return;
  authFailed = true;
  console.error(
    `[maps] Google rechazó la llave (${motivo}). Revisa en Google Cloud que la ` +
      'facturación esté activa, que "Maps JavaScript API" y "Places API" estén ' +
      'habilitadas, y que las restricciones de referente incluyan este dominio.',
  );
  // Google inyecta su propio cartel gris en el desplegable del autocompletado
  // y encima del mapa. Al cliente le parece que el formulario está roto, así
  // que se esconde y la página explica el problema con sus propias palabras.
  if (typeof document !== 'undefined') {
    const estilo = document.createElement('style');
    estilo.textContent = '.pac-container, .gm-err-container { display: none !important; }';
    document.head.appendChild(estilo);
  }
  authListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // Un suscriptor roto no puede impedir que se enteren los demás.
    }
  });
}

export function loadGoogleMaps() {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if (window.google?.maps?.places) return Promise.resolve(window.google);
  if (loadPromise) return loadPromise;

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    marcarFallo('falta VITE_GOOGLE_MAPS_API_KEY');
    return Promise.reject(new Error('Missing VITE_GOOGLE_MAPS_API_KEY'));
  }

  loadPromise = new Promise((resolve, reject) => {
    window.__onGoogleMapsLoaded = () => resolve(window.google);
    window.gm_authFailure = () => marcarFallo('gm_authFailure');
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async&callback=__onGoogleMapsLoaded`;
    script.async = true;
    script.onerror = () => {
      marcarFallo('el script no cargó');
      reject(new Error('Failed to load Google Maps script'));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
}
