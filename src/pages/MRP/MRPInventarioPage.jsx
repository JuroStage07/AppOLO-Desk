// MRP Tarimas — Panel Inventario (pivote por artículo + ubicación). Se renderiza
// dentro del layout MRP.
import React, { useMemo, useState } from "react";
import { Package, Plus, ArrowLeftRight } from "lucide-react";
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
import { ACCENT } from "../../styles/theme";
import { th, td } from "./components/mrpFormat";
import ArticuloSearchSelect from "./components/ArticuloSearchSelect";
import AjusteModal from "./components/AjusteModal";
import TrasladoModal from "./components/TrasladoModal";
import ArticuloHistorialModal from "./components/ArticuloHistorialModal";

const LOCATION_COLS = ["pend", "almacen", "patio", "reparacion", "merma", "tienda"];

export default function MRPInventarioPage() {
  const { warehouseId } = useMrpWorkspace();
  const [articuloId, setArticuloId] = useState("");

  const { articulos } = usePalletArticulos({ warehouseId });
  const { inventory, loading, error, refetch } = usePalletInventory({
    warehouseId,
    articuloId: articuloId || null,
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
    const list = articuloId
      ? articulos.filter((a) => a.id === articuloId)
      : articulos;
    return list.map((a) => {
      const cells = byArticulo.get(a.id) || {};
      let total = 0;
      const perLocation = {};
      for (const loc of LOCATION_COLS) {
        const q = cells[loc] || 0;
        perLocation[loc] = q;
        total += q;
      }
      return { id: a.id, codigo: a.codigo, nombre: a.nombre, perLocation, total };
    });
  }, [articulos, byArticulo, articuloId]);

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

      {/* Filtro de artículo (buscable) */}
      <ArticuloSearchSelect
        articulos={articulos}
        value={articuloId}
        onChange={setArticuloId}
        maxWidth={420}
      />

      <SectionTitle
        title="Existencias"
        hint={!loading ? `${rows.length} artículo(s)` : undefined}
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
          <TableScroll minWidth={920}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Artículo</th>
                  <th style={th}>Descripción</th>
                  {LOCATION_COLS.map((loc) => (
                    <th key={loc} style={{ ...th, textAlign: "right" }}>
                      {PALLET_LOCATION_LABELS[loc]}
                    </th>
                  ))}
                  <th style={{ ...th, textAlign: "right" }}>Total</th>
                  <th style={{ ...th, textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
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
                ))}
              </tbody>
            </table>
          </TableScroll>
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
