import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";

import AuthProvider from "./auth/AuthProvider";
import RequireAuth from "./auth/RequireAuth";
import PrivateRoute from "./auth/PrivateRoute";
import RequireRole from "./auth/RequireRole";

import { ToastProvider, ConfirmProvider, CircleMenu, AssistantModal, FloatingChatButton, CommandPalette } from "./components/ui";

import Login from "./pages/Login";
import HomeHub from "./pages/HomeHub";
import AreasTrabajoHubPage from "./pages/AreasTrabajoHubPage";
import ReportHubPage from "./pages/ReportHubPage";
import ConfigRegionPage from "./pages/ConfigRegionPage";

//Documentacion
import DocumentacionPage from "./pages/Documentacion/DocumentacionPage";

//Despacho
import Despacho from "./pages/Despacho/Despacho";
import DespachoInProgressPage from "./pages/Despacho/DespachoInProgressPage";
import DespachoFinalizadosPage from "./pages/Despacho/DespachoFinalizadosPage";

//SaludOcupacional
import SSOHub from "./pages/SSO/Seguridad/S.S.OHub";
import ControlMarcas from "./pages/SSO/Seguridad/ControlMarcas/ControlMarcas";
import HistorialMarcas from "./pages/SSO/Seguridad/ControlMarcas/HistorialMarcas";
import Visados from "./pages/SSO/Seguridad/Visados/Visados";
import NuevoVisado from "./pages/SSO/Seguridad/Visados/NuevoVisado";
import AdministrarVisados from "./pages/SSO/Seguridad/Visados/AdministrarVisados";
import AdministrarAperturas from "./pages/SSO/Seguridad/Aperturas/AdministrarAperturas";
import AperturasFinalizadas from "./pages/SSO/Seguridad/Aperturas/AperturasFinalizadas";
import AperturaDetalle from "./pages/SSO/Seguridad/Aperturas/AperturaDetalle";
import AperturasRechazadas from "./pages/SSO/Seguridad/Aperturas/AperturasRechazdas";
import MetricaSaludOcupacional from "./pages/SSO/Seguridad/MetricaSaludOcupacional";

//Mantenimiento
import PanelEquiposMantenimiento from "./pages/Mantenimiento/Equipos/PanelEquiposMantenimiento";
import EquipoInfoPage from "./pages/Mantenimiento/Equipos/EquipoInfoPage";
import Mantenimiento from "./pages/Mantenimiento/Mantenimiento";
import OTsPage from "./pages/Mantenimiento/OTs/OTsPage";
import OTsHubMantenimiento from "./pages/Mantenimiento/OTs/OTsHubMantenimiento";
import OTsFinalizadasPage from "./pages/Mantenimiento/OTs/OTsFinalizadasPage";
import OTsDashboardPage from "./pages/Mantenimiento/OTs/OTsDashboardPage";
import OTsSolDetallePage from "./pages/Mantenimiento/OTs/OTsSolDetallePage";

//Recepcion
import Recepcion from "./pages/Recepcion/Recepcion";
import AccionDescarga from "./pages/Recepcion/AccionDescarga/AccionDescarga";
import AccionDetalle from "./pages/Recepcion/AccionDescarga/AccionDetalle";
import MetricaRecepcion from "./pages/Recepcion/MetricaRecepcion";

import OvertimeApprovals from "./pages/Administracion/Overtime/OvertimeApprovals";
import OvertimeManagerApprovals from "./pages/Administracion/Overtime/OvertimeManagerApprovals";
import OvertimeMonthlyReport from "./pages/Administracion/Overtime/OvertimeMonthlyReport";

