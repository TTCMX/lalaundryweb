import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import styles from './Layout.module.css';

const NAV_LINKS = [
  { to: '/', label: 'Inicio' },
  { to: '/catalogo', label: 'Catálogo' },
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
        <span className={styles.logoBadge}>LL</span>
        <span className={styles.logoText}>La Laundry</span>
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
        <NavLink to="/agendar" className={styles.footerLink}>
          Agendar
        </NavLink>
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
