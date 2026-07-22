// MRP Tarimas — Panel Inventario (pivote por artículo + ubicación). Se renderiza
// dentro del layout MRP.
import React, { useMemo, useState } from "react";
import {
  Package,
  Plus,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  Card,
  PrimaryButton,
  SecondaryButton,
  GhostButton,
  TableScroll,
  Spinner,
  ErrorState,
  EmptyState,
  SectionTitle,
} from "../../components/ui";
import {
  usePalletInventory,
  usePalletArticulos,
  useMrpWorkspace,
} from "../../hooks/mrp";
import { PALLET_LOCATION_LABELS } from "../../services/mrp";
import { ACCENT, ACCENT_SOFT, SLATE } from "../../styles/theme";
import { th, td } from "./components/mrpFormat";
import ColumnFilter from "./components/ColumnFilter";
import AjusteModal from "./components/AjusteModal";
import TrasladoModal from "./components/TrasladoModal";
import ArticuloHistorialModal from "./components/ArticuloHistorialModal";

const LOCATION_COLS = ["pend", "almacen", "patio", "reparacion", "merma", "tienda"];
const PAGE_SIZE = 5;

// Columnas filtrables (estilo Excel). Acciones no se filtra.
const FILTER_COLS = [
  { key: "codigo", get: (r) => r.codigo || "—" },
  { key: "nombre", get: (r) => r.nombre || "—" },
  { key: "cliente", get: (r) => r.cliente?.nombre || "—" },
  ...LOCATION_COLS.map((loc) => ({
    key: `loc_${loc}`,
    numeric: true,
    get: (r) => String(r.perLocation[loc] || 0),
  })),
  { key: "total", numeric: true, get: (r) => String(r.total) },
];

