// A qué hora hay una persona del otro lado.
//
// POR QUÉ IMPORTA: cuando el bot escala, le dice al cliente "te contesta
// alguien del equipo en un momento". A las 11 de la noche eso es mentira, y
// una mentira cara: el cliente se queda con la pestaña abierta esperando, y
// cuando alguien abre la bandeja a la mañana siguiente ya se fue.
//
// Con el horario a la mano el bot puede decir la verdad —"te contestan
// mañana a partir de las 9"— que es una espera que la gente sí acepta.
//
// Esto NO apaga el bot: Burbu contesta a cualquier hora, porque para eso
// está. Lo único que cambia es lo que se promete al pasar a una persona.

export const ABRE = 9;    // 9am
export const CIERRA = 22; // 10pm

// Todo en hora de la Ciudad de México, sin importar desde dónde corra esto.
// Una función serverless corre en UTC: sin la zona, a las 8pm de México el
// servidor cree que son las 2am y dice que está cerrado.
export const ZONA = 'America/Mexico_City';

// La hora local de México, como número. Se saca con Intl y no restando
// horas: el horario de verano cambió en 2022 y volverá a cambiar, y una
// resta fija se equivoca en silencio durante medio año.
export function horaEnMexico(ahora = new Date()) {
  const partes = new Intl.DateTimeFormat('es-MX', {
    timeZone: ZONA, hour: 'numeric', hour12: false,
  }).formatToParts(ahora);
  const h = Number(partes.find((p) => p.type === 'hour')?.value);
  // Intl puede devolver 24 por la medianoche según el motor.
  return Number.isFinite(h) ? h % 24 : new Date(ahora).getHours();
}

export const hayAlguien = (ahora = new Date()) => {
  const h = horaEnMexico(ahora);
  return h >= ABRE && h < CIERRA;
};

const docena = (h) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`;

export const HORARIO_TEXTO = `${docena(ABRE)} a ${docena(CIERRA)}`;

// Lo que el bot le dice al cliente al pasarlo con una persona. Dos frases
// distintas porque son dos situaciones distintas, y la de la noche tiene que
// decir CUÁNDO, no solo que no hay nadie.
export function cuandoContestan(ahora = new Date()) {
  if (hayAlguien(ahora)) {
    return { abierto: true, decir: 'Te contesta alguien del equipo por aquí mismo en un momento.' };
  }
  const h = horaEnMexico(ahora);
  // Antes de abrir es el mismo día; después de cerrar, mañana.
  const esMadrugada = h < ABRE;
  return {
    abierto: false,
    decir: esMadrugada
      ? `El equipo entra a las ${docena(ABRE)}. A esa hora te contestan por aquí mismo.`
      : `El equipo ya terminó por hoy (atendemos de ${HORARIO_TEXTO}). Mañana a partir de las ${docena(ABRE)} te contestan por aquí mismo.`,
  };
}
