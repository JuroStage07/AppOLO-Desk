import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import AuthProvider from "./auth/AuthProvider";
import RequireAuth from "./auth/RequireAuth";
import PrivateRoute from "./auth/PrivateRoute";

import Login from "./pages/Login";
import Home from "./pages/Home";
import ConfigRegionPage from "./pages/ConfigRegionPage";

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
import OTsHubMantenimiento from "./pages/Mantenimiento/OTs/OTsHubMantenimiento";
import OTsFinalizadasPage from "./pages/Mantenimiento/OTs/OTsFinalizadasPage";
import OTsSolDetallePage from "./pages/Mantenimiento/OTs/OTsSolDetallePage";

//Recepcion
import Recepcion from "./pages/Recepcion/Recepcion";
import AccionDescarga from "./pages/Recepcion/AccionDescarga";
import AccionDetalle from "./pages/Recepcion/AccionDetalle";
import MetricaRecepcion from "./pages/Recepcion/MetricaRecepcion";

import ServiciosGenerales from "./pages/ServiciosGenerales";
import ServiciosGeneralesOrdenesTrabajo from "./pages/ServiciosGeneralesOrdenesTrabajo";
import ServiciosGeneralesOTCrear from "./pages/ServiciosGeneralesOTCrear";
import ServiciosGeneralesOTGestion from "./pages/ServiciosGeneralesOTGestion";
import ValidarIngreso from "./pages/ServiciosGenerales/ValidarIngreso";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Públicas */}
          <Route path="/login" element={<Login />} />

          {/* Requiere login pero NO tenant */}
          <Route
            path="/config-region"
            element={
              <RequireAuth>
                <ConfigRegionPage />
              </RequireAuth>
            }
          />

          {/* ================= Home ================= */}
          <Route
            path="/"
            element={
              <PrivateRoute>
                <Home />
              </PrivateRoute>
            }
          />

          {/* ================= Documentacion ================= */}
          <Route
            path="/documentacion"
            element={
              <PrivateRoute>
                <DocumentacionPage />
              </PrivateRoute>
            }
          />

          {/* ================= Salud Ocupacional ================= */}
          <Route
            path="/salud"
            element={
              <PrivateRoute>
                <SaludOcupacional />
              </PrivateRoute>
            }
          />

          <Route
            path="/salud/terceros"
            element={
              <PrivateRoute>
                <ControlTercerosManual />
              </PrivateRoute>
            }
          />

          <Route
            path="/salud/aperturas"
            element={
              <PrivateRoute>
                <AdministrarAperturas />
              </PrivateRoute>
            }
          />

          <Route
            path="/salud/aperturas/finalizadas"
            element={
              <PrivateRoute>
                <AperturasFinalizadas />
              </PrivateRoute>
            }
          />

          <Route
            path="/salud/aperturas/detalle/:id"
            element={
              <PrivateRoute>
                <AperturaDetalle />
              </PrivateRoute>
            }
          />

          <Route
            path="/salud/aperturas/rechazadas"
            element={
              <PrivateRoute>
                <AperturasRechazadas />
              </PrivateRoute>
            }
          />

          <Route
            path="/salud/equipos"
            element={
              <PrivateRoute>
                <div>Revisión de equipos</div>
              </PrivateRoute>
            }
          />

          <Route
            path="/salud/visado"
            element={
              <PrivateRoute>
                <Visados />
              </PrivateRoute>
            }
          />

          <Route
            path="/salud/visado/generar"
            element={
              <PrivateRoute>
                <NuevoVisado />
              </PrivateRoute>
            }
          />

          <Route
            path="/salud/visados"
            element={
              <PrivateRoute>
                <AdministrarVisados />
              </PrivateRoute>
            }
          />

          <Route
            path="/salud/metricas"
            element={
              <PrivateRoute>
                <MetricaSaludOcupacional />
              </PrivateRoute>
            }
          />

          {/* ================= Rutas futuras generales ================= */}
          <Route
            path="/despacho"
            element={
              <PrivateRoute>
                <div>Despacho</div>
              </PrivateRoute>
            }
          />

          <Route
            path="/servicios-generales"
            element={
              <PrivateRoute>
                <ServiciosGenerales />
              </PrivateRoute>
            }
          />

          <Route
            path="/servicios-generales/ordenes-trabajo"
            element={
              <PrivateRoute>
                <ServiciosGeneralesOrdenesTrabajo />
              </PrivateRoute>
            }
          />

          <Route
            path="/servicios-generales/ordenes-trabajo/crear"
            element={
              <PrivateRoute>
                <ServiciosGeneralesOTCrear />
              </PrivateRoute>
            }
          />

          <Route
            path="/servicios-generales/ordenes-trabajo/gestion"
            element={
              <PrivateRoute>
                <ServiciosGeneralesOTGestion />
              </PrivateRoute>
            }
          />

          <Route
            path="/servicios-generales/validar-ingreso"
            element={
              <PrivateRoute>
                <ValidarIngreso />
              </PrivateRoute>
            }
          />

          {/* ================= Recepción ================= */}
          <Route
            path="/recepcion"
            element={
              <PrivateRoute>
                <Recepcion />
              </PrivateRoute>
            }
          />

          <Route
            path="/recepcion/accion-descarga"
            element={
              <PrivateRoute>
                <AccionDescarga />
              </PrivateRoute>
            }
          />

          <Route
            path="/recepcion/accion-descarga/:accionId"
            element={
              <PrivateRoute>
                <AccionDetalle />
              </PrivateRoute>
            }
          />

          <Route
            path="/recepcion/metricas"
            element={
              <PrivateRoute>
                <MetricaRecepcion />
              </PrivateRoute>
            }
          />

          {/* ================= Mantenimiento ================= */}
          <Route
            path="/mantenimiento"
            element={
              <PrivateRoute>
                <Mantenimiento />
              </PrivateRoute>
            }
          />

          <Route
            path="/mantenimiento/equipos"
            element={
              <PrivateRoute>
                <PanelEquiposMantenimiento />
              </PrivateRoute>
            }
          />

          <Route
            path="/mantenimiento/equipos/:id"
            element={
              <PrivateRoute>
                <EquipoInfoPage />
              </PrivateRoute>
            }
          />

          <Route
            path="/mantenimiento/ots"
            element={
              <PrivateRoute>
                <OTsHubMantenimiento />
              </PrivateRoute>
            }
          />

          <Route
            path="/mantenimiento/ots/finalizadas"
            element={
              <PrivateRoute>
                <OTsFinalizadasPage />
              </PrivateRoute>
            }
          />

          <Route
            path="/mantenimiento/OTsPage"
            element={
              <PrivateRoute>
                <OTsPage />
              </PrivateRoute>
            }
          />

          <Route
            path="/mantenimiento/ots-solicitud/:id"
            element={
              <PrivateRoute>
                <OTsSolDetallePage />
              </PrivateRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}