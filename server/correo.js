// Validación de correo, compartida por el formulario y el servidor.
//
// Vive en server/ y no en src/ para que haya UNA sola regla: si el formulario
// valida distinto que el endpoint, o se cuela una dirección que no existe, o
// se rechaza una buena y el cliente no puede agendar. Vite resuelve el import
// relativo desde src/ sin problema.
//
// Deliberadamente laxa. Un correo válido de verdad solo se comprueba
// mandándole algo; lo que esto atrapa son los errores de dedo que hacen que
// el correo de confirmación rebote: sin arroba, sin punto en el dominio,
// espacios, dos arrobas, acentos. Una expresión que intente ser exacta
// termina rechazando direcciones legítimas, que es peor: el cliente se
// atora en el paso 2 y se va.

// Sin espacios, exactamente una arroba, algo antes, y un dominio con al
// menos un punto y dos letras finales.
const FORMA = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$/;

// Errores de dedo que se ven seguido al teclear en el celular, donde el
// autocompletado mete la mano.
const DOMINIOS_MAL = {
  'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com', 'gmail.co': 'gmail.com', 'hotmai.com': 'hotmail.com',
  'hotmail.con': 'hotmail.com', 'outlok.com': 'outlook.com', 'yaho.com': 'yahoo.com',
};

export const limpiarCorreo = (valor) => String(valor ?? '').trim().toLowerCase();

export const correoValido = (valor) => {
  const c = limpiarCorreo(valor);
  // 254 es el máximo de una dirección según el estándar; más que eso es
  // basura pegada, no un correo.
  if (!c || c.length > 254) return false;
  return FORMA.test(c);
};

// Si el dominio es uno de los errores conocidos, devuelve la corrección para
// ofrecérsela al cliente ("¿quisiste decir …?"). Null si no hay nada que
// sugerir. No corrige solo: el cliente decide, porque equivocarse aquí
// manda su confirmación a una dirección que no es la suya.
export const sugerenciaCorreo = (valor) => {
  const c = limpiarCorreo(valor);
  const i = c.lastIndexOf('@');
  if (i < 0) return null;
  const dominio = c.slice(i + 1);
  const bueno = DOMINIOS_MAL[dominio];
  return bueno ? `${c.slice(0, i)}@${bueno}` : null;
};
