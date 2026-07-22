// MRP Tarimas — Historial de movimientos de artículos.
// Filtros por columna estilo Excel (dropdown con buscador), columnas
// reordenables por arrastre y paginación de 5 en 5.
import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, GripVertical, History } from "lucide-react";
import {
  Badge,
  Card,
  GhostButton,
  TableScroll,
  Spinner,
  ErrorState,
  EmptyState,
  SectionTitle,
} from "../../components/ui";
import { usePalletMovements, useMrpWorkspace } from "../../hooks/mrp";
import {
  PALLET_LOCATION_LABELS,
  PALLET_MOVEMENT_TYPE_LABELS,
} from "../../services/mrp";
import { th, td, fmtDate } from "./components/mrpFormat";
import { LocationBadge, MovementBadge } from "./components/mrpUi";
import ColumnFilter from "./components/ColumnFilter";
import { ACCENT, ACCENT_SOFT, SLATE } from "../../styles/theme";

const grip = {
  display: "inline-grid",
  placeItems: "center",
  color: SLATE,
  cursor: "grab",
  flexShrink: 0,
};
const thDropTarget = {
  boxShadow: `inset 2px 0 0 ${ACCENT}`,
  background: ACCENT_SOFT,
};

const PAGE_SIZE = 5;

// Etiqueta del movimiento (coherente con MovementBadge, incl. traslado de almacén).
const movementLabel = (m) => {
  if (m.movement_type === "traslado" && m.metadata?.cross_warehouse) {
    const dir =
      m.metadata.direction === "out"
        ? " · salida"
        : m.metadata.direction === "in"
        ? " · entrada"
        : "";
    return `Traslado de almacén${dir}`;
  }
  return PALLET_MOVEMENT_TYPE_LABELS[m.movement_type] || m.movement_type || "—";
};
const locLabel = (l) => (l ? PALLET_LOCATION_LABELS[l] || l : "—");

// Definición de columnas: value (clave del filtro) + label (texto visible) + render.
const COLS = [
  {
    key: "fecha",
    title: "Fecha",
    get: (m) => ({ value: fmtDate(m.created_at), label: fmtDate(m.created_at) }),
    render: (m) => fmtDate(m.created_at),
  },
  {
    key: "movimiento",
    title: "Movimiento",
    get: (m) => {
      const l = movementLabel(m);
      return { value: l, label: l };
    },
    render: (m) => <MovementBadge value={m.movement_type} metadata={m.metadata} />,
  },
  {
    key: "movcode",
    title: "ID movimiento",
    get: (m) => ({ value: m.movement_code || "—", label: m.movement_code || "—" }),
    render: (m) => (
      <span style={{ fontFamily: "monospace" }}>{m.movement_code}</span>
    ),
  },
  {
    key: "task",
    title: "ID tarea",
    get: (m) => ({
      value: m.task_id || "—",
      label: m.task_id ? m.task_id.slice(0, 8) : "—",
    }),
    render: (m) => (
      <span style={{ fontFamily: "monospace" }}>
        {m.task_id ? m.task_id.slice(0, 8) : "—"}
      </span>
    ),
  },
  {
    key: "articulo",
    title: "Artículo",
    get: (m) => {
      const v = `${m.articulo?.codigo || ""} · ${m.articulo?.nombre || ""}`;
      return { value: v, label: v };
    },
    render: (m) => (
      <>
        <span style={{ fontFamily: "monospace", fontWeight: 950 }}>
          {m.articulo?.codigo}
        </span>{" "}
        · {m.articulo?.nombre}
      </>
    ),
  },
  {
    key: "cantidad",
    title: "Cantidad",
    align: "right",
    get: (m) => ({ value: String(m.quantity), label: String(m.quantity) }),
    render: (m) => m.quantity,
  },
  {
    key: "origen",
    title: "Origen",
    get: (m) => ({
      value: m.origin_location || "∅",
      label: locLabel(m.origin_location),
    }),
    render: (m) => <LocationBadge value={m.origin_location} />,
  },
  {
    key: "destino",
    title: "Destino",
    get: (m) => ({
      value: m.destination_location || "∅",
      label: locLabel(m.destination_location),
    }),
    render: (m) => <LocationBadge value={m.destination_location} />,
  },
  {
    key: "motivo",
    title: "Motivo",
    get: (m) => ({ value: m.reason || "—", label: m.reason || "—" }),
    render: (m) => m.reason || "—",
  },
  {
    key: "usuario",
    title: "Usuario",
    get: (m) => {
      const v = m.user_email || m.user_id || "—";
      return { value: v, label: v };
    },
    render: (m) => m.user_email || m.user_id || "—",
  },
];

const ALL_KEYS = COLS.map((c) => c.key);
const ORDER_KEY = "appolo_mrp_hist_cols";

function loadColOrder() {
  try {
    const saved = JSON.parse(localStorage.getItem(ORDER_KEY) || "null");
    if (Array.isArray(saved)) {
      const valid = saved.filter((k) => ALL_KEYS.includes(k));
      const missing = ALL_KEYS.filter((k) => !valid.includes(k));
      return [...valid, ...missing];
    }
  } catch {
    /* orden por defecto */
  }
  return ALL_KEYS;
}

