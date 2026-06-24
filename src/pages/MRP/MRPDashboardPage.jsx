// MRP Tarimas — Resumen / Dashboard.
//
// Muestra totales globales por marca (incluye merma), por ubicación y por tipo,
// más tarjetas de merma, pend y descartes. Recordatorio visible: descartes NO es
// una ubicación operativa.
import React, { useState } from "react";
import { Boxes, Inbox, Recycle, Trash2 } from "lucide-react";
import {
  Shell,
  Topbar,
  Main,
  Container,
  Hero,
  Badge,
  Chip,
  ChipsRow,
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
  usePalletBrands,
  useMrpWorkspace,
} from "../../hooks/mrp";
import { PALLET_TYPE_LABELS, PALLET_LOCATION_LABELS } from "../../services/mrp";
import { th, td } from "./components/mrpFormat";
import { TypeBadge } from "./components/mrpUi";
import WorkspaceBar, { NoWarehouse } from "./components/WorkspaceBar";

export default function MRPDashboardPage() {
  const { warehouseId } = useMrpWorkspace();
  const [brandId, setBrandId] = useState("");
  const { brands } = usePalletBrands({ warehouseId });
  const { summary, loading, error, refetch } = usePalletSummary({
    warehouseId,
    brandId: brandId || null,
  });

  return (
    <Shell>
      <Topbar />
      <Main>
        <Container>
          <Hero
            kicker="MRP Tarimas"
            title="Resumen de tarimas"
            subtitle="Totales globales por marca, ubicación y tipo."
            badge={<Badge tone="accent">KPIs</Badge>}
          />

          <WorkspaceBar />

          {warehouseId && brands.length > 0 && (
            <ChipsRow>
              <Chip active={!brandId} onClick={() => setBrandId("")}>
                Todas las marcas
              </Chip>
              {brands.map((b) => (
                <Chip
                  key={b.id}
                  active={brandId === b.id}
                  onClick={() => setBrandId(b.id)}
                >
                  {b.name}
                </Chip>
              ))}
            </ChipsRow>
          )}

          {!warehouseId ? (
            <NoWarehouse />
          ) : loading ? (
            <Spinner label="Cargando resumen…" />
          ) : error ? (
            <ErrorState description={error.message} onRetry={refetch} />
          ) : (
            <>
              <KpiGrid>
                <KpiCard
                  label="Total global"
                  value={summary.totalGlobal}
                  hint="Todas las ubicaciones (incluye merma)"
                  icon={Boxes}
                  accent
                />
                <KpiCard
                  label="En pendiente"
                  value={summary.totalPend}
                  hint="Ubicación pend"
                  icon={Inbox}
                />
                <KpiCard
                  label="En merma"
                  value={summary.totalMerma}
                  hint="Ubicación operativa (cuenta en el global)"
                  icon={Recycle}
                />
                <KpiCard
                  label="Descartes"
                  value={summary.totalDiscards}
                  hint="Registro administrativo — NO es inventario"
                  icon={Trash2}
                />
              </KpiGrid>

              {/* Global por marca */}
              <SectionTitle
                title="Global por marca"
                hint="Suma de todas las ubicaciones operativas, incluida merma."
              />
              {summary.byBrand.length === 0 ? (
                <EmptyState
                  icon={Boxes}
                  title="Sin inventario"
                  description="Aún no hay tarimas registradas."
                />
              ) : (
                <Card padding={0}>
                  <TableScroll minWidth={360}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={th}>Marca</th>
                          <th style={{ ...th, textAlign: "right" }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.byBrand.map((b) => (
                          <tr key={b.brand_id}>
                            <td style={td}>{b.brand_name}</td>
                            <td style={{ ...td, textAlign: "right", fontWeight: 950 }}>
                              {b.total}
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
                <KpiGrid min={160}>
                  {summary.byLocation
                    .slice()
                    .sort((a, b) => b.total - a.total)
                    .map((l) => (
                      <KpiCard
                        key={l.location}
                        label={PALLET_LOCATION_LABELS[l.location] || l.location}
                        value={l.total}
                      />
                    ))}
                </KpiGrid>
              )}

              {/* Por tipo */}
              <SectionTitle title="Por tipo de tarima" />
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {summary.byType.length === 0 ? (
                  <EmptyState title="Sin datos" description="No hay stock por tipo." />
                ) : (
                  summary.byType.map((t) => (
                    <Card key={t.pallet_type}>
                      <div style={{ display: "grid", gap: 6, minWidth: 120 }}>
                        <TypeBadge value={t.pallet_type} />
                        <div style={{ fontSize: 26, fontWeight: 950 }}>{t.total}</div>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </>
          )}
        </Container>
      </Main>
    </Shell>
  );
}
