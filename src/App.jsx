import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import AuthProvider from "./auth/AuthProvider";
import RequireAuth from "./auth/RequireAuth";

import Login from "./pages/Login";
import Home from "./pages/Home";

//Documentacion
import DocumentacionPage from "./pages/Documentacion/DocumentacionPage";

//SaludOcupacional
import SaludOcupacional from "./pages/Salud Ocupacional/SaludOcupacional";
import ControlTercerosManual from "./pages/Salud Ocupacional/ControlTercerosManual";
import Visados from "./pages/Salud Ocupacional/Visados";
import NuevoVisado from "./pages/Salud Ocupacional/NuevoVisado";
import AdministrarVisados from "./pages/Salud Ocupacional/AdministrarVisados";
import AdministrarAperturas from "./pages/Salud Ocupacional/AdministrarAperturas";
import AperturasFinalizadas from "./pages/Salud Ocupacional/AperturasFinalizadas";
import AperturaDetalle from "./pages/Salud Ocupacional/AperturaDetalle";
import AperturasRechazadas from "./pages/Salud Ocupacional/AperturasRechazdas";
import MetricaSaludOcupacional from "./pages/Salud Ocupacional/MetricaSaludOcupacional";

//Mantenimiento
import PanelEquiposMantenimiento from "./pages/Mantenimiento/PanelEquiposMantenimiento";
import EquipoInfoPage from "./pages/Mantenimiento/EquipoInfoPage";
import Mantenimiento from "./pages/Mantenimiento/Mantenimiento";
import OTsPage from "./pages/Mantenimiento/OTs/OTsPage";
import OTsDetallePage from "./pages/Mantenimiento/OTs/OTsDetallePage";

//Recepcion
import Recepcion from "./pages/Recepcion/Recepcion";
import AccionDescarga from "./pages/Recepcion/AccionDescarga";
import AccionDetalle from "./pages/Recepcion/AccionDetalle";
import MetricaRecepcion from "./pages/Recepcion/MetricaRecepcion";


export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/"
            element={
              <RequireAuth>
                <Home />
              </RequireAuth>
            }
          />

          {/* ================= Documentacion ================= */}
          <Route
            path="/documentacion"
            element={
              <RequireAuth>
                <DocumentacionPage />
              </RequireAuth>
            }
          />

          {/* ================= Salud Ocupacional ================= */}
          <Route
            path="/salud"
            element={
              <RequireAuth>
                <SaludOcupacional />
              </RequireAuth>
            }
          />

          <Route
            path="/salud/terceros"
            element={
              <RequireAuth>
                <ControlTercerosManual />
              </RequireAuth>
            }
          />

          <Route
            path="/salud/aperturas"
            element={
              <RequireAuth>
                <AdministrarAperturas />
              </RequireAuth>
            }
          />

          <Route
            path="/salud/aperturas/finalizadas"
            element={
              <RequireAuth>
                <AperturasFinalizadas />
              </RequireAuth>
            }
          />

          <Route
            path="/salud/aperturas/detalle/:id"
            element={
              <RequireAuth>
                <AperturaDetalle />
              </RequireAuth>
            }
          />

          <Route
            path="/salud/aperturas/rechazadas"
            element={
              <RequireAuth>
                <AperturasRechazadas />
              </RequireAuth>
            }
          />

          <Route
            path="/salud/equipos"
            element={
              <RequireAuth>
                <div>Revisión de equipos</div>
              </RequireAuth>
            }
          />

          {/* Menú Visados (Generar / Administrar) */}
          <Route
            path="/salud/visado"
            element={
              <RequireAuth>
                <Visados />
              </RequireAuth>
            }
          />

          {/* Generar visado */}
          <Route
            path="/salud/visado/generar"
            element={
              <RequireAuth>
                <NuevoVisado />
              </RequireAuth>
            }
          />

          {/* Administrar visados */}
          <Route
            path="/salud/visados"
            element={
              <RequireAuth>
                <AdministrarVisados />
              </RequireAuth>
            }
          />

          <Route path="/salud/metricas" element={<MetricaSaludOcupacional />} />

          {/* ================= Rutas futuras generales ================= */}
          <Route
            path="/despacho"
            element={
              <RequireAuth>
                <div>Despacho</div>
              </RequireAuth>
            }
          />

          {/* ================= Recepción ================= */}
          <Route
            path="/recepcion"
            element={
              <RequireAuth>
                <Recepcion />
              </RequireAuth>
            }
          />

          <Route
            path="/recepcion/accion-descarga"
            element={
              <RequireAuth>
                <AccionDescarga />
              </RequireAuth>
            }
          />

          {/* ✅ NUEVA RUTA: detalle de acción */}
          <Route
            path="/recepcion/accion-descarga/:accionId"
            element={
              <RequireAuth>
                <AccionDetalle />
              </RequireAuth>
            }
          />

          <Route
            path="/recepcion/metricas"
            element={
              <RequireAuth>
                <MetricaRecepcion />
              </RequireAuth>
            }
          />

          {/* ================= Mantenimiento ================= */}
          <Route
            path="/mantenimiento"
            element={
              <RequireAuth>
                <Mantenimiento />
              </RequireAuth>
            }
          />

          <Route
            path="/mantenimiento/equipos"
            element={
              <RequireAuth>
                <PanelEquiposMantenimiento />
              </RequireAuth>
            }
          />

          <Route
            path="/mantenimiento/equipos/:id"
            element={
              <RequireAuth>
                <EquipoInfoPage />
              </RequireAuth>
            }
          />

          <Route
            path="/mantenimiento/OTsPage"
            element={
              <RequireAuth>
                <OTsPage />
              </RequireAuth>
            }
          />

          <Route
            path="/mantenimiento/OTsPageDetalle"
            element={
              <RequireAuth>
                <OTsDetallePage />
              </RequireAuth>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}