import EPAHubPage from "./pages/EPA/EPAHubPage";
import AperturasFinalizadasEPA from "./pages/EPA/AperturasFinalizadasEPA";
import DevHub from "./pages/Dev/DevHub";
import UpdateSupabasePage from "./pages/Dev/UpdateSupabasePage";
import ModulesConfigHub from "./pages/Dev/ModulesConfigHub";
import OvertimeSettingsHub from "./pages/Administracion/Overtime/OvertimeSettingsHub";
import AdministracionHub from "./pages/Administracion/AdministracionHub";
import OvertimeUsersAdmin from "./pages/Administracion/Overtime/OvertimeUsersAdmin";
import AttendanceMarks from "./pages/Administracion/AttendanceMarks";
import UserHub from "./pages/Administracion/UserHub";
import ServiciosGenerales from "./pages/ServiciosGenerales/ServiciosGenerales";
import ServiciosGeneralesOrdenesTrabajo from "./pages/ServiciosGenerales/ServiciosGeneralesOrdenesTrabajo";
import ServiciosGeneralesOTCrear from "./pages/ServiciosGenerales/ServiciosGeneralesOTCrear";
import ServiciosGeneralesOTGestion from "./pages/ServiciosGenerales/ServiciosGeneralesOTGestion";
import ValidarIngreso from "./pages/ServiciosGenerales/ValidarIngreso";
import PesajeTarimas from "./pages/Zona Franca/PesajeTarimas";
import RegistrarTarimas from "./pages/Zona Franca/RegistrarTarimas";
import ConsultarTarimas from "./pages/Zona Franca/ConsultarTarimas";

// MRP Tarimas
import MRPTarimasPage from "./pages/MRP/MRPTarimasPage";
import MRPDashboardPage from "./pages/MRP/MRPDashboardPage";
import MRPInventarioPage from "./pages/MRP/MRPInventarioPage";
import MRPHistorialPage from "./pages/MRP/MRPHistorialPage";
import MRPDescartesPage from "./pages/MRP/MRPDescartesPage";
import MRPCatalogosPage from "./pages/MRP/MRPCatalogosPage";




