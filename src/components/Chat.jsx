import { useEffect, useRef, useState } from 'react';

// El chat del sitio.
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
const CLAVE = 'laundry_chat_id';

const COLOR_CORAL = '#f37562';
const COLOR_NAVY = '#506d6b';
const COLOR_BG = '#dcf5f6';
const COLOR_BORDE = '#cdeaec';

const leerId = () => {
  // En una ventana privada, o con el almacenamiento bloqueado, esto lanza.
  // El chat tiene que funcionar igual: se pierde el hilo al recargar y ya.
  try { return localStorage.getItem(CLAVE); } catch { return null; }
};
const guardarId = (id) => { try { localStorage.setItem(CLAVE, id); } catch { /* da igual */ } };

const SALUDO = {
  rol: 'bot',
  texto: '¡Hola! Te ayudo con precios, cobertura y horarios. ¿Qué necesitas lavar?',
};

export default function Chat({ onCerrar }) {
  const [mensajes, setMensajes] = useState([SALUDO]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [estado, setEstado] = useState('bot');
  const [error, setError] = useState('');
  const convId = useRef(leerId());
  const finRef = useRef(null);

  // Al fondo en cada mensaje nuevo, como cualquier chat.
  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [mensajes]);

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

  const enviar = async (e) => {
    e?.preventDefault();
    const t = texto.trim();
    if (!t || enviando) return;

    setMensajes((m) => [...m, { rol: 'cliente', texto: t }]);
    setTexto(''); setEnviando(true); setError('');

    try {
      const r = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversacionId: convId.current, texto: t }),
      });
      if (r.status === 429) {
        setError('Vas muy rápido. Espera un momento.');
        return;
      }
      if (!r.ok) throw new Error('fallo');
      const d = await r.json();
      if (d.conversacionId) { convId.current = d.conversacionId; guardarId(d.conversacionId); }
      if (d.estado) setEstado(d.estado);
      if (d.texto) setMensajes((m) => [...m, { rol: 'bot', texto: d.texto }]);
    } catch {
      setError('No pude mandar tu mensaje. Intenta otra vez.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', right: 16, bottom: 16, zIndex: 60,
      width: 'min(380px, calc(100vw - 32px))', height: 'min(560px, calc(100vh - 32px))',
      background: '#fff', borderRadius: 18, border: `1px solid ${COLOR_BORDE}`,
      boxShadow: '0 12px 40px rgba(28,38,37,.22)', display: 'flex', flexDirection: 'column',
      overflow: 'hidden', fontFamily: "'Work Sans', Arial, Helvetica, sans-serif",
    }}>
      <div style={{
        background: COLOR_BG, padding: '14px 16px', borderBottom: `1px solid ${COLOR_BORDE}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#1c2625' }}>La Laundry</div>
          <div style={{ fontSize: 12, color: COLOR_NAVY }}>
            {estado === 'humano' ? 'Te contesta una persona' : 'Respuesta inmediata'}
          </div>
        </div>
        <button onClick={onCerrar} aria-label="Cerrar chat" style={{
          background: 'none', border: 'none', fontSize: 22, lineHeight: 1,
          color: COLOR_NAVY, cursor: 'pointer', padding: 4,
        }}>×</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {mensajes.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.rol === 'cliente' ? 'flex-end' : 'flex-start',
            maxWidth: '85%',
            background: m.rol === 'cliente' ? COLOR_CORAL : COLOR_BG,
            color: m.rol === 'cliente' ? '#fff' : '#1c2625',
            borderRadius: 14, padding: '9px 13px', fontSize: 14, lineHeight: 1.5,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {m.texto}
          </div>
        ))}
        {enviando && (
          <div style={{ alignSelf: 'flex-start', color: COLOR_NAVY, fontSize: 13, padding: '4px 6px' }}>
            Escribiendo…
          </div>
        )}
        {error && (
          <div style={{ alignSelf: 'center', color: '#a84333', fontSize: 12.5 }}>{error}</div>
        )}
        <div ref={finRef} />
      </div>

      <form onSubmit={enviar} style={{
        display: 'flex', gap: 8, padding: 12, borderTop: `1px solid ${COLOR_BORDE}`,
      }}>
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribe aquí…"
          aria-label="Mensaje"
          style={{
            flex: 1, minWidth: 0, border: `1.5px solid ${COLOR_BORDE}`, borderRadius: 12,
            padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', outline: 'none',
          }}
        />
        <button type="submit" disabled={!texto.trim() || enviando} style={{
          background: texto.trim() && !enviando ? COLOR_CORAL : COLOR_BORDE,
          color: '#fff', border: 'none', borderRadius: 12, padding: '10px 16px',
          fontWeight: 700, fontSize: 14, fontFamily: 'inherit',
          cursor: texto.trim() && !enviando ? 'pointer' : 'default',
        }}>
          Enviar
        </button>
      </form>
    </div>
  );
}
