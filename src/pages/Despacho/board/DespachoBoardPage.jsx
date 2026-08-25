// Página contenedora "Despachos en progreso" (módulo Despacho).
//
// Orquesta los hooks de datos (`useDespachoData`) y de detalle
// (`useDespachoDetail`), la responsividad kanban ↔ acordeón (`useIsMobile(1023)`)
// y los estados de interfaz en español. Cablea `FiltersBar`,
// `KanbanBoard`/`AccordionGroups`, `DespachoDetailSheet` y `RealtimeIndicator`.
//
// El scope (`tenantId`, `company`, `bodegaId`) se deriva del perfil vía
// `AuthCtx` (AuthProvider no expone un hook `useAuth`; se consume el contexto
// directamente, igual que el resto de páginas Dev). Solo lectura: los hooks usan
// exclusivamente el cliente anónimo de Supabase; NUNCA la clave de servicio.
//
// Estados de interfaz:
//  - 8.1 Carga: esqueletos (`Skeleton`) mientras la consulta inicial está en curso.
//  - 8.2 Éxito: se reemplazan los esqueletos por el contenido.
//  - 8.3 Error: `ErrorState` con reintento que preserva los filtros aplicados.
//  - 8.4 Vacío (0 despachos activos en scope): `EmptyState`.
//  - 8.5 Sin resultados por filtros (≥1 activo): mensaje distinto del `EmptyState`
//    con acción para limpiar filtros.
//  - 8.6 Sin permiso/scope: mensaje en español sin renderizar el listado ni los
//    datos y sin exponer detalles técnicos.
//
// Responsividad (2.8): la conmutación kanban/acordeón es un render condicional
// sobre el mismo estado ya cargado (sin recarga), muy por debajo de 500ms.
//
// Colores/espaciados provienen exclusivamente de los tokens del tema.
//
// _Requirements: 2.8, 2.9, 2.10, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 9.3, 9.4_

import React, { useContext, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Boxes, Inbox, LayoutGrid, Lock, SearchX, SlidersHorizontal, Truck } from "lucide-react";
import {
  Shell,
  Topbar,
  Brand,
  GhostButton,
  PrimaryButton,
  Main,
  Container,
  Hero,
  SectionTitle,
  Badge,
  Card,
  KpiCard,
  KpiGrid,
  Skeleton,
  EmptyState,
  ErrorState,
  SecondaryButton,
  theme,
} from "../../../components/ui";
import { AuthCtx } from "../../../auth/AuthProvider";
import { canAccessByRoleOrPermission } from "../../../config/permissions";
import useIsMobile from "../../../hooks/useIsMobile";
import { useDespachoData } from "./hooks/useDespachoData";
import { useDespachoDetail } from "./hooks/useDespachoDetail";
import { filterDespachos, clearFilters } from "./lib/despachoFilters";
import FiltersBar from "./components/FiltersBar.jsx";
import KanbanBoard from "./components/KanbanBoard.jsx";
import AccordionGroups from "./components/AccordionGroups.jsx";
import DespachoDetailSheet from "./components/DespachoDetailSheet.jsx";
import RealtimeIndicator from "./components/RealtimeIndicator.jsx";
import CargasRealtimeModal from "./components/CargasRealtimeModal.jsx";

// Umbral de conmutación: kanban (≥ 1024px) vs acordeón (< 1024px).
const MOBILE_MAX_WIDTH = 1023;

/**
 * Esqueletos de carga para el listado (≤ 200ms tras iniciar la consulta).
 * (Requirement 8.1)
 */
function LoadingSkeletons() {
  return (
    <div style={styles.stack} aria-busy="true" aria-label="Cargando despachos">
      <Skeleton height={44} radius={theme.RADIUS_MD} />
      <Skeleton.Cards count={6} height={150} />
    </div>
  );
}

/**
 * Mensaje de sin-permiso/sin-scope. No renderiza el listado ni datos y no
 * expone detalles técnicos. (Requirement 8.6)
 */
function NoAccess() {
  return (
    <EmptyState
      center
      icon={Lock}
      title="Acceso no disponible"
      description="No tenés acceso a esta sección o tu perfil no tiene una bodega activa asignada. Contactá al administrador si creés que es un error."
    />
  );
}

/**
 * Mensaje de "sin resultados para el filtro": distinto del estado vacío general
 * y con acción para limpiar los filtros. (Requirement 8.5)
 */
function NoResults({ onClear }) {
  return (
    <div style={styles.noResults} role="status">
      <div style={styles.noResultsIcon}>
        <SearchX size={22} strokeWidth={2.2} color={theme.SLATE} aria-hidden="true" />
      </div>
      <div style={styles.noResultsTitle}>Sin resultados para el filtro</div>
      <div style={styles.noResultsText}>
        Ningún despacho coincide con los filtros aplicados. Ajustá la búsqueda o
        limpiá los filtros para ver todos los despachos.
      </div>
      <SecondaryButton size="sm" onClick={onClear}>
        Limpiar filtros
      </SecondaryButton>
    </div>
  );
}