/** Redirects legacy /salud/* paths to the renamed /seguridad/* routes. */
function SaludLegacyRedirect() {
  const location = useLocation();
  const target =
    location.pathname.replace(/^\/salud/, "/seguridad") + location.search;
  return <Navigate to={target} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
        <ConfirmProvider>
        <CircleMenu />
        <AssistantModal />
        <FloatingChatButton />
        <CommandPalette />
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

          {/* ================= Home (Welcome after login) ================= */}
          <Route
            path="/welcome"
            element={
              <PrivateRoute>
                <HomeHub />
              </PrivateRoute>
            }
          />

          {/* ================= Áreas de trabajo (main hub) ================= */}
          <Route
            path="/"
            element={
              <PrivateRoute>
                <AreasTrabajoHubPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/areas"
            element={
              <PrivateRoute>
                <AreasTrabajoHubPage />
              </PrivateRoute>
            }
          />

          {/* ================= Pesado (Zona Franca) ================= */}
          <Route
            path="/pesado"
            element={
              <PrivateRoute>
                <PesajeTarimas />
              </PrivateRoute>
            }
          />

          {/* ================= Reportes (hub) ================= */}
          <Route
            path="/reportes"
            element={
              <PrivateRoute>
                <ReportHubPage />
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

          {/* ================= Seguridad (SSO) ================= */}
          <Route
            path="/seguridad"
            element={
              <PrivateRoute>
                <SSOHub />
              </PrivateRoute>
            }
          />

          <Route
            path="/seguridad/control-marcas"
            element={
              <PrivateRoute>
                <ControlMarcas />
              </PrivateRoute>
            }
          />

          <Route
            path="/seguridad/control-marcas/historial"
            element={
              <PrivateRoute>
                <HistorialMarcas />
              </PrivateRoute>
            }
          />

          <Route
            path="/seguridad/aperturas"
            element={
              <PrivateRoute>
                <AdministrarAperturas />
              </PrivateRoute>
            }
          />

          <Route
            path="/seguridad/aperturas/finalizadas"
            element={
              <PrivateRoute>
                <AperturasFinalizadas />
              </PrivateRoute>
            }
          />

          <Route
            path="/seguridad/aperturas/detalle/:id"
            element={
              <PrivateRoute>
                <AperturaDetalle />
              </PrivateRoute>
            }
          />

          <Route
            path="/seguridad/aperturas/rechazadas"
            element={
              <PrivateRoute>
                <AperturasRechazadas />
              </PrivateRoute>
            }
          />

          <Route
            path="/seguridad/equipos"
            element={
              <PrivateRoute>
                <div>Revisión de equipos</div>
              </PrivateRoute>
            }
          />

          <Route
            path="/seguridad/visado"
            element={
              <PrivateRoute>
                <Visados />
              </PrivateRoute>
            }
          />

          <Route
            path="/seguridad/visado/generar"
            element={
              <PrivateRoute>
                <NuevoVisado />
              </PrivateRoute>
            }
          />

          <Route
            path="/seguridad/visados"
            element={
              <PrivateRoute>
                <AdministrarVisados />
              </PrivateRoute>
            }
          />

          <Route
            path="/seguridad/metricas"
            element={
              <PrivateRoute>
                <MetricaSaludOcupacional />
              </PrivateRoute>
            }
          />

          {/* Legacy redirects: /salud/* → /seguridad/* (bookmarks, pins) */}
          <Route path="/salud" element={<Navigate to="/seguridad" replace />} />
          <Route path="/salud/*" element={<SaludLegacyRedirect />} />

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

          {/* ================= Administración (solo role=admin o dev) ================= */}
          <Route
            path="/administracion"
            element={
              <PrivateRoute>
                <RequireRole roles={["administrativo", "dev"]}>
                  <AdministracionHub />
                </RequireRole>
              </PrivateRoute>
            }
          />

          {/* ================= Administración: Usuarios (solo dev) ================= */}
          <Route
            path="/administracion/usuarios"
            element={
              <PrivateRoute>
                <UserHub />
              </PrivateRoute>
            }
          />

          {/* ================= Dev (solo role=dev) ================= */}
          <Route
            path="/dev"
            element={
              <PrivateRoute>
                <DevHub />
              </PrivateRoute>
            }
          />
          <Route
            path="/dev/update-supabase"
            element={
              <PrivateRoute>
                <UpdateSupabasePage />
              </PrivateRoute>
            }
          />
          <Route
            path="/dev/config-modulos"
            element={
              <PrivateRoute>
                <ModulesConfigHub />
              </PrivateRoute>
            }
          />
          <Route
            path="/dev/config-modulos/horas-extra"
            element={
              <PrivateRoute>
                <OvertimeSettingsHub />
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

          <Route
            path="/servicios-generales/pesaje-tarimas"
            element={
              <PrivateRoute>
                <PesajeTarimas />
              </PrivateRoute>
            }
          />

          <Route
            path="/servicios-generales/pesaje-tarimas/registrar"
            element={
              <PrivateRoute>
                <RegistrarTarimas />
              </PrivateRoute>
            }
          />

          <Route
            path="/servicios-generales/pesaje-tarimas/consultar"
            element={
              <PrivateRoute>
                <ConsultarTarimas />
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
            path="/mantenimiento/ots/dashboard"
            element={
              <PrivateRoute>
                <OTsDashboardPage />
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

          {/* ================= MRP Tarimas ================= */}
          <Route
            path="/mrp-tarimas"
            element={
              <PrivateRoute>
                <MRPTarimasPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/mrp-tarimas/dashboard"
            element={
              <PrivateRoute>
                <MRPDashboardPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/mrp-tarimas/inventario"
            element={
              <PrivateRoute>
                <MRPInventarioPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/mrp-tarimas/movimientos"
            element={
              <PrivateRoute>
                <MRPHistorialPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/mrp-tarimas/descartes"
            element={
              <PrivateRoute>
                <MRPDescartesPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/mrp-tarimas/catalogos"
            element={
              <PrivateRoute>
                <MRPCatalogosPage />
              </PrivateRoute>
            }
          />

          {/* ================= Horas extra ================= */}
          <Route
            path="/horas-extra"
            element={
              <PrivateRoute>
                <RequireRole roles={["administrativo", "dev"]}>
                  <OvertimeApprovals />
                </RequireRole>
              </PrivateRoute>
            }
          />
          <Route
            path="/horas-extra/gerencia"
            element={
              <PrivateRoute>
                <RequireRole roles={["administrativo", "dev"]}>
                  <OvertimeManagerApprovals />
                </RequireRole>
              </PrivateRoute>
            }
          />
          <Route
            path="/horas-extra/reporte"
            element={
              <PrivateRoute>
                <RequireRole roles={["administrativo", "dev"]}>
                  <OvertimeMonthlyReport />
                </RequireRole>
              </PrivateRoute>
            }
          />
          <Route
            path="/horas-extra/usuarios"
            element={
              <PrivateRoute>
                <RequireRole roles={["administrativo", "dev"]}>
                  <OvertimeUsersAdmin />
                </RequireRole>
              </PrivateRoute>
            }
          />
          <Route
            path="/horas-extra/marcas"
            element={
              <PrivateRoute>
                <RequireRole roles={["administrativo", "dev"]}>
                  <AttendanceMarks />
                </RequireRole>
              </PrivateRoute>
            }
          />
        </Routes>
        </ConfirmProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

