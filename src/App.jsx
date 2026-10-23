import { Analytics } from '@vercel/analytics/react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Inicio from './pages/Inicio.jsx';
import Catalogo from './pages/Catalogo.jsx';
import Academy from './pages/Academy.jsx';
import Cobertura from './pages/Cobertura.jsx';
import Agendar from './pages/Agendar.jsx';
import Membresia from './pages/Membresia.jsx';
import MembresiaGracias from './pages/MembresiaGracias.jsx';
import AgendarConfirmacion from './pages/AgendarConfirmacion.jsx';
import TarjetaRegalo from './pages/TarjetaRegalo.jsx';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/catalogo" element={<Catalogo />} />
        <Route path="/academy" element={<Academy />} />
        <Route path="/cobertura" element={<Cobertura />} />
        <Route path="/membresia" element={<Membresia />} />
        <Route path="/membresia/gracias" element={<MembresiaGracias />} />
        <Route path="/agendar" element={<Agendar />} />
        <Route path="/agendar/confirmacion" element={<AgendarConfirmacion />} />
        {/* La pantalla de gracias es la misma página: con ?id= muestra el
            código en vez del formulario. */}
        <Route path="/tarjeta-regalo" element={<TarjetaRegalo />} />
        <Route path="/tarjeta-regalo/gracias" element={<TarjetaRegalo />} />
      </Routes>
      <Analytics />
    </Layout>
  );
}