/**
 * Página "Despachos Dev": listado de solo lectura agrupado por estado, con
 * filtros, detalle y actualización en tiempo real.
 */
export default function DespachoBoardPage() {
  const {
    role,
    permisos,
    profile,
    tenantId,
    company,
    bodegaId,
    loading: authLoading,
  } = useContext(AuthCtx) || {};

  // Permiso/scope del módulo Despacho: acceso por permiso `despacho` (o rol
  // admin), más presencia de scope (tenant + bodega activa). (8.6)
  const hasPermission = canAccessByRoleOrPermission(
    { role, permisos, profile },
    { anyPerms: ["despacho"] }
  );
  const hasScope = Boolean(tenantId && bodegaId);
  const hasAccess = hasPermission && hasScope;

  const nav = useNavigate();

  // Responsividad kanban ↔ acordeón sobre el mismo estado cargado (2.8).
  const isMobile = useIsMobile(MOBILE_MAX_WIDTH);

  // Estado de filtros (inicial: sin filtros). El reintento y la conmutación de
  // vista preservan estos filtros porque el estado persiste entre renders.
  const [filtros, setFiltros] = useState(() => clearFilters());

  // Despacho seleccionado para el Detalle (Sheet).
  const [selected, setSelected] = useState(null);

  // Modal de "Cargas en tiempo real".
  const [cargasOpen, setCargasOpen] = useState(false);

  // Datos del listado + realtime. Los filtros de scope se pasan siempre; los
  // hooks solo consultan con la clave anónima (nunca service role — 9.3/9.4).
  const {
    catalogo,
    despachos,
    mapaEstados,
    loading,
    error,
    realtimeStatus,
    reload,
  } = useDespachoData({ tenantId, company, bodegaId });

  // Datos del Detalle del despacho seleccionado (no consulta si no hay id).
  const detail = useDespachoDetail({
    despachoId: selected?.id ?? null,
    tenantId,
    company,
    bodegaId,
  });

  // Despachos visibles tras aplicar los filtros (derivado, sin efectos).
  const visibleDespachos = useMemo(
    () => filterDespachos(despachos, filtros),
    [despachos, filtros],
  );
  const visibleCount = visibleDespachos.length;

  // Hay al menos un despacho activo en scope (para distinguir vacío de
  // sin-resultados: 8.4 vs 8.5).
  const hasActive = despachos.length > 0;

  // Resumen compacto por estado (para la tira de KPIs). Conteo sobre el scope
  // completo, ordenado según el catálogo y con etiqueta/color del mapa de estados.
  const resumenEstados = useMemo(() => {
    const counts = {};
    for (const d of despachos) {
      const code = d?.estado;
      if (!code || code === "eliminado") continue;
      counts[code] = (counts[code] || 0) + 1;
    }
    const orden = Array.isArray(catalogo)
      ? catalogo.filter((e) => e?.codigo && e.codigo !== "eliminado")
      : [];
    return orden
      .filter((e) => counts[e.codigo])
      .map((e) => ({
        codigo: e.codigo,
        label: mapaEstados ? mapaEstados.label(e.codigo) : e.nombre || e.codigo,
        color: mapaEstados ? mapaEstados.color(e.codigo) : theme.SLATE,
        count: counts[e.codigo],
      }));
  }, [despachos, catalogo, mapaEstados]);

  function handleClearFilters() {
    setFiltros(clearFilters());
  }

  function handleCloseDetail() {
    setSelected(null);
  }

  // Cuerpo según el estado de la página. Se decide en un único punto para
  // mantener el orden de hooks estable (sin returns tempranos antes de hooks).
  let body;
  if (authLoading) {
    body = <LoadingSkeletons />;
  } else if (!hasAccess) {
    body = <NoAccess />;
  } else if (loading && !hasActive) {
    // Carga inicial sin datos previos (8.1).
    body = <LoadingSkeletons />;
  } else if (error) {
    // Error de consulta: reintento preservando filtros; sin detalles técnicos (8.3).
    body = (
      <ErrorState
        title="No se pudieron cargar los despachos"
        description="No se pudo completar la consulta. Revisá tu conexión e intentá nuevamente."
        onRetry={reload}
      />
    );
  } else if (!hasActive) {
    // 0 despachos activos en el scope del usuario (8.4).
    body = (
      <EmptyState
        center
        icon={Inbox}
        title="No existen despachos activos"
        description="Todavía no hay despachos activos en tu bodega. Aparecerán aquí en cuanto se registren."
      />
    );
  } else {
    // Contenido: KPIs + filtros (en panel) + listado (kanban/acordeón).
    body = (
      <div style={styles.stack}>
        {/* Tira de KPIs: total + conteo por estado (tokens del tema). */}
        <KpiGrid min={180}>
          <KpiCard
            label="Despachos"
            value={despachos.length}
            hint="En tu bodega"
            icon={Boxes}
            accent
          />
          {resumenEstados.map((r) => (
            <KpiCard
              key={r.codigo}
              label={r.label}
              value={r.count}
              icon={Truck}
              style={{ ...styles.kpiState, borderLeft: `4px solid ${r.color}` }}
            />
          ))}
        </KpiGrid>

        {/* Panel de filtros. */}
        <Card padding={theme.SPACE_4} style={styles.panel}>
          <div style={styles.panelHead}>
            <SlidersHorizontal size={16} strokeWidth={2.2} color={theme.SLATE} aria-hidden="true" />
            <span style={styles.panelTitle}>Filtros</span>
          </div>
          <FiltersBar
            filtros={filtros}
            onChange={setFiltros}
            catalogo={catalogo}
            mapaEstados={mapaEstados}
            visibleCount={visibleCount}
            visibleDespachos={visibleDespachos}
          />
        </Card>

        {/* Encabezado del tablero. */}
        <SectionTitle
          title="Despachos por estado"
          hint={
            isMobile
              ? "Tocá una tarjeta para ver el detalle."
              : "Cada columna se desplaza de forma independiente."
          }
          action={
            <Badge icon={LayoutGrid}>
              {visibleCount} visible{visibleCount === 1 ? "" : "s"}
            </Badge>
          }
        />

        {visibleCount === 0 ? (
          <NoResults onClear={handleClearFilters} />
        ) : isMobile ? (
          <AccordionGroups
            despachos={visibleDespachos}
            catalogo={catalogo}
            mapaEstados={mapaEstados}
            onSelect={setSelected}
          />
        ) : (
          <KanbanBoard
            despachos={visibleDespachos}
            catalogo={catalogo}
            mapaEstados={mapaEstados}
            onSelect={setSelected}
          />
        )}
      </div>
    );
  }

  // El indicador de realtime solo tiene sentido cuando el listado es visible.
  const showRealtime = hasAccess && !authLoading;

  return (
    <Shell>
      <Topbar>
        <Brand
          icon={Truck}
          title="Despachos en progreso"
          subtitle="Vista en tiempo real"
          onClick={() => nav("/despacho")}
        />
        <Topbar.Right>
          {hasAccess ? (
            <PrimaryButton icon={Boxes} onClick={() => setCargasOpen(true)}>
              Carga realtime
            </PrimaryButton>
          ) : null}
          <GhostButton icon={ArrowLeft} onClick={() => nav("/despacho")}>
            Volver
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container>
          <Hero
            kicker="Operación"
            title="Despachos en progreso"
            subtitle="Vista en tiempo real de los despachos de tu bodega, agrupados por estado."
            badge={
              showRealtime ? (
                <RealtimeIndicator status={realtimeStatus} />
              ) : (
                <Badge icon={Lock}>Solo lectura</Badge>
              )
            }
          />

          {body}
        </Container>
      </Main>

      {/* Detalle de solo lectura (Sheet). Se monta siempre; su visibilidad la
          controla `open` para permitir el retorno de foco al cerrar. */}
      <DespachoDetailSheet
        open={Boolean(selected)}
        onClose={handleCloseDetail}
        despacho={detail.despacho}
        chofer={detail.chofer}
        choferError={detail.choferError}
        historial={detail.historial}
        catalogo={catalogo}
        mapaEstados={mapaEstados}
        loading={detail.loading}
        error={detail.error}
        onReloadHistorial={detail.reload}
      />

      {/* Modal de cargas en tiempo real (grid de contenedor por despacho). */}
      <CargasRealtimeModal
        open={cargasOpen}
        onClose={() => setCargasOpen(false)}
        tenantId={tenantId}
        company={company}
        bodegaId={bodegaId}
        catalogo={catalogo}
        mapaEstados={mapaEstados}
      />
    </Shell>
  );
}

