import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import styles from './Layout.module.css';

// El seguimiento vive en la app de operaciones, no en este sitio. El enlace
// es el mismo para todos: /miorden pide el teléfono y de ahí saca el pedido,
// así que no hay nada que personalizar ni que proteger en la URL.
const URL_MI_ORDEN = 'https://app.lalaundry.xyz/miorden';

const NAV_LINKS = [
  { to: '/', label: 'Inicio' },
  { to: '/catalogo', label: 'Catálogo' },
  { to: '/cobertura', label: 'Cobertura' },
  { to: '/membresia', label: 'Membresía' },
  { to: '/tarjeta-regalo', label: 'Tarjetas' },
  // Academy oculta temporalmente — se retoma más adelante.
];

function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <header className={styles.header}>
      <NavLink to="/" className={styles.logo}>
        <img src="/logo.png" alt="La Laundry" className={styles.logoImg} />
      </NavLink>

      <nav className={styles.nav}>
        {NAV_LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end
            className={({ isActive }) =>
              isActive ? `${styles.navLink} ${styles.active}` : styles.navLink
            }
          >
            {link.label}
          </NavLink>
        ))}
        <a href={URL_MI_ORDEN} className={styles.navSecundario}>
          Mi pedido
        </a>
        <NavLink to="/agendar" className={styles.navCta}>
          Agendar recolección
        </NavLink>
      </nav>

      <div className={styles.mobileActions}>
        <NavLink to="/agendar" className={styles.navCtaMobile}>
          Agendar
        </NavLink>
        <button
          type="button"
          className={styles.menuButton}
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className={styles.menuIcon} data-open={menuOpen} />
        </button>
      </div>

      {menuOpen && (
        <div className={styles.mobileMenu}>
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end
              className={({ isActive }) =>
                isActive ? `${styles.mobileMenuLink} ${styles.active}` : styles.mobileMenuLink
              }
            >
              {link.label}
            </NavLink>
          ))}
          <a href={URL_MI_ORDEN} className={styles.mobileMenuLink}>
            Mi pedido
          </a>
        </div>
      )}
    </header>
  );
}

function Footer() {
  return (
    <footer className={styles.footer}>
      <span className={styles.footerCopy}>
        © 2026 La Laundry — lavandería a domicilio.
      </span>
      <div className={styles.footerLinks}>
        <NavLink to="/catalogo" className={styles.footerLink}>
          Catálogo
        </NavLink>
        <NavLink to="/cobertura" className={styles.footerLink}>
          Cobertura
        </NavLink>
        <NavLink to="/membresia" className={styles.footerLink}>
          Membresía
        </NavLink>
        <NavLink to="/tarjeta-regalo" className={styles.footerLink}>
          Tarjetas de regalo
        </NavLink>
        <NavLink to="/agendar" className={styles.footerLink}>
          Agendar
        </NavLink>
        <a href={URL_MI_ORDEN} className={styles.footerLink}>
          Mi pedido
        </a>
      </div>
    </footer>
  );
}

export default function Layout({ children }) {
  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.main}>{children}</main>
      <Footer />
    </div>
  );
}
