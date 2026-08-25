// Feature: despachos-dev — pruebas de estados de UI de `DespachoBoardPage`.
//
// Pruebas de ejemplo (no property tests) con React Testing Library + jsdom que
// cubren los estados de interfaz de la página contenedora (Requirement 8):
//  - 8.1: estado de carga con esqueletos (`Skeleton`) mientras la consulta corre.
//  - 8.3: estado de error (`ErrorState`) con acción de reintento; el botón de
//    reintento invoca `reload` y el mensaje es en español sin detalle técnico.
//  - 8.4: estado vacío (`EmptyState`) cuando hay 0 despachos activos en scope.
//  - 8.5: mensaje de "sin resultados para el filtro", distinto del vacío general,
//    cuando los filtros dejan 0 resultados habiendo ≥1 despacho activo.
//  - 8.6: mensaje sin-permiso/sin-scope que no renderiza el listado ni datos y
//    no expone detalles técnicos.
//
// La página consume los datos vía los hooks `useDespachoData` y
// `useDespachoDetail`; se mockean para dirigir cada estado sin depender de
// Supabase. El scope/rol se provee mediante el contexto real `AuthCtx`.
// `useIsMobile` se mockea a `false` para renderizar el `KanbanBoard` de forma
// determinista (jsdom no implementa `matchMedia`). `recharts` se mockea con
// stubs livianos para evitar la carga perezosa asíncrona del mini-resumen.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { AuthCtx } from "../../../auth/AuthProvider";
import { buildMapaEstados } from "./lib/mapaEstados.js";

// --- Mocks de módulos --------------------------------------------------------

// Hook del listado: se controla su retorno por test con `mockReturnValue`.
vi.mock("./hooks/useDespachoData", () => ({
  useDespachoData: vi.fn(),
}));

// Hook del detalle: retorno neutro (el detalle no es el objeto de estas pruebas).
vi.mock("./hooks/useDespachoDetail", () => ({
  useDespachoDetail: vi.fn(() => ({
    despacho: null,
    chofer: null,
    choferError: null,
    historial: [],
    loading: false,
    error: null,
    realtimeStatus: "activo",
    reload: vi.fn(),
  })),
}));

// Responsividad determinista: siempre escritorio (kanban).
vi.mock("../../../hooks/useIsMobile", () => ({
  default: () => false,
}));

// Stubs livianos de recharts para el mini-resumen (evita medición/asincronía).
vi.mock("recharts", async () => {
  const React = await import("react");
  const Pass = ({ children }) => React.createElement("div", null, children);
  const Nothing = () => null;
  return {
    ResponsiveContainer: Pass,
    BarChart: Pass,
    Bar: Pass,
    XAxis: Nothing,
    YAxis: Nothing,
    Tooltip: Nothing,
    Cell: Nothing,
  };
});

import DespachoBoardPage from "./DespachoBoardPage.jsx";
import { useDespachoData } from "./hooks/useDespachoData";

// --- Datos de apoyo ----------------------------------------------------------

const catalogo = [
  { codigo: "creado", nombre: "Creado", orden: 1, es_final: false, es_activo: true },
  { codigo: "despachado", nombre: "Despachado", orden: 2, es_final: true, es_activo: true },
];

const mapaEstados = buildMapaEstados(catalogo);

const despachoActivo = {
  id: "d-1",
  tenant_id: "t1",
  company: "c1",
  bodega_id: "b1",
  referencia: "REF-100",
  tienda: "Tienda Uno",
  placa: "ABC-123",
  estado: "creado",
  chofer_id: null,
  tarimas_s: 2,
  tarimas_d: 3,
  fecha: "2024-05-01",
  created_at: "2024-05-01T10:00:00.000Z",
  updated_at: "2024-05-01T10:00:00.000Z",
  deleted_at: null,
};

// Retorno base del hook del listado; cada test sobrescribe lo relevante.
function hookState(overrides = {}) {
  return {
    catalogo,
    despachos: [],
    mapaEstados,
    loading: false,
    error: null,
    realtimeStatus: "activo",
    reload: vi.fn(),
    ...overrides,
  };
}

// Valor de contexto de un usuario con acceso completo (rol dev + scope).
const authConAcceso = {
  role: "dev",
  tenantId: "t1",
  company: "c1",
  bodegaId: "b1",
  loading: false,
};

