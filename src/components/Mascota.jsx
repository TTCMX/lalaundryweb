import styles from './Mascota.module.css';

// Burbu, la mascota de La Laundry.
//
// POR QUÉ UNA MASCOTA Y NO UN AVATAR: el chat contesta precios y agenda
// recolecciones, y la diferencia entre "un formulario que responde" y
// "alguien que te ayuda" es casi toda de presencia. Un personaje con cara
// además sirve para algo práctico: dice en qué está sin tener que
// escribirlo. Si está consultando, se nota; si algo salió bien, se nota; si
// ya la tomó una persona del equipo, se nota.
//
// POR QUÉ PNG Y NO SVG: el dibujo es de la marca, no mío, y tiene sombreado,
// textura y detalle que un SVG hecho a mano no reproduce. Cada pose pesa
// unos 12 KB y el chat entero se baja bajo demanda (ver Layout.jsx), así que
// nadie que no abra el chat las paga.
//
// Las poses salen de la hoja de personaje. Si llegan más, se agregan aquí y
// en public/mascota/ y nada más.
const POSES = {
  // Esperando. Es el dibujo principal, el del corazón con los dedos.
  normal: { archivo: 'burbu.png', alt: 'Burbu, la mascota de La Laundry', anim: 'viva' },
  // Saludando: para el primer mensaje y para el botón que abre el chat.
  saluda: { archivo: 'burbu-saluda.png', alt: 'Burbu saludando', anim: 'saluda' },
  // Consultando algo, con el teléfono en la mano.
  pensando: { archivo: 'burbu-pensando.png', alt: 'Burbu consultando', anim: 'pensando' },
  // Algo salió bien: pulgar arriba y la caja del pedido.
  listo: { archivo: 'burbu-listo.png', alt: 'Burbu con el pedido listo', anim: 'listo' },
  // Te paso con alguien: señalando hacia un lado.
  equipo: { archivo: 'burbu-equipo.png', alt: 'Burbu pasando la conversación al equipo', anim: 'viva' },
};

export default function Mascota({ estado = 'normal', size = 48, className = '', decorativa = false }) {
  const pose = POSES[estado] || POSES.normal;

  return (
    <img
      // La `key` fuerza un elemento nuevo al cambiar de pose. Sin eso, la
      // animación de "brincar" —que corre una sola vez— no se vuelve a
      // disparar cuando se agenda una segunda recolección en la misma
      // conversación.
      key={estado}
      src={`/mascota/${pose.archivo}`}
      // Las poses que no son la principal se cargan cuando se necesitan; la
      // principal no, porque es la primera que se ve al abrir el chat.
      loading={estado === 'normal' || estado === 'saluda' ? 'eager' : 'lazy'}
      decoding="async"
      height={size}
      alt={decorativa ? '' : pose.alt}
      aria-hidden={decorativa ? 'true' : undefined}
      className={`${styles.mascota} ${styles[pose.anim]} ${className}`}
      style={{ height: size }}
      draggable="false"
    />
  );
}
