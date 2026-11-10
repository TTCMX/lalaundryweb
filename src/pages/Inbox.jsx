import { useCallback, useEffect, useRef, useState } from 'react';

// La bandeja del equipo: las conversaciones del chat que esperan a alguien.
//
// Sin esto, el bot escala, manda el correo de aviso y le dice al cliente que
// "te contesta una persona" — y no hay dónde contestar. Prometer eso sin
// poder cumplirlo es peor que no escalar.
//
// La clave se teclea y se guarda solo en esta pestaña (sessionStorage): no
// viaja en el bundle y no se queda en la computadora al cerrar. No es
// Supabase Auth, que el portal no tiene; es lo que corresponde a una página
// interna de una persona mientras no exista.
//
// Se refresca cada pocos segundos en vez de por Realtime: el navegador NO
// tiene acceso a las tablas del chat a propósito —ahí están las
// conversaciones de todos, con teléfonos adentro— así que todo pasa por
// /api/chat.
const CLAVE_SESION = 'laundry_bandeja_clave';
const CADA_MS = 5000;

const C = { coral: '#f37562', navy: '#506d6b', bg: '#dcf5f6', borde: '#cdeaec', tinta: '#1c2625' };
const FUENTE = "'Work Sans', Arial, Helvetica, sans-serif";

const leerClave = () => { try { return sessionStorage.getItem(CLAVE_SESION) || ''; } catch { return ''; } };

const hace = (iso) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
};

