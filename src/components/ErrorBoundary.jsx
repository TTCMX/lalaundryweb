import { Component } from 'react';
import { useLocation } from 'react-router-dom';
import { WHATSAPP_LEGIBLE, whatsappURL } from '../lib/contacto.js';

// La red de seguridad del sitio.
//
// POR QUÉ EXISTE: no había ninguna. Si algo tronaba durante el render —un
// efecto que lanza, un dato que llegó null de un endpoint, una librería de
// terceros que cambió— React desmonta TODO el árbol y la página se queda en
// blanco sobre el fondo del sitio. El cliente ve una pantalla de color, sin
// un botón, sin un mensaje y sin manera de decirnos qué pasó; y nosotros no
// nos enteramos, porque el error se queda en una consola que nadie abre.
//
// Esto no arregla el bug que tronó: lo contiene. En vez de la nada, deja un
// mensaje, un botón para reintentar y el WhatsApp, que es lo que convierte
// una reserva perdida en una reserva por otro camino.
//
// DOS COSAS QUE LA PRIMERA VERSIÓN NO HACÍA:
//
//   1. No se reiniciaba al navegar. Una vez que atrapaba algo, se quedaba
//      enseñando el error para siempre: tocar "Catálogo" cambiaba la URL y
//      la pantalla seguía igual, así que parecía que el sitio entero estaba
//      muerto cuando lo único roto era una página.
//   2. No decía qué tronó. Con la pantalla de error delante, lo único que se
//      podía reportar era "se rompió". Ahora el mensaje técnico está a un
//      toque de distancia, para poder decirlo por WhatsApp sin abrir la
//      consola de un teléfono.
class Limite extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, verDetalle: false };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // A la consola del navegador. No se manda a ningún lado más: un error de
    // render puede traer datos del cliente.
    console.error('[sitio] render roto:', error, info?.componentStack);
    this.setState({ pila: (info?.componentStack || '').trim().split('\n').slice(0, 3).join(' ') });
  }

  componentDidUpdate(prev) {
    // Al cambiar de página se intenta de nuevo: lo que tronó puede haber
    // sido solo esa pantalla.
    if (this.state.error && prev.ruta !== this.props.ruta) {
      this.setState({ error: null, verDetalle: false, pila: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    const detalle = [this.state.error?.message, this.state.pila].filter(Boolean).join(' · ');

    return (
      <div style={estilos.caja}>
        <h1 style={estilos.titulo}>Algo se rompió de nuestro lado</h1>
        <p style={estilos.texto}>
          No es tu conexión ni algo que hayas hecho mal. Puedes recargar la página e intentar
          otra vez; si vuelve a pasar, escríbenos y te agendamos nosotros.
        </p>
        <div style={estilos.botones}>
          <button type="button" style={estilos.boton} onClick={() => window.location.reload()}>
            Recargar
          </button>
          <a
            style={{ ...estilos.boton, ...estilos.botonSecundario }}
            href={whatsappURL(`Hola, me falló la página. Dice: ${detalle || 'sin detalle'}`)}
            target="_blank"
            rel="noopener noreferrer"
          >
            WhatsApp {WHATSAPP_LEGIBLE}
          </a>
        </div>

        {/* El detalle técnico, escondido pero alcanzable. Quien reporta el
            problema desde un teléfono no tiene consola; esto es lo que
            convierte "se rompió" en algo que se puede arreglar. */}
        <button
          type="button"
          style={estilos.verMas}
          onClick={() => this.setState((s) => ({ verDetalle: !s.verDetalle }))}
        >
          {this.state.verDetalle ? 'Ocultar detalle' : 'Ver detalle técnico'}
        </button>
        {this.state.verDetalle && <pre style={estilos.detalle}>{detalle || 'Sin detalle'}</pre>}
      </div>
    );
  }
}

// El límite necesita saber cuándo cambió la ruta, y los componentes de clase
// no pueden usar hooks. Este envoltorio se lo pasa como prop.
export default function ErrorBoundary({ children }) {
  const { pathname } = useLocation();
  return <Limite ruta={pathname}>{children}</Limite>;
}

// En línea y no en un módulo de CSS a propósito: esto tiene que poder
// dibujarse aunque lo que haya fallado sea justamente el CSS de la página.
const estilos = {
  caja: { maxWidth: 560, margin: '80px auto', padding: '0 20px', textAlign: 'center' },
  titulo: { fontSize: 24, marginBottom: 12 },
  texto: { fontSize: 15, lineHeight: 1.6, opacity: 0.85, marginBottom: 24 },
  botones: { display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' },
  boton: {
    display: 'inline-block', padding: '12px 20px', borderRadius: 10, border: '1px solid currentColor',
    background: 'none', color: 'inherit', font: 'inherit', cursor: 'pointer', textDecoration: 'none',
  },
  botonSecundario: { opacity: 0.8 },
  verMas: {
    marginTop: 22, background: 'none', border: 'none', font: 'inherit', fontSize: 13,
    opacity: 0.6, textDecoration: 'underline', cursor: 'pointer', color: 'inherit',
  },
  detalle: {
    marginTop: 10, textAlign: 'left', fontSize: 11.5, lineHeight: 1.5, whiteSpace: 'pre-wrap',
    wordBreak: 'break-word', opacity: 0.75, background: 'rgba(0,0,0,.05)', padding: 10,
    borderRadius: 8,
  },
};
