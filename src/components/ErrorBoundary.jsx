import { Component } from 'react';
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
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // A la consola del navegador y, si hay analítica, al reporte. No se manda
    // a ningún lado más: un error de render puede traer datos del cliente.
    console.error('[sitio] render roto:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

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
            href={whatsappURL('Hola, me falló la página al agendar.')}
            target="_blank"
            rel="noopener noreferrer"
          >
            WhatsApp {WHATSAPP_LEGIBLE}
          </a>
        </div>
      </div>
    );
  }
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
};
