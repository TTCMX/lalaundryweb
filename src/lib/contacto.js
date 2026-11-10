// El WhatsApp del negocio, en un solo lugar.
//
// Estaba tecleado dentro de un banner de Agendar.jsx y faltaba en la página
// de tarjetas de regalo, donde el botón quedó comentado esperando el número.
// Un teléfono repartido por el código es el que se queda viejo cuando cambia.

export const WHATSAPP = '5644198713';

// Como se lee, para mostrarlo en pantalla.
export const WHATSAPP_LEGIBLE = '56 4419 8713';

// wa.me pide el número con lada de país y sin nada más: 52 + diez dígitos.
// El texto prellenado es opcional y ayuda a que la conversación empiece con
// contexto en vez de un "hola".
export const whatsappURL = (texto) =>
  `https://wa.me/52${WHATSAPP}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
