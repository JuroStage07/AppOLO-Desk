// MRP Tarimas — tabla de datos reutilizable con la "misma lógica" del Historial:
//   • Filtros por columna estilo Excel (ColumnFilter, dropdown con buscador).
//   • Reordenamiento de columnas por arrastre (persistido por `storageKey`).
//   • Paginación con filas de relleno para altura constante.
//   • Primera columna FIJA (sticky) — excluida del scroll horizontal.
//
// Config de columna: { key, title, align?, filterable?, get(row)->{value,label},
//   render(row) }. Columnas de acciones: pásalas por `renderActions(row)` (van
//   fijas al final, sin filtro ni arrastre).
import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import { GhostButton, TableScroll } from "../../../components/ui";
import { ACCENT, ACCENT_SOFT, BORDER, SLATE, SURFACE } from "../../../styles/theme";
import { th, td } from "./mrpFormat";
import ColumnFilter from "./ColumnFilter";

const grip = {
  display: "inline-grid",
  placeItems: "center",
  color: SLATE,
  cursor: "grab",
  flexShrink: 0,
};
const thDropTarget = { boxShadow: `inset 2px 0 0 ${ACCENT}`, background: ACCENT_SOFT };

// Reconcilia una lista de claves guardada contra las columnas actuales:
// conserva las válidas en su orden y añade al final las que falten (columnas
// nuevas o dinámicas). Es pura → se usa en render y al reordenar (sin efectos).
function reconcile(keys, columns) {
  const colKeys = columns.map((c) => c.key);
  const valid = (keys || []).filter((k) => colKeys.includes(k));
  const missing = colKeys.filter((k) => !valid.includes(k));
  return [...valid, ...missing];
}

function loadOrder(storageKey, allKeys) {
  if (storageKey) {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (Array.isArray(saved)) return saved;
    } catch {
      /* orden por defecto */
    }
  }
  return allKeys;
}

export default function MrpDataTable({
  columns,
  rows,
  rowKey,
  storageKey,
  pageSize = 5,
  minWidth = 640,
  renderActions,
  actionsLabel = "Acciones",
  emptyFilterText = "Sin resultados para los filtros de columna.",
  stickyFirst = true,
}) {
  const allKeys = useMemo(() => columns.map((c) => c.key), [columns]);
  const [colOrder, setColOrder] = useState(() => loadOrder(storageKey, allKeys));
  const [dragKey, setDragKey] = useState(null);
  const [overKey, setOverKey] = useState(null);
  const [colFilters, setColFilters] = useState({});
  const [page, setPage] = useState(1);

  // Persiste el orden (localStorage es un sistema externo, no estado de React).
  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(colOrder));
    } catch {
      /* almacenamiento no disponible */
    }
  }, [storageKey, colOrder]);

  // El orden efectivo se reconcilia en render (no en un efecto) para tolerar
  // columnas dinámicas sin disparar renders en cascada.
  const orderedCols = useMemo(() => {
    const keys = reconcile(colOrder, columns);
    return keys.map((k) => columns.find((c) => c.key === k)).filter(Boolean);
  }, [colOrder, columns]);

  const moveColumn = (from, to) => {
    if (!from || !to || from === to) return;
    setColOrder((prev) => {
      const arr = reconcile(prev, columns);
      const fi = arr.indexOf(from);
      const ti = arr.indexOf(to);
      if (fi < 0 || ti < 0) return prev;
      arr.splice(fi, 1);
      arr.splice(ti, 0, from);
      return arr;
    });
  };

  const filterable = useMemo(
    () => columns.filter((c) => c.filterable !== false),
    [columns]
  );

  const optionsByCol = useMemo(() => {
    const map = {};
    filterable.forEach((c) => {
      const seen = new Map();
      rows.forEach((r) => {
        const { value, label } = c.get(r);
        if (!seen.has(value)) seen.set(value, label);
      });
      map[c.key] = [...seen.entries()]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => String(a.label).localeCompare(String(b.label), "es"));
    });
    return map;
  }, [filterable, rows]);

  const filtered = useMemo(() => {
    const active = filterable.filter((c) => Array.isArray(colFilters[c.key]));
    if (!active.length) return rows;
    return rows.filter((r) =>
      active.every((c) => colFilters[c.key].includes(c.get(r).value))
    );
  }, [rows, filterable, colFilters]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / (pageSize || 1)));
  const safePage = Math.min(page, pageCount);
  const pageRows = useMemo(
    () =>
      pageSize
        ? filtered.slice((safePage - 1) * pageSize, safePage * pageSize)
        : filtered,
    [filtered, safePage, pageSize]
  );

  const stickyCell = (i, header) =>
    stickyFirst && i === 0
      ? {
          position: "sticky",
          left: 0,
          zIndex: header ? 3 : 1,
          background: SURFACE,
          borderRight: `1px solid ${BORDER}`,
        }
      : null;

  const totalCols = orderedCols.length + (renderActions ? 1 : 0);

  return (
    <>
      <TableScroll minWidth={minWidth}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {orderedCols.map((c, i) => (
                <th
                  key={c.key}
                  style={{
                    ...th,
                    textAlign: c.align || "left",
                    ...(stickyCell(i, true) || {}),
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
                    {storageKey ? (
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
                    ) : null}
                    {c.title}
                    {c.filterable !== false ? (
                      <ColumnFilter
                        options={optionsByCol[c.key] || []}
                        selected={colFilters[c.key] ?? null}
                        onChange={(next) => {
                          setColFilters((f) => ({ ...f, [c.key]: next }));
                          setPage(1);
                        }}
                      />
                    ) : null}
                  </span>
                </th>
              ))}
              {renderActions ? (
                <th style={{ ...th, textAlign: "right" }}>{actionsLabel}</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td style={{ ...td, textAlign: "center" }} colSpan={totalCols}>
                  {emptyFilterText}
                </td>
              </tr>
            ) : (
              <>
                {pageRows.map((r) => (
                  <tr key={rowKey(r)}>
                    {orderedCols.map((c, i) => (
                      <td
                        key={c.key}
                        style={{
                          ...td,
                          textAlign: c.align || "left",
                          ...(stickyCell(i, false) || {}),
                        }}
                      >
                        {c.render(r)}
                      </td>
                    ))}
                    {renderActions ? (
                      <td style={{ ...td, textAlign: "right" }}>
                        {renderActions(r)}
                      </td>
                    ) : null}
                  </tr>
                ))}
                {pageSize
                  ? Array.from({ length: pageSize - pageRows.length }).map(
                      (_, i) => (
                        <tr key={`filler-${i}`} aria-hidden="true">
                          <td style={fillerTd} colSpan={totalCols}>
                            {" "}
                          </td>
                        </tr>
                      )
                    )
                  : null}
              </>
            )}
          </tbody>
        </table>
      </TableScroll>

      {pageSize && filtered.length > 0 ? (
        <div style={pager}>
          <span style={pagerInfo}>
            {(safePage - 1) * pageSize + 1}–
            {Math.min(safePage * pageSize, filtered.length)} de {filtered.length}
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
      ) : null}
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
const fillerTd = { ...td, height: 42, color: "transparent", userSelect: "none" };