export default function MRPHistorialPage() {
  const [colFilters, setColFilters] = useState({}); // { [colKey]: string[] | undefined }
  const [colOrder, setColOrder] = useState(loadColOrder);
  const [dragKey, setDragKey] = useState(null);
  const [overKey, setOverKey] = useState(null);
  const [page, setPage] = useState(1);

  // Persiste el orden de columnas.
  useEffect(() => {
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(colOrder));
    } catch {
      /* almacenamiento no disponible */
    }
  }, [colOrder]);

  const orderedCols = useMemo(
    () => colOrder.map((k) => COLS.find((c) => c.key === k)).filter(Boolean),
    [colOrder]
  );

  const moveColumn = (from, to) => {
    if (!from || !to || from === to) return;
    setColOrder((prev) => {
      const arr = [...prev];
      const fromIdx = arr.indexOf(from);
      const toIdx = arr.indexOf(to);
      if (fromIdx < 0 || toIdx < 0) return prev;
      arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, from);
      return arr;
    });
  };

  const { warehouseId } = useMrpWorkspace();

  const filters = useMemo(
    () => (warehouseId ? { warehouseId } : {}),
    [warehouseId]
  );

  const { movements, loading, error, refetch } = usePalletMovements(filters);

  // Opciones de cada filtro de columna (valores distintos del set cargado).
  const optionsByCol = useMemo(() => {
    const map = {};
    COLS.forEach((c) => {
      const seen = new Map();
      movements.forEach((m) => {
        const { value, label } = c.get(m);
        if (!seen.has(value)) seen.set(value, label);
      });
      map[c.key] = [...seen.entries()]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label, "es"));
    });
    return map;
  }, [movements]);

  // Filas tras aplicar los filtros de columna (en memoria).
  const rows = useMemo(() => {
    const activeCols = COLS.filter((c) => Array.isArray(colFilters[c.key]));
    if (activeCols.length === 0) return movements;
    return movements.filter((m) =>
      activeCols.every((c) => colFilters[c.key].includes(c.get(m).value))
    );
  }, [movements, colFilters]);

  // Paginación (5 por página). `safePage` clampa si el set se achica.
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = useMemo(
    () => rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [rows, safePage]
  );

  return (
    <>
      <SectionTitle
        title="Historial de movimientos"
        action={<Badge tone="accent">Movimientos</Badge>}
      />

      <SectionTitle
        title="Movimientos"
        hint={!loading ? `${rows.length} resultado(s)` : undefined}
      />

      {loading ? (
        <Spinner label="Cargando historial…" />
      ) : error ? (
        <ErrorState description={error.message} onRetry={refetch} />
      ) : movements.length === 0 ? (
        <EmptyState
          icon={History}
          title="Sin movimientos"
          description="No hay movimientos con los filtros seleccionados."
        />
      ) : (
        <Card padding={0}>
          <TableScroll minWidth={1120}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {orderedCols.map((c) => (
                    <th
                      key={c.key}
                      style={{
                        ...th,
                        textAlign: c.align || "left",
                        ...(overKey === c.key && dragKey && dragKey !== c.key
                          ? thDropTarget
                          : {}),
                        ...(dragKey === c.key ? { opacity: 0.5 } : {}),
                      }}
                      onDragOver={(e) => {
                        if (!dragKey) return;
                        e.preventDefault();
                        if (overKey !== c.key) setOverKey(c.key);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        moveColumn(dragKey, c.key);
                        setDragKey(null);
                        setOverKey(null);
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          justifyContent:
                            c.align === "right" ? "flex-end" : "flex-start",
                        }}
                      >
                        <span
                          draggable
                          onDragStart={(e) => {
                            setDragKey(c.key);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => {
                            setDragKey(null);
                            setOverKey(null);
                          }}
                          style={grip}
                          title="Arrastrar para reordenar"
                          aria-label="Reordenar columna"
                        >
                          <GripVertical size={13} strokeWidth={2.2} />
                        </span>
                        {c.title}
                        <ColumnFilter
                          options={optionsByCol[c.key] || []}
                          selected={colFilters[c.key] ?? null}
                          onChange={(next) => {
                            setColFilters((f) => ({ ...f, [c.key]: next }));
                            setPage(1);
                          }}
                        />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      style={{ ...td, textAlign: "center" }}
                      colSpan={orderedCols.length}
                    >
                      Sin resultados para los filtros de columna.
                    </td>
                  </tr>
                ) : (
                  <>
                    {pageRows.map((m) => (
                      <tr key={m.id}>
                        {orderedCols.map((c) => (
                          <td
                            key={c.key}
                            style={{ ...td, textAlign: c.align || "left" }}
                          >
                            {c.render(m)}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {Array.from({
                      length: PAGE_SIZE - pageRows.length,
                    }).map((_, i) => (
                      <tr key={`filler-${i}`} aria-hidden="true">
                        <td style={fillerTd} colSpan={orderedCols.length}>
                          {" "}
                        </td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </TableScroll>

          {rows.length > 0 && (
            <div style={pager}>
              <span style={pagerInfo}>
                {(safePage - 1) * PAGE_SIZE + 1}–
                {Math.min(safePage * PAGE_SIZE, rows.length)} de {rows.length}
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
    </>
  );
}

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
