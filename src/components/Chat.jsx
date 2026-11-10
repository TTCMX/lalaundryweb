import { useEffect, useRef, useState } from 'react';
import Mascota from './Mascota.jsx';
import styles from './Chat.module.css';

// El chat del sitio, con Burbu.
//
// Vive detrás de un botón flotante y solo se baja cuando alguien lo abre
// (ver Layout.jsx): la mayoría de las visitas no lo usan y no tienen por qué
// pagarlo en la primera carga.
//
// NO habla con la base ni con el modelo: todo pasa por /api/chat, que es
// donde vive la llave. El id de la conversación se guarda en el navegador
// para que recargar la página no pierda el hilo — y solo ahí, porque es la
// única memoria que hay: si se cierra la pestaña, lo que queda es el nombre
// y el teléfono que el bot haya pedido.
//
// LA MASCOTA NO ES ADORNO. Su pose es el estado del chat: si está
// consultando, si acaba de agendar, o si la conversación ya la lleva una
// persona del equipo. Eso ahorra tener que escribirlo en una línea de texto
// que nadie lee.
const CLAVE = 'laundry_chat_id';

const leerId = () => {
  // En una ventana privada, o con el almacenamiento bloqueado, esto lanza.
  // El chat tiene que funcionar igual: se pierde el hilo al recargar y ya.
  try { return localStorage.getItem(CLAVE); } catch { return null; }
};
const guardarId = (id) => { try { localStorage.setItem(CLAVE, id); } catch { /* da igual */ } };

const SALUDO = {
  rol: 'bot',
  texto: 'Hola! Soy Burbu. Te ayudo con precios, cobertura, horarios y te agendo la recolección aquí mismo.\n\n¿Qué necesitas lavar?',
};

// Opciones concretas en vez de una caja de texto en blanco. Es lo mismo que
// hace el equipo en WhatsApp: ofrecer dos cosas que se pueden tocar da más
// conversaciones que preguntar "¿en qué te ayudo?".
// La etiqueta es corta para que quepan en dos renglones; lo que se manda es
// la pregunta completa, porque es lo que el bot tiene que entender.
const ATAJOS = [
  { label: 'Lavar tenis', texto: '¿Cuánto cuesta lavar tenis?' },
  { label: 'Ropa por kilo', texto: '¿Cuánto cuesta la ropa por kilo?' },
  { label: 'Mi zona', texto: '¿Llegan a mi colonia?' },
  { label: 'Agendar', texto: 'Quiero agendar una recolección' },
];