export default function MRPInventarioPage() {
  const { warehouseId } = useMrpWorkspace();

  const { articulos } = usePalletArticulos({ warehouseId });
  const { inventory, loading, error, refetch } = usePalletInventory({
    warehouseId,
    articuloId: null,
    onlyWithStock: false,
  });

  const byArticulo = useMemo(() => {
    const m = new Map();
    for (const r of inventory) {
      const cell = m.get(r.articulo_id) || {};
      cell[r.location] = (cell[r.location] || 0) + (Number(r.quantity) || 0);
      m.set(r.articulo_id, cell);
    }
    return m;
  }, [inventory]);

  const rows = useMemo(() => {
    return articulos.map((a) => {
      const cells = byArticulo.get(a.id) || {};
      let total = 0;
      const perLocation = {};
      for (const loc of LOCATION_COLS) {
        const q = cells[loc] || 0;
        perLocation[loc] = q;
        total += q;
      }
      return {
        id: a.id,
        codigo: a.codigo,
        nombre: a.nombre,
        cliente: a.cliente || null,
        perLocation,
        total,
      };
    });
  }, [articulos, byArticulo]);

  // Filtros por columna (estilo Excel).
  const [colFilters, setColFilters] = useState({}); // { [colKey]: string[] | undefined }
  const [page, setPage] = useState(1);

  const optionsByCol = useMemo(() => {
    const map = {};
    FILTER_COLS.forEach((c) => {
      const seen = new Set();
      rows.forEach((r) => seen.add(c.get(r)));
      const opts = [...seen].map((v) => ({ value: v, label: v }));
      opts.sort((a, b) =>
        c.numeric
          ? Number(a.value) - Number(b.value)
          : a.label.localeCompare(b.label, "es")
      );
      map[c.key] = opts;
    });
    return map;
  }, [rows]);

  const visibleRows = useMemo(() => {
    const active = FILTER_COLS.filter((c) => Array.isArray(colFilters[c.key]));
    if (active.length === 0) return rows;
    return rows.filter((r) =>
      active.every((c) => colFilters[c.key].includes(c.get(r)))
    );
  }, [rows, colFilters]);

  const headerFilter = (colKey) => (
    <ColumnFilter
      options={optionsByCol[colKey] || []}
      selected={colFilters[colKey] ?? null}
      onChange={(next) => {
        setColFilters((f) => ({ ...f, [colKey]: next }));
        setPage(1);
      }}
    />
  );

  // Paginación (5 por página). `safePage` clampa si el set se achica.
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = useMemo(
    () => visibleRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [visibleRows, safePage]
  );

  const [ajuste, setAjuste] = useState({ open: false, prefill: null });
  const [traslado, setTraslado] = useState({ open: false, prefill: null });
  const [historial, setHistorial] = useState(null);
  const openAjuste = (prefill = null) => setAjuste({ open: true, prefill });
  const openTraslado = (prefill = null) => setTraslado({ open: true, prefill });

  return (
    <>
      <SectionTitle
        title="Inventario de artículos"
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <PrimaryButton icon={Plus} onClick={() => openAjuste()}>
              Ajuste
            </PrimaryButton>
            <SecondaryButton icon={ArrowLeftRight} onClick={() => openTraslado()}>
              Traslado
            </SecondaryButton>
          </div>
        }
      />

      <SectionTitle
        title="Existencias"
        hint={!loading ? `${visibleRows.length} artículo(s)` : undefined}
      />

      {loading ? (
        <Spinner label="Cargando inventario…" />
      ) : error ? (
        <ErrorState description={error.message} onRetry={refetch} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Sin artículos"
          description="Crea artículos en Catálogos › Artículos y registra ajustes."
          action={
            <PrimaryButton icon={Plus} onClick={() => openAjuste()}>
              Registrar ajuste
            </PrimaryButton>
          }
        />
      ) : (
        <Card padding={0}>
          <TableScroll minWidth={1060}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>
                    <span style={hCell}>
                      Artículo
                      {headerFilter("codigo")}
                    </span>
                  </th>
                  <th style={th}>
                    <span style={hCell}>
                      Descripción
                      {headerFilter("nombre")}
                    </span>
                  </th>
                  <th style={th}>
                    <span style={hCell}>
                      Cliente
                      {headerFilter("cliente")}
                    </span>
                  </th>
                  {LOCATION_COLS.map((loc) => (
                    <th key={loc} style={{ ...th, textAlign: "right" }}>
                      <span style={hCellRight}>
                        {PALLET_LOCATION_LABELS[loc]}
                        {headerFilter(`loc_${loc}`)}
                      </span>
                    </th>
                  ))}
                  <th style={{ ...th, textAlign: "right" }}>
                    <span style={hCellRight}>
                      Total
                      {headerFilter("total")}
                    </span>
                  </th>
                  <th style={{ ...th, textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.length === 0 ? (
                  <tr>
                    <td
                      style={{ ...td, textAlign: "center" }}
                      colSpan={LOCATION_COLS.length + 5}
                    >
                      Sin resultados para los filtros de columna.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((r) => (
                  <tr key={r.id}>
                    <td style={td}>
                      <button
                        type="button"
                        onClick={() =>
                          setHistorial({
                            id: r.id,
                            codigo: r.codigo,
                            nombre: r.nombre,
                          })
                        }
                        title="Ver historial del artículo"
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                          fontFamily: "monospace",
                          fontWeight: 950,
                          fontSize: 13,
                          color: ACCENT,
                          textDecoration: "underline",
                        }}
                      >
                        {r.codigo}
                      </button>
                    </td>
                    <td style={td}>{r.nombre}</td>
                    <td style={td}>
                      {r.cliente ? (
                        <span
                          style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}
                        >
                          <span style={{ fontWeight: 850 }}>{r.cliente.nombre}</span>
                          <span
                            style={{ fontFamily: "monospace", fontSize: 11, color: SLATE }}
                          >
                            {r.cliente.codigo}
                          </span>
                        </span>
                      ) : (
                        <span style={{ color: SLATE, fontWeight: 800 }}>—</span>
                      )}
                    </td>
                    {LOCATION_COLS.map((loc) => (
                      <td key={loc} style={{ ...td, textAlign: "right" }}>
                        {r.perLocation[loc] || 0}
                      </td>
                    ))}
                    <td style={{ ...td, textAlign: "right", fontWeight: 950 }}>
                      {r.total}
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <div
                        style={{
                          display: "inline-flex",
                          gap: 6,
                          justifyContent: "flex-end",
                        }}
                      >
                        <GhostButton
                          size="sm"
                          icon={ArrowLeftRight}
                          disabled={r.total === 0}
                          title={
                            r.total === 0
                              ? "Sin existencias para trasladar"
                              : undefined
                          }
                          onClick={() => openTraslado({ articuloId: r.id })}
                        >
                          Trasladar
                        </GhostButton>
                        <GhostButton
                          size="sm"
                          icon={Plus}
                          onClick={() => openAjuste({ articuloId: r.id })}
                        >
                          Ajustar
                        </GhostButton>
                      </div>
                    </td>
                  </tr>
                  ))
                )}
                {visibleRows.length > 0 &&
                  Array.from({ length: PAGE_SIZE - pageRows.length }).map(
                    (_, i) => (
                      <tr key={`filler-${i}`} aria-hidden="true">
                        <td style={fillerTd} colSpan={LOCATION_COLS.length + 5}>
                          {" "}
                        </td>
                      </tr>
                    )
                  )}
              </tbody>
            </table>
          </TableScroll>

          {visibleRows.length > 0 && (
            <div style={pager}>
              <span style={pagerInfo}>
                {(safePage - 1) * PAGE_SIZE + 1}–
                {Math.min(safePage * PAGE_SIZE, visibleRows.length)} de{" "}
                {visibleRows.length}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <GhostButton
                  icon={ChevronLeft}
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </GhostButton>
                <span style={pagerInfo}>
                  Página {safePage} de {pageCount}
                </span>
                <GhostButton
                  disabled={safePage >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                >
                  Siguiente
                  <ChevronRight size={16} strokeWidth={2.2} />
                </GhostButton>
              </div>
            </div>
          )}
        </Card>
      )}

      <AjusteModal
        open={ajuste.open}
        prefill={ajuste.prefill}
        onClose={() => setAjuste({ open: false, prefill: null })}
      />
      <TrasladoModal
        open={traslado.open}
        prefill={traslado.prefill}
        onClose={() => setTraslado({ open: false, prefill: null })}
      />
      {historial && (
        <ArticuloHistorialModal
          open
          articuloId={historial.id}
          codigo={historial.codigo}
          nombre={historial.nombre}
          onClose={() => setHistorial(null)}
          onAjuste={(id) => {
            setHistorial(null);
            openAjuste({ articuloId: id });
          }}
          onTraslado={(id) => {
            setHistorial(null);
            openTraslado({ articuloId: id });
          }}
        />
      )}
    </>
  );
}

const hCell = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  justifyContent: "flex-start",
};
const hCellRight = { ...hCell, justifyContent: "flex-end" };

const pager = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  padding: "12px 16px",
  borderTop: `1px solid ${ACCENT_SOFT}`,
};
const pagerInfo = { fontSize: 12.5, fontWeight: 800, color: SLATE };
// Fila de relleno: mantiene la altura de la tabla constante entre páginas.
const fillerTd = { ...td, height: 42, color: "transparent", userSelect: "none" };
