// MRP Tarimas — Panel Resumen (se renderiza dentro del layout MRP).
import React, { useState } from "react";
import { Boxes, Inbox, Recycle, Trash2 } from "lucide-react";
import {
  KpiCard,
  KpiGrid,
  SectionTitle,
  Card,
  TableScroll,
  Spinner,
  ErrorState,
  EmptyState,
} from "../../components/ui";
import {
  usePalletSummary,
  usePalletArticulos,
  useMrpWorkspace,
} from "../../hooks/mrp";
import { PALLET_LOCATION_LABELS } from "../../services/mrp";
import { ACCENT } from "../../styles/theme";
import { th, td } from "./components/mrpFormat";
import ArticuloSearchSelect from "./components/ArticuloSearchSelect";
import UbicacionDetalleModal from "./components/UbicacionDetalleModal";

const KPI_STYLE = { minHeight: 84, padding: 12, gap: 4, borderRadius: 16 };

export default function MRPDashboardPage() {
  const { warehouseId } = useMrpWorkspace();
  const [articuloId, setArticuloId] = useState("");
  const [ubic, setUbic] = useState(null); // { location, label }
  const { articulos } = usePalletArticulos({ warehouseId });
  const { summary, loading, error, refetch } = usePalletSummary({
    warehouseId,
    articuloId: articuloId || null,
  });

  return (
    <>
      <SectionTitle
        title="Resumen de artículos"
        action={
          articulos.length > 0 ? (
            <ArticuloSearchSelect
              articulos={articulos}
              value={articuloId}
              onChange={setArticuloId}
              size="md"
              maxWidth={520}
            />
          ) : undefined
        }
      />

      {loading ? (
        <Spinner label="Cargando resumen…" />
      ) : error ? (
        <ErrorState description={error.message} onRetry={refetch} />
      ) : (
        <>
          <KpiGrid min={150}>
            <KpiCard
              label="Total global"
              value={summary.totalGlobal}
              icon={Boxes}
              accent
              style={KPI_STYLE}
            />
            <KpiCard
              label="En pendiente"
              value={summary.totalPend}
              icon={Inbox}
              style={KPI_STYLE}
            />
            <KpiCard
              label="En merma"
              value={summary.totalMerma}
              icon={Recycle}
              style={KPI_STYLE}
            />
            <KpiCard
              label="Descartes"
              value={summary.totalDiscards}
              icon={Trash2}
              style={KPI_STYLE}
            />
          </KpiGrid>

          {/* Global por artículo */}
          <SectionTitle
            title="Global por artículo"
            hint="Suma de todas las ubicaciones operativas, incluida merma."
          />
          {summary.byArticulo.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title="Sin inventario"
              description="Aún no hay artículos con stock."
            />
          ) : (
            <Card padding={0}>
              <TableScroll minWidth={420}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Código</th>
                      <th style={th}>Artículo</th>
                      <th style={{ ...th, textAlign: "right" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.byArticulo.map((a) => (
                      <tr key={a.articulo_id}>
                        <td
                          style={{
                            ...td,
                            fontFamily: "monospace",
                            fontWeight: 950,
                          }}
                        >
                          {a.codigo}
                        </td>
                        <td style={td}>{a.nombre}</td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 950 }}>
                          {a.total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </Card>
          )}

          {/* Por ubicación */}
          <SectionTitle title="Por ubicación" />
          {summary.byLocation.length === 0 ? (
            <EmptyState title="Sin datos" description="No hay stock por ubicación." />
          ) : (
            <Card padding={0}>
              <TableScroll minWidth={360}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Ubicación</th>
                      <th style={{ ...th, textAlign: "right" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.byLocation
                      .slice()
                      .sort((a, b) => b.total - a.total)
                      .map((l) => {
                        const label =
                          PALLET_LOCATION_LABELS[l.location] || l.location;
                        return (
                          <tr
                            key={l.location}
                            onClick={() =>
                              setUbic({ location: l.location, label })
                            }
                            style={{ cursor: "pointer" }}
                            title="Ver detalle por artículo"
                          >
                            <td style={{ ...td, color: ACCENT, fontWeight: 900 }}>
                              {label}
                            </td>
                            <td style={{ ...td, textAlign: "right", fontWeight: 950 }}>
                              {l.total}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </TableScroll>
            </Card>
          )}
        </>
      )}

      {ubic && (
        <UbicacionDetalleModal
          open
          location={ubic.location}
          locationLabel={ubic.label}
          articuloId={articuloId || null}
          onClose={() => setUbic(null)}
        />
      )}
    </>
  );
}