export default function Chat({ onCerrar }) {
  const [mensajes, setMensajes] = useState([SALUDO]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [estado, setEstado] = useState('bot');
  const [agendado, setAgendado] = useState(false);
  const [error, setError] = useState('');
  const convId = useRef(leerId());
  const finRef = useRef(null);
  const campoRef = useRef(null);

  // Al fondo en cada mensaje nuevo, como cualquier chat.
  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [mensajes, enviando]);

  // Cerrar con Escape: es una capa encima de la página y hay que poder
  // salirse sin buscar la tacha con el ratón.
  useEffect(() => {
    const alTeclear = (e) => { if (e.key === 'Escape') onCerrar?.(); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onCerrar]);

  // Mientras una persona lleva la conversación, se pregunta cada pocos
  // segundos si ya contestó. Es la única forma sin conexión persistente, y
  // una conversación en manos del equipo dura minutos, no horas.
  useEffect(() => {
    if (estado !== 'humano' || !convId.current) return;
    let vivo = true;
    const id = setInterval(async () => {
      try {
        const r = await fetch('/api/chat', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accion: 'sondear', conversacionId: convId.current }),
        });
        if (!r.ok || !vivo) return;
        const d = await r.json();
        if (!vivo) return;
        setMensajes([SALUDO, ...(d.mensajes || []).map((m) => ({ rol: m.rol, texto: m.texto }))]);
        if (d.estado !== 'humano') setEstado(d.estado);
      } catch { /* sin red: se reintenta en el siguiente tick */ }
    }, 6000);
    return () => { vivo = false; clearInterval(id); };
  }, [estado]);

  const enviar = async (t) => {
    const mensaje = String(t ?? texto).trim();
    if (!mensaje || enviando) return;

    setMensajes((m) => [...m, { rol: 'cliente', texto: mensaje }]);
    setTexto(''); setEnviando(true); setError('');

    try {
      const r = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversacionId: convId.current, texto: mensaje }),
      });
      if (r.status === 429) {
        setError('Vas muy rápido. Espera un momento.');
        return;
      }
      if (!r.ok) throw new Error('fallo');
      const d = await r.json();
      if (d.conversacionId) { convId.current = d.conversacionId; guardarId(d.conversacionId); }
      if (d.estado) setEstado(d.estado);
      // Si en este turno se agendó, Burbu lo festeja. Dura hasta el siguiente
      // mensaje: es una reacción, no un estado permanente.
      if (d.reserva) setAgendado(true);
      if (d.texto) setMensajes((m) => [...m, { rol: 'bot', texto: d.texto }]);
    } catch {
      setError('No pude mandar tu mensaje. Intenta otra vez.');
    } finally {
      setEnviando(false);
      campoRef.current?.focus();
    }
  };

  // La pose de la mascota ES el estado del chat.
  const pose = enviando ? 'pensando'
    : estado === 'humano' ? 'equipo'
      : agendado ? 'listo'
        : mensajes.length <= 1 ? 'saluda' : 'normal';

  const leyenda = estado === 'humano' ? 'Te contesta una persona del equipo'
    : enviando ? 'Consultando…'
      : 'Contesta al momento';

  // Los atajos solo al principio: después estorban más de lo que ayudan.
  const verAtajos = mensajes.length <= 1 && !enviando && estado === 'bot';

  return (
    <div className={styles.panel} role="dialog" aria-label="Chat con La Laundry">
      <div className={styles.encabezado}>
        <Mascota estado={pose} size={62} className={styles.retrato} />
        <div className={styles.titulo}>
          <div className={styles.nombre}>Burbu · La Laundry</div>
          <div className={styles.estado}>
            <span className={`${styles.punto} ${estado === 'humano' ? styles.puntoHumano : ''}`} />
            {leyenda}
          </div>
        </div>
        <button type="button" onClick={onCerrar} aria-label="Cerrar chat" className={styles.cerrar}>×</button>
      </div>

      <div className={styles.hilo}>
        {mensajes.map((m, i) => {
          const mio = m.rol === 'cliente';
          // El avatar solo en el primer mensaje de cada tanda: en todos sería
          // una columna de lavaditas repetidas.
          const primero = !mio && mensajes[i - 1]?.rol !== m.rol;
          return (
            <div key={i} className={`${styles.fila} ${mio ? styles.filaCliente : ''}`}>
              {!mio && (primero
                ? <Mascota estado={m.rol === 'persona' ? 'equipo' : 'normal'} size={30} className={styles.avatar} decorativa />
                : <span className={styles.avatarHueco} />)}
              <div className={`${styles.burbuja} ${mio ? styles.deCliente : m.rol === 'persona' ? styles.dePersona : styles.deBurbu}`}>
                {m.rol === 'persona' && <span className={styles.firma}>La Laundry</span>}
                {m.texto}
              </div>
            </div>
          );
        })}

        {enviando && (
          <div className={styles.fila}>
            <span className={styles.avatarHueco} />
            <div className={`${styles.burbuja} ${styles.deBurbu} ${styles.puntitos}`} aria-label="Escribiendo">
              <span /><span /><span />
            </div>
          </div>
        )}

        {error && <div className={styles.aviso}>{error}</div>}
        <div ref={finRef} />
      </div>

      {verAtajos && (
        <div className={styles.atajos}>
          {ATAJOS.map((a) => (
            <button key={a.label} type="button" className={styles.atajo} onClick={() => enviar(a.texto)}>
              {a.label}
            </button>
          ))}
        </div>
      )}

      <form
        className={styles.formulario}
        onSubmit={(e) => { e.preventDefault(); enviar(); }}
      >
        <textarea
          ref={campoRef}
          rows={1}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            // Crece con lo que se escribe, hasta el tope que pone el CSS.
            e.target.style.height = 'auto';
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          onKeyDown={(e) => {
            // Enter manda, Shift+Enter hace salto de línea. Es lo que espera
            // quien escribe en un chat.
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
          }}
          placeholder="Escribe aquí…"
          aria-label="Mensaje"
          className={styles.campo}
        />
        <button
          type="submit"
          disabled={!texto.trim() || enviando}
          aria-label="Enviar"
          className={styles.enviar}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M20 12 4 20l3.4-8L4 4l16 8Z" fill="currentColor" />
          </svg>
        </button>
      </form>

      <div className={styles.pie}>
        Burbu es un asistente automático. Si algo se complica, te pasa con una persona.
      </div>
    </div>
  );
}
