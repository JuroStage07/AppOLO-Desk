// MRP Tarimas — Descartes (registro administrativo de ajustes negativos).
//
// IMPORTANTE: esta vista NO es inventario y NO debe mezclarse con merma. Solo
// muestra los descartes administrativos generados por ajustes negativos.
import React, { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  Shell,
  Topbar,
  Main,
  Container,
  Hero,
  Badge,
  Card,
  Field,
  GhostButton,
  TableScroll,
  Spinner,
  ErrorState,
  EmptyState,
  SectionTitle,
} from "../../components/ui";
import {
  usePalletDiscards,
  usePalletBrands,
  useMrpWorkspace,
} from "../../hooks/mrp";
import { PALLET_TYPES, PALLET_TYPE_LABELS } from "../../services/mrp";
import { th, td, filtersRow, fmtDate } from "./components/mrpFormat";
import { TypeBadge } from "./components/mrpUi";
import WorkspaceBar, { NoWarehouse } from "./components/WorkspaceBar";

const EMPTY = {
  brandId: "",
  palletType: "",
  userEmail: "",
  dateFrom: "",
  dateTo: "",
};

export default function MRPDescartesPage() {
  const [raw, setRaw] = useState(EMPTY);
  const set = (k, v) => setRaw((f) => ({ ...f, [k]: v }));

  const { warehouseId } = useMrpWorkspace();
  const { brands } = usePalletBrands({ warehouseId });

  const filters = useMemo(() => {
    const f = {};
    if (warehouseId) f.warehouseId = warehouseId;
    if (raw.brandId) f.brandId = raw.brandId;
    if (raw.palletType) f.palletType = raw.palletType;
    if (raw.userEmail.trim()) f.userEmail = raw.userEmail.trim();
    if (raw.dateFrom) f.dateFrom = `${raw.dateFrom}T00:00:00`;
    if (raw.dateTo) f.dateTo = `${raw.dateTo}T23:59:59`;
    return f;
  }, [raw, warehouseId]);

  const { discards, loading, error, refetch } = usePalletDiscards(filters);

  return (
    <Shell>
      <Topbar />
      <Main>
        <Container>
          <Hero
            kicker="MRP Tarimas"
            title="Descartes"
            subtitle="Registro administrativo de ajustes negativos."
            badge={<Badge tone="dark">Administrativo</Badge>}
          />

          <WorkspaceBar />

          {!warehouseId && <NoWarehouse />}

          {warehouseId && (
          <>
          <Card tone="accent">
            <div style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.5 }}>
              Los descartes son un registro administrativo. <b>No son inventario</b> y{" "}
              <b>no se mezclan con la ubicación merma</b>.
            </div>
          </Card>

          {/* Filtros */}
          <Card>
            <div style={filtersRow}>
              <Field label="Marca">
                <Field.Select
                  value={raw.brandId}
                  onChange={(e) => set("brandId", e.target.value)}
                >
                  <option value="">Todas</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Field.Select>
              </Field>
              <Field label="Tipo">
                <Field.Select
                  value={raw.palletType}
                  onChange={(e) => set("palletType", e.target.value)}
                >
                  <option value="">Todos</option>
                  {PALLET_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {PALLET_TYPE_LABELS[t]}
                    </option>
                  ))}
                </Field.Select>
              </Field>
              <Field label="Usuario (email)">
                <Field.Input
                  value={raw.userEmail}
                  onChange={(e) => set("userEmail", e.target.value)}
                  placeholder="correo…"
                />
              </Field>
              <Field label="Desde">
                <Field.Input
                  type="date"
                  value={raw.dateFrom}
                  onChange={(e) => set("dateFrom", e.target.value)}
                />
              </Field>
              <Field label="Hasta">
                <Field.Input
                  type="date"
                  value={raw.dateTo}
                  onChange={(e) => set("dateTo", e.target.value)}
                />
              </Field>
            </div>
            <div style={{ marginTop: 12 }}>
              <GhostButton onClick={() => setRaw(EMPTY)}>Limpiar filtros</GhostButton>
            </div>
          </Card>

          <SectionTitle
            title="Descartes"
            hint={!loading ? `${discards.length} registro(s)` : undefined}
          />

          {loading ? (
            <Spinner label="Cargando descartes…" />
          ) : error ? (
            <ErrorState description={error.message} onRetry={refetch} />
          ) : discards.length === 0 ? (
            <EmptyState
              icon={Trash2}
              title="Sin descartes"
              description="No hay descartes con los filtros seleccionados."
            />
          ) : (
            <Card padding={0}>
              <TableScroll minWidth={900}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Fecha</th>
                      <th style={th}>Almacén</th>
                      <th style={th}>Marca</th>
                      <th style={th}>Tipo</th>
                      <th style={{ ...th, textAlign: "right" }}>Cantidad</th>
                      <th style={th}>Motivo</th>
                      <th style={th}>Usuario</th>
                      <th style={th}>ID movimiento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {discards.map((d) => (
                      <tr key={d.id}>
                        <td style={td}>{fmtDate(d.created_at)}</td>
                        <td style={td}>
                          {d.warehouse?.name || "—"}
                        </td>
                        <td style={td}>{d.brand?.name || "—"}</td>
                        <td style={td}>
                          <TypeBadge value={d.pallet_type} />
                        </td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 950 }}>
                          {d.quantity}
                        </td>
                        <td style={td}>{d.reason || "—"}</td>
                        <td style={td}>{d.user_email || d.user_id || "—"}</td>
                        <td style={{ ...td, fontFamily: "monospace" }}>
                          {d.movement?.movement_code || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </Card>
          )}
          </>
          )}
        </Container>
      </Main>
    </Shell>
  );
}
