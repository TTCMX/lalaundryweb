import { Link } from 'react-router-dom';
import PageHero from '../components/PageHero.jsx';

// Las tarjetas de regalo se pausaron el 9-nov-2026.
//
// Esta página se queda en pie, con el aviso, en vez de borrar la ruta: la URL
// está indexada, se compartió por WhatsApp y hasta hace poco la enlazaba la
// pantalla de seguimiento del pedido. Quitar la ruta dejaría una página en
// blanco dentro del sitio, porque no hay ruta de respaldo para lo que no
// existe, y quien llegara pensaría que algo se rompió.
//
// FALTA PONER EL CONTACTO. En el repo no hay ningún teléfono ni correo de
// atención —los que aparecen son placeholders o variables de entorno— así que
// no inventé uno aquí. Cuando pongas el de verdad, descomenta el botón de
// abajo con tu número en formato wa.me (52 + diez dígitos, sin espacios).
//
// Cuando se vuelva a prender el producto, el formulario de compra está en el
// historial: el commit anterior a "Tarjetas de regalo: apagadas".
export default function TarjetaRegalo() {
  return (
    <>
      <PageHero
        badge="Tarjetas de regalo"
        title="No disponibles por ahora"
        text="Pausamos la venta de tarjetas de regalo mientras le damos una vuelta al programa. Volverán."
      />

      <section style={{ maxWidth: 560, margin: '0 auto', padding: '0 20px 72px' }}>
        <div style={{
          background: '#fff', border: '1.5px dashed #D9CDB8', borderRadius: 16,
          padding: '22px 24px', lineHeight: 1.6,
        }}>
          <p style={{ margin: 0, fontSize: 15, color: '#26201A', fontWeight: 600 }}>
            ¿Ya tienes una tarjeta comprada?
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 14, color: '#6A5F52' }}>
            Tu saldo sigue registrado. Escríbenos con tu código y lo
            resolvemos contigo.
          </p>
          {/* <a
            href="https://wa.me/52XXXXXXXXXX"
            style={{
              display: 'inline-block', marginTop: 16, background: '#26201A',
              color: '#ED7A5E', borderRadius: 10, padding: '11px 20px',
              fontWeight: 700, fontSize: 14, textDecoration: 'none',
            }}
          >
            Escribir por WhatsApp
          </a> */}
        </div>

        <p style={{ marginTop: 28, fontSize: 14, color: '#6A5F52', textAlign: 'center' }}>
          Mientras tanto,{' '}
          <Link to="/membresia" style={{ color: '#26201A', fontWeight: 700 }}>
            la membresía
          </Link>{' '}
          da descuento en todas tus compras, o puedes{' '}
          <Link to="/agendar" style={{ color: '#26201A', fontWeight: 700 }}>
            agendar una recolección
          </Link>.
        </p>
      </section>
    </>
  );
}
