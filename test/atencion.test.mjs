// El horario en que hay una persona del otro lado.
//
// Importa porque cuando el bot escala le dice al cliente que alguien le
// contesta. A las 11 de la noche eso es mentira, y una mentira cara: el
// cliente se queda con la pestaña abierta esperando y cuando alguien abre la
// bandeja a la mañana siguiente ya se fue.
import { t, resumen } from './_t.mjs';
import { hayAlguien, horaEnMexico, cuandoContestan, HORARIO_TEXTO, ABRE, CIERRA } from '../server/atencion.js';

// Las horas se construyen en UTC a propósito: una función serverless corre
// en UTC, y la prueba tiene que demostrar que la conversión a hora de México
// sí ocurre. En noviembre, México está 6 horas detrás.
const utc = (h, m = 0) => new Date(Date.UTC(2026, 10, 10, h, m));

t('el horario es de 9am a 10pm', ABRE === 9 && CIERRA === 22);
t('y se lee bonito', HORARIO_TEXTO === '9am a 10pm');

t('las 15:00 UTC son las 9am en México', horaEnMexico(utc(15)) === 9);
t('las 04:00 UTC son las 10pm del día anterior', horaEnMexico(utc(4)) === 22);

t('a las 9am ya hay alguien', hayAlguien(utc(15)) === true);
t('a mediodía también', hayAlguien(utc(18)) === true);
t('a las 9:59pm todavía', hayAlguien(utc(3, 59)) === true);
t('a las 10pm en punto ya no', hayAlguien(utc(4)) === false);
t('a medianoche no', hayAlguien(utc(6)) === false);
t('a las 8am tampoco', hayAlguien(utc(14)) === false);

// Lo que de verdad importa: QUÉ se le dice al cliente.
{
  const r = cuandoContestan(utc(18));
  t('en horario se promete pronto', r.abierto === true && /en un momento/i.test(r.decir));
}
{
  const r = cuandoContestan(utc(6)); // medianoche en México
  t('de madrugada NO se promete "en un momento"',
    r.abierto === false && !/en un momento/i.test(r.decir));
  t('y se dice a qué hora entran', r.decir.includes('9am'));
}
{
  const r = cuandoContestan(utc(14)); // 8am, antes de abrir
  t('antes de abrir se dice que entran hoy',
    r.abierto === false && !/mañana/i.test(r.decir));
}
{
  const r = cuandoContestan(utc(5)); // 11pm, ya cerró
  t('después de cerrar se dice que mañana', r.decir.includes('Mañana'));
  t('y se menciona el horario completo', r.decir.includes(HORARIO_TEXTO));
}

resumen('atención');
