import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Inicio from './pages/Inicio.jsx';
import Catalogo from './pages/Catalogo.jsx';
import Academy from './pages/Academy.jsx';
import Agendar from './pages/Agendar.jsx';
import AgendarConfirmacion from './pages/AgendarConfirmacion.jsx';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/catalogo" element={<Catalogo />} />
        <Route path="/academy" element={<Academy />} />
        <Route path="/agendar" element={<Agendar />} />
        <Route path="/agendar/confirmacion" element={<AgendarConfirmacion />} />
      </Routes>
    </Layout>
  );
}
