// Validación de correo. Ahora que es obligatorio para agendar, esta regla
// está en el camino crítico de cada reserva: si rechaza una dirección buena,
// el cliente se atora en el paso 2 y se va. Rechazar de más es peor que
// dejar pasar de más.
import { t, resumen } from './_t.mjs';
import { correoValido, sugerenciaCorreo, limpiarCorreo } from '../server/correo.js';

// ── Direcciones que TIENEN que pasar ──────────────────────────────────────
const BUENOS = [
  'juan@gmail.com',
  'JUAN@GMAIL.COM',               // mayúsculas: se normalizan
  '  juan@gmail.com  ',           // pegado con espacios alrededor
  'juan.perez@gmail.com',
  'juan+laundry@gmail.com',       // etiqueta de Gmail, legítima
  'juan_perez@hotmail.com',
  'juan-perez@mi-empresa.com.mx', // dominio compuesto mexicano
  'j@x.mx',                       // corto pero válido
  'contacto@sub.dominio.lalaundry.xyz',
  "o'brien@gmail.com",            // apóstrofo: existe
];
for (const c of BUENOS) t(`pasa: ${JSON.stringify(c)}`, correoValido(c) === true);

// ── Lo que NO debe pasar ──────────────────────────────────────────────────
const MALOS = [
  ['', 'vacío'],
  [null, 'null'],
  [undefined, 'undefined'],
  ['   ', 'solo espacios'],
  ['juan', 'sin arroba'],
  ['juan@', 'sin dominio'],
  ['@gmail.com', 'sin nombre'],
  ['juan@gmail', 'dominio sin punto'],
  ['juan@@gmail.com', 'dos arrobas'],
  ['juan perez@gmail.com', 'espacio en medio'],
  ['juan@gmail .com', 'espacio en el dominio'],
  ['juan@gmail.c', 'extensión de una letra'],
  ['juan@.com', 'dominio que empieza con punto'],
  ['juan@gmail..com', 'punto doble'],
];
for (const [c, por] of MALOS) t(`rechaza (${por})`, correoValido(c) === false);

// Una dirección absurdamente larga es basura pegada, no un correo.
t('rechaza algo de más de 254 caracteres',
  correoValido('a'.repeat(250) + '@gmail.com') === false);

// ── Normalización ─────────────────────────────────────────────────────────
t('limpia espacios y mayúsculas', limpiarCorreo('  Juan@Gmail.COM ') === 'juan@gmail.com');
t('limpiar null da cadena vacía', limpiarCorreo(null) === '');
t('limpiar un número no truena', limpiarCorreo(123) === '123');

// ── Sugerencia de dominio ─────────────────────────────────────────────────
// En el celular el autocompletado se equivoca seguido, y un correo de
// confirmación que rebota es una reserva muda.
t('sugiere gmail.com para gmail.con', sugerenciaCorreo('juan@gmail.con') === 'juan@gmail.com');
t('y para gmial.com', sugerenciaCorreo('juan@gmial.com') === 'juan@gmail.com');
t('y para hotmail.con', sugerenciaCorreo('ana@hotmail.con') === 'ana@hotmail.com');
t('respeta mayúsculas de origen al sugerir',
  sugerenciaCorreo('JUAN@GMAIL.CON') === 'juan@gmail.com');
t('no sugiere nada si el dominio está bien', sugerenciaCorreo('juan@gmail.com') === null);
t('ni para un dominio propio', sugerenciaCorreo('a@lalaundry.xyz') === null);
t('ni sin arroba', sugerenciaCorreo('juan') === null);
t('ni con null', sugerenciaCorreo(null) === null);

// La sugerencia siempre tiene que ser, ella misma, un correo válido: se
// ofrece con un botón que la aplica de un clic.
for (const malo of ['juan@gmail.con', 'ana@yaho.com', 'x@outlok.com']) {
  t(`la sugerencia de ${malo} es válida`, correoValido(sugerenciaCorreo(malo)) === true);
}

resumen('correo');