const styles = {
  stack: {
    display: "grid",
    gap: theme.SPACE_4,
  },
  kpiState: {
    minHeight: 104,
  },
  panel: {
    display: "grid",
    gap: theme.SPACE_3,
  },
  panelHead: {
    display: "flex",
    alignItems: "center",
    gap: theme.SPACE_2,
    paddingBottom: theme.SPACE_2,
    borderBottom: `1px solid ${theme.BORDER_SOFT}`,
  },
  panelTitle: {
    color: theme.TEXT,
    fontWeight: theme.FW_EXTRABOLD,
    fontSize: theme.FS_SM,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  noResults: {
    display: "grid",
    justifyItems: "center",
    textAlign: "center",
    gap: theme.SPACE_3,
    padding: `${theme.SPACE_10}px ${theme.SPACE_5}px`,
    borderRadius: theme.RADIUS_LG,
    border: `1px dashed ${theme.BORDER}`,
    background: theme.SURFACE_INSET,
  },
  noResultsIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.RADIUS,
    background: theme.SURFACE,
    border: `1px solid ${theme.BORDER}`,
    display: "grid",
    placeItems: "center",
  },
  noResultsTitle: {
    color: theme.TEXT,
    fontWeight: theme.FW_EXTRABOLD,
    fontSize: theme.FS_MD,
  },
  noResultsText: {
    color: theme.SLATE,
    fontWeight: theme.FW_MEDIUM,
    fontSize: theme.FS_SM,
    lineHeight: theme.LH_NORMAL,
    maxWidth: 420,
  },
};
