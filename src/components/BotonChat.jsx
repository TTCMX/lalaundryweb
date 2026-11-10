import { lazy, Suspense, useEffect, useState } from 'react';
import Mascota from './Mascota.jsx';
import styles from './Chat.module.css';

// El botón que abre el chat: Burbu asomada en una esquina.
//
// Antes era una píldora coral que decía "¿Dudas?". Funcionaba, pero no se
// distinguía de los cien botones de chat que trae cualquier sitio. La
// mascota sí, y de paso dice qué hay detrás antes de que lo abran.
//
// El chat se baja solo cuando alguien lo abre: la mayoría de las visitas no
// lo usan y no tienen por qué pagarlo en la primera carga. Lo que sí vive en
// el paquete principal es esto —el botón y el dibujo— porque se ve siempre.
const Chat = lazy(() => import('./Chat.jsx'));

// El globito se muestra una vez por visita, no en cada página. Un saludo que
// reaparece cada vez que alguien navega deja de ser un saludo.
const CLAVE_SALUDO = 'laundry_chat_saludo';
const yaSaludo = () => {
  try { return sessionStorage.getItem(CLAVE_SALUDO) === '1'; } catch { return true; }
};
const marcarSaludo = () => {
  try { sessionStorage.setItem(CLAVE_SALUDO, '1'); } catch { /* da igual */ }
};

export default function BotonChat() {
  const [abierto, setAbierto] = useState(false);
  const [globo, setGlobo] = useState(false);

  // Después de un momento, no al entrar: un globo que aparece encima de la
  // página antes de que alguien alcance a leer nada es un anuncio.
  useEffect(() => {
    if (abierto || yaSaludo()) return;
    const t = setTimeout(() => setGlobo(true), 3500);
    return () => clearTimeout(t);
  }, [abierto]);

  const abrir = () => {
    setAbierto(true);
    setGlobo(false);
    marcarSaludo();
  };

  if (abierto) {
    // Sin respaldo visible: el chat tarda un parpadeo en bajar y un recuadro
    // "Cargando" que aparece y se va llamaría más la atención que el chat.
    return (
      <Suspense fallback={null}>
        <Chat onCerrar={() => setAbierto(false)} />
      </Suspense>
    );
  }

  return (
    <button type="button" onClick={abrir} className={styles.lanzador} aria-label="Abrir el chat de La Laundry">
      {globo && (
        <span className={styles.globo}>¿Te ayudo a cotizar o a agendar?</span>
      )}
      <span className={styles.disco}>
        <Mascota estado="saluda" size={64} className={styles.asomada} decorativa />
      </span>
    </button>
  );
}