const llamar = (cuerpo) =>
  fetch('/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });

export default function Inbox() {
  const [clave, setClave] = useState(leerClave);
  const [entrado, setEntrado] = useState(false);
  const [error, setError] = useState('');
  const [convs, setConvs] = useState([]);
  const [abierta, setAbierta] = useState(null);
  const [respuesta, setRespuesta] = useState('');
  const [enviando, setEnviando] = useState(false);
  const claveRef = useRef(clave);

  const cargar = useCallback(async () => {
    const r = await llamar({ accion: 'bandeja', clave: claveRef.current });
    if (r.status === 401) { setEntrado(false); setError('Clave incorrecta.'); return false; }
    if (!r.ok) { setError('No se pudo leer la bandeja.'); return false; }
    const d = await r.json();
    setConvs(d.conversaciones || []);
    setError('');
    return true;
  }, []);

  const entrar = async (e) => {
    e?.preventDefault();
    claveRef.current = clave;
    if (await cargar()) {
      setEntrado(true);
      try { sessionStorage.setItem(CLAVE_SESION, clave); } catch { /* da igual */ }
    }
  };

  // Al entrar, si ya había clave guardada en esta pestaña.
  useEffect(() => { if (clave && !entrado) entrar(); /* eslint-disable-line */ }, []);

  useEffect(() => {
    if (!entrado) return;
    const id = setInterval(cargar, CADA_MS);
    return () => clearInterval(id);
  }, [entrado, cargar]);

  const conv = convs.find((c) => c.id === abierta) || null;

  const responder = async (e) => {
    e?.preventDefault();
    const t = respuesta.trim();
    if (!t || !conv || enviando) return;
    setEnviando(true);
    const r = await llamar({ accion: 'responder', clave: claveRef.current, conversacionId: conv.id, texto: t });
    setEnviando(false);
    if (!r.ok) { setError('No se pudo enviar.'); return; }
    setRespuesta('');
    cargar();
  };

  const cerrar = async () => {
    if (!conv) return;
    await llamar({ accion: 'cerrar', clave: claveRef.current, conversacionId: conv.id });
    setAbierta(null);
    cargar();
  };

  if (!entrado) {
    return (
      <div style={{ maxWidth: 360, margin: '80px auto', padding: '0 20px', fontFamily: FUENTE }}>
        <h1 style={{ fontSize: 22, color: C.tinta, marginBottom: 6 }}>Conversaciones</h1>
        <p style={{ fontSize: 14, color: C.navy, marginTop: 0, marginBottom: 18 }}>
          El chat del sitio. Entra para contestar.
        </p>
        <form onSubmit={entrar}>
          <input
            type="password" value={clave} onChange={(e) => setClave(e.target.value)}
            placeholder="Clave" aria-label="Clave"
            style={{ width: '100%', border: `1.5px solid ${C.borde}`, borderRadius: 12, padding: '11px 13px', fontSize: 15, fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
          {error && <div style={{ color: '#a84333', fontSize: 13, marginTop: 8 }}>{error}</div>}
          <button type="submit" style={{ width: '100%', marginTop: 12, background: C.coral, color: '#fff', border: 'none', borderRadius: 12, padding: 12, fontWeight: 700, fontSize: 15, fontFamily: 'inherit', cursor: 'pointer' }}>
            Entrar
          </button>
        </form>
      </div>
    );
  }

  const esperando = convs.filter((c) => c.estado === 'humano');

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 20px 60px', fontFamily: FUENTE }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, color: C.tinta, margin: 0 }}>Conversaciones</h1>
        <span style={{ fontSize: 13, color: esperando.length ? C.coral : C.navy, fontWeight: esperando.length ? 700 : 400 }}>
          {esperando.length ? `${esperando.length} esperando` : 'nadie esperando'}
        </span>
      </div>
      {error && <div style={{ color: '#a84333', fontSize: 13, marginBottom: 10 }}>{error}</div>}

      {!conv ? (
        convs.length === 0 ? (
          <p style={{ color: C.navy, fontSize: 14 }}>Sin conversaciones abiertas.</p>
        ) : (
          convs.map((c) => {
            const ultimo = c.mensajes[c.mensajes.length - 1];
            return (
              <button key={c.id} onClick={() => setAbierta(c.id)} style={{
                width: '100%', textAlign: 'left', background: '#fff',
                border: `1.5px solid ${c.estado === 'humano' ? C.coral : C.borde}`,
                borderRadius: 14, padding: '12px 14px', marginBottom: 8, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: C.tinta }}>
                    {c.nombre || c.telefono || 'Sin nombre'}
                    {c.estado === 'humano' && <span style={{ color: C.coral, marginLeft: 8, fontSize: 12 }}>· espera</span>}
                  </span>
                  <span style={{ fontSize: 12, color: C.navy, flexShrink: 0 }}>{hace(c.tocado_en)}</span>
                </div>
                <div style={{ fontSize: 13, color: C.navy, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ultimo ? `${ultimo.rol === 'cliente' ? '' : '↩ '}${ultimo.texto}` : 'Sin mensajes'}
                </div>
              </button>
            );
          })
        )
      ) : (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button onClick={() => setAbierta(null)} style={{ background: 'none', border: 'none', color: C.navy, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
              ← Todas
            </button>
            <button onClick={cerrar} style={{ marginLeft: 'auto', background: 'none', border: `1.5px solid ${C.borde}`, borderRadius: 10, padding: '6px 12px', color: C.navy, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              Cerrar conversación
            </button>
          </div>

          <div style={{ background: '#fff', border: `1px solid ${C.borde}`, borderRadius: 14, padding: 14, maxHeight: '55vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 9 }}>
            {conv.mensajes.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.rol === 'cliente' ? 'flex-start' : 'flex-end',
                maxWidth: '82%',
                background: m.rol === 'cliente' ? C.bg : m.rol === 'persona' ? C.coral : '#f3f1ee',
                color: m.rol === 'persona' ? '#fff' : C.tinta,
                borderRadius: 13, padding: '8px 12px', fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap',
              }}>
                {m.rol === 'bot' && <div style={{ fontSize: 10.5, color: C.navy, marginBottom: 2 }}>bot</div>}
                {m.texto}
              </div>
            ))}
          </div>

          <form onSubmit={responder} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input
              value={respuesta} onChange={(e) => setRespuesta(e.target.value)}
              placeholder="Tu respuesta…" aria-label="Respuesta"
              style={{ flex: 1, minWidth: 0, border: `1.5px solid ${C.borde}`, borderRadius: 12, padding: '10px 13px', fontSize: 14, fontFamily: 'inherit' }}
            />
            <button type="submit" disabled={!respuesta.trim() || enviando} style={{
              background: respuesta.trim() && !enviando ? C.coral : C.borde, color: '#fff', border: 'none',
              borderRadius: 12, padding: '10px 18px', fontWeight: 700, fontSize: 14, fontFamily: 'inherit',
              cursor: respuesta.trim() && !enviando ? 'pointer' : 'default',
            }}>
              Enviar
            </button>
          </form>
          <p style={{ fontSize: 12, color: C.navy, marginTop: 8 }}>
            Al contestar, el bot deja de responder en esta conversación.
          </p>
        </div>
      )}
    </div>
  );
}
