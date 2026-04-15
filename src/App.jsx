import React, { useContext } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";

import AuthProvider from "./auth/AuthProvider";
import { AuthCtx } from "./auth/AuthProvider";
import RequireAuth from "./auth/RequireAuth";
import PrivateRoute from "./auth/PrivateRoute";

import Login from "./pages/Login";
import Home from "./pages/Home";
import ConfigRegionPage from "./pages/ConfigRegionPage";

//Documentacion
import DocumentacionPage from "./pages/Documentacion/DocumentacionPage";

//Despacho
import Despacho from "./pages/Despacho/Despacho";
import DespachoInProgressPage from "./pages/Despacho/DespachoInProgressPage";
import DespachoFinalizadosPage from "./pages/Despacho/DespachoFinalizadosPage";

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

import EPAHubPage from "./pages/EPA/EPAHubPage";
import AperturasFinalizadasEPA from "./pages/EPA/AperturasFinalizadasEPA";
import ServiciosGenerales from "./pages/ServiciosGenerales";
import ServiciosGeneralesOrdenesTrabajo from "./pages/ServiciosGeneralesOrdenesTrabajo";
import ServiciosGeneralesOTCrear from "./pages/ServiciosGeneralesOTCrear";
import ServiciosGeneralesOTGestion from "./pages/ServiciosGeneralesOTGestion";
import ValidarIngreso from "./pages/ServiciosGenerales/ValidarIngreso";
import useIsMobile from "./hooks/useIsMobile";

function TenantScopeBadge() {
  const { user, profile, loading } = useContext(AuthCtx);
  const location = useLocation();
  const isMobile = useIsMobile();

  if (location.pathname === "/login") return null;
  if (!user || loading) return null;

  const tenantId = String(profile?.tenantId || "").trim();
  const company = String(profile?.company || "").trim();
  const region =
    String(profile?.region || "").trim() ||
    String(profile?.regionId || "").trim() ||
    String(profile?.regionName || "").trim();

  const primary = tenantId || region || "Sin tenant";
  const secondary = company || (tenantId && region ? region : "");

  return (
    <div style={scopeBadge.wrap} role="status" aria-live="polite">
      <div style={scopeBadge.kicker}>Contexto actual</div>
      <div style={scopeBadge.primary}>{primary}</div>
      {!isMobile && !!secondary && <div style={scopeBadge.secondary}>{secondary}</div>}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TenantScopeBadge />
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

          {/* ================= Despacho ================= */}
          <Route
            path="/despacho"
            element={
              <PrivateRoute>
                <Despacho />
              </PrivateRoute>
            }
          />
          <Route
            path="/despacho/in-progress"
            element={
              <PrivateRoute>
                <DespachoInProgressPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/despacho/finalizados"
            element={
              <PrivateRoute>
                <DespachoFinalizadosPage />
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

          {/* ================= EPA ================= */}
          <Route
            path="/epa"
            element={
              <PrivateRoute>
                <EPAHubPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/epa/aperturas-finalizadas"
            element={
              <PrivateRoute>
                <AperturasFinalizadasEPA />
              </PrivateRoute>
            }
          />

          {/* ================= Rutas futuras generales ================= */}
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

const scopeBadge = {
  wrap: {
    position: "fixed",
    bottom: "max(10px, env(safe-area-inset-bottom))",
    right: 10,
    zIndex: 20000,
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.96) 100%)",
    color: "#0F172A",
    border: "1px solid rgba(15,23,42,0.10)",
    borderRadius: 14,
    padding: "8px 10px",
    display: "grid",
    gap: 2,
    pointerEvents: "none",
    boxShadow: "0 10px 22px rgba(15,23,42,0.13)",
    backdropFilter: "blur(4px)",
    maxWidth: "min(88vw, 320px)",
  },
  kicker: {
    fontSize: 10,
    fontWeight: 900,
    color: "#089F8A",
    letterSpacing: 0.35,
    textTransform: "uppercase",
  },
  primary: {
    fontSize: 12.5,
    fontWeight: 900,
    lineHeight: 1.25,
    color: "#0F172A",
  },
  secondary: {
    fontSize: 11.5,
    fontWeight: 800,
    color: "#64748B",
  },
};