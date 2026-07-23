// MRP Tarimas — Descartes de artículos (registro administrativo de ajustes negativos).
//
// IMPORTANTE: esta vista NO es inventario y NO se mezcla con merma.
import React, { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  Badge,
  Card,
  Field,
  GhostButton,
  Spinner,
  ErrorState,
  EmptyState,
  SectionTitle,
} from "../../components/ui";
import {
  usePalletDiscards,
  usePalletArticulos,
  useMrpWorkspace,
} from "../../hooks/mrp";
import { th, td, filtersRow, fmtDate } from "./components/mrpFormat";
import { CodeText } from "./components/mrpUi";
import MrpTable from "./components/MrpTable";
import { FS_BASE, FW_BOLD, FW_EXTRABOLD, LH_NORMAL } from "../../styles/theme";

const EMPTY = {
  articuloId: "",
  userEmail: "",
  dateFrom: "",
  dateTo: "",
};

export default function MRPDescartesPage() {
  const [raw, setRaw] = useState(EMPTY);
  const set = (k, v) => setRaw((f) => ({ ...f, [k]: v }));

  const { warehouseId } = useMrpWorkspace();
  const { articulos } = usePalletArticulos({ warehouseId });

  const filters = useMemo(() => {
    const f = {};
    if (warehouseId) f.warehouseId = warehouseId;
    if (raw.articuloId) f.articuloId = raw.articuloId;
    if (raw.userEmail.trim()) f.userEmail = raw.userEmail.trim();
    if (raw.dateFrom) f.dateFrom = `${raw.dateFrom}T00:00:00`;
    if (raw.dateTo) f.dateTo = `${raw.dateTo}T23:59:59`;
    return f;
  }, [raw, warehouseId]);

  const { discards, loading, error, refetch } = usePalletDiscards(filters);

  return (
    <>
      <SectionTitle
        title="Descartes"
        action={<Badge tone="dark">Administrativo</Badge>}
      />

      <Card tone="accent" padding={16}>
        <div style={{ fontSize: FS_BASE, fontWeight: FW_BOLD, lineHeight: LH_NORMAL }}>
          Los descartes son un registro administrativo.{" "}
          <b>No son inventario</b> y{" "}
          <b>no se mezclan con la ubicación merma</b>.
        </div>
      </Card>

      {/* Filtros */}
      <Card padding={16}>
        <div style={filtersRow}>
                  <Field label="Artículo">
                    <Field.Select
                      value={raw.articuloId}
                      onChange={(e) => set("articuloId", e.target.value)}
                    >
                      <option value="">Todos</option>
                      {articulos.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.codigo} · {a.nombre}
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
                  <GhostButton onClick={() => setRaw(EMPTY)}>
                    Limpiar filtros
                  </GhostButton>
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
                  <MrpTable minWidth={820}>
                      <thead>
                        <tr>
                          <th style={th}>Fecha</th>
                          <th style={th}>Artículo</th>
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
                              <CodeText>{d.articulo?.codigo}</CodeText>{" "}
                              · {d.articulo?.nombre}
                            </td>
                            <td style={{ ...td, textAlign: "right", fontWeight: FW_EXTRABOLD }}>
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
                  </MrpTable>
                </Card>
              )}
    </>
  );
}
