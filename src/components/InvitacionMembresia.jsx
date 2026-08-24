import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './InvitacionMembresia.module.css';

const OPS_API = import.meta.env.VITE_OPS_API_URL || 'https://app.lalaundry.xyz';

// Se muestra al terminar de agendar, que es cuando el cliente acaba de ver lo
// que va a pagar y la membresía tiene sentido para él.
//
// Antes de invitar se consulta si ya es miembro: ofrecerle una membresía a
// quien ya la paga se ve mal. Mientras se resuelve no se pinta nada, para no
// mostrar la invitación y quitarla a los dos segundos.
export default function InvitacionMembresia({ telefono }) {
  const [membresia, setMembresia] = useState(null); // null = aún no se sabe

  useEffect(() => {
    const tel = String(telefono || '').replace(/\D/g, '');
    if (tel.length < 10) {
      setMembresia({ activa: false });
      return;
    }
    let cancelado = false;
    fetch(`${OPS_API}/api/buscar-cliente`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tel }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelado) setMembresia(data?.membresia || { activa: false });
      })
      // Si la consulta falla se invita igual: el caso común es que no sea
      // miembro, y perder la invitación cuesta más que mostrarla de más.
      .catch(() => { if (!cancelado) setMembresia({ activa: false }); });
    return () => { cancelado = true; };
  }, [telefono]);

  if (membresia === null) return null;

  if (membresia.activa) {
    return (
      <div className={styles.gracias}>
        ★ Gracias por ser miembro{membresia.nivel === 'vip' ? ' VIP' : ''} — tus beneficios se
        aplican en esta recolección.
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <span className={styles.badge}>The Clean Club</span>
      <h3 className={styles.titulo}>¿Y si la próxima te sale más barata?</h3>
      <p className={styles.texto}>
        Con la membresía tienes descuento en todas tus compras, promociones exclusivas y precios
        de miembro en tenis y lavado por kilo. Los planes mensuales empiezan con 30 días gratis.
      </p>
      <Link to="/membresia" className={styles.cta}>
        Ver la membresía →
      </Link>
    </div>
  );
}