function renderPage(authValue = authConAcceso) {
  return render(
    <MemoryRouter>
      <AuthCtx.Provider value={authValue}>
        <DespachoBoardPage />
      </AuthCtx.Provider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// --- Pruebas -----------------------------------------------------------------

describe("DespachoBoardPage — Requirement 8.1 (estado de carga)", () => {
  it("muestra los esqueletos de carga mientras la consulta inicial está en curso", () => {
    useDespachoData.mockReturnValue(
      hookState({ loading: true, despachos: [] }),
    );

    renderPage();

    // El contenedor de carga expone aria-busy y una etiqueta accesible.
    const loading = screen.getByLabelText(/cargando despachos/i);
    expect(loading).toBeInTheDocument();
    expect(loading).toHaveAttribute("aria-busy", "true");

    // No se muestra ni el listado ni los estados vacío/error.
    expect(screen.queryByText("REF-100")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/no existen despachos activos/i),
    ).not.toBeInTheDocument();
  });
});

describe("DespachoBoardPage — Requirement 8.3 (estado de error + reintento)", () => {
  it("muestra un mensaje de error en español y el botón de reintento invoca reload", async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    useDespachoData.mockReturnValue(
      hookState({
        loading: false,
        error: new Error("timeout técnico interno"),
        despachos: [],
        reload,
      }),
    );

    renderPage();

    // Mensaje en español, sin exponer el detalle técnico de la excepción.
    expect(
      screen.getByText(/no se pudieron cargar los despachos/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/timeout técnico interno/i)).not.toBeInTheDocument();

    // La acción de reintento invoca `reload`.
    const retry = screen.getByRole("button", { name: /reintentar/i });
    await user.click(retry);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("DespachoBoardPage — Requirement 8.4 (estado vacío)", () => {
  it("muestra el EmptyState cuando no hay despachos activos en el scope", () => {
    useDespachoData.mockReturnValue(
      hookState({ loading: false, error: null, despachos: [] }),
    );

    renderPage();

    expect(
      screen.getByText(/no existen despachos activos/i),
    ).toBeInTheDocument();
    // No es el mensaje de "sin resultados para el filtro".
    expect(
      screen.queryByText(/sin resultados para el filtro/i),
    ).not.toBeInTheDocument();
  });
});

describe("DespachoBoardPage — Requirement 8.5 (sin resultados por filtro)", () => {
  it("muestra el mensaje de 'sin resultados' distinto del vacío al filtrar todo fuera", async () => {
    const user = userEvent.setup();
    useDespachoData.mockReturnValue(
      hookState({
        loading: false,
        error: null,
        despachos: [despachoActivo],
      }),
    );

    renderPage();

    // Inicialmente el listado renderiza el despacho activo.
    expect(screen.getByText("REF-100")).toBeInTheDocument();

    // Se escribe un texto de búsqueda que ningún despacho satisface.
    const search = screen.getByPlaceholderText(/buscar por referencia/i);
    await user.type(search, "zzznomatch");

    // Aparece el mensaje distintivo de "sin resultados para el filtro"...
    expect(
      screen.getByText(/sin resultados para el filtro/i),
    ).toBeInTheDocument();
    // ...que ofrece una acción para limpiar filtros (además de la de FiltersBar)...
    expect(
      screen.getAllByRole("button", { name: /limpiar filtros/i }).length,
    ).toBeGreaterThanOrEqual(1);
    // ...y es distinto del estado vacío general.
    expect(
      screen.queryByText(/no existen despachos activos/i),
    ).not.toBeInTheDocument();
    // El listado ya no muestra el despacho.
    expect(screen.queryByText("REF-100")).not.toBeInTheDocument();
  });
});

describe("DespachoBoardPage — Requirement 8.6 (sin permiso/scope)", () => {
  it("muestra el mensaje de acceso no disponible cuando el rol no es dev", () => {
    useDespachoData.mockReturnValue(
      hookState({ loading: false, error: null, despachos: [despachoActivo] }),
    );

    renderPage({
      role: "administrativo",
      tenantId: "t1",
      company: "c1",
      bodegaId: "b1",
      loading: false,
    });

    expect(screen.getByText(/acceso no disponible/i)).toBeInTheDocument();
    // No se renderiza el listado ni los datos.
    expect(screen.queryByText("REF-100")).not.toBeInTheDocument();
  });

  it("muestra el mensaje de acceso no disponible cuando falta la bodega activa (scope)", () => {
    useDespachoData.mockReturnValue(
      hookState({ loading: false, error: null, despachos: [despachoActivo] }),
    );

    renderPage({
      role: "dev",
      tenantId: "t1",
      company: "c1",
      bodegaId: null,
      loading: false,
    });

    expect(screen.getByText(/acceso no disponible/i)).toBeInTheDocument();
    expect(screen.queryByText("REF-100")).not.toBeInTheDocument();
  });
});
