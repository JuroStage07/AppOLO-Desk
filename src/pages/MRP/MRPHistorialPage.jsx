// MRP Tarimas — Historial de movimientos de artículos (con filtros).
import React, { useMemo, useState } from "react";
import { History, SlidersHorizontal } from "lucide-react";
import {
  Badge,
  Card,
  Field,
  GhostButton,
  Chip,
  ChipsRow,
  TableScroll,
  Spinner,
  ErrorState,
  EmptyState,
  SectionTitle,
} from "../../components/ui";
import {
  usePalletMovements,
  usePalletArticulos,
  useMrpWorkspace,
} from "../../hooks/mrp";
import {
  PALLET_LOCATIONS,
  PALLET_LOCATION_LABELS,
  PALLET_MOVEMENT_TYPES,
  PALLET_MOVEMENT_TYPE_LABELS,
} from "../../services/mrp";
import { th, td, filtersRow, fmtDate } from "./components/mrpFormat";
import { LocationBadge, MovementBadge } from "./components/mrpUi";

const EMPTY = {
  movementCode: "",
  taskId: "",
  movementType: "",
  articuloId: "",
  originLocation: "",
  destinationLocation: "",
  userEmail: "",
  reason: "",
  dateFrom: "",
  dateTo: "",
};

export default function MRPHistorialPage() {
  const [raw, setRaw] = useState(EMPTY);
  const [showFilters, setShowFilters] = useState(false);
  const set = (k, v) => setRaw((f) => ({ ...f, [k]: v }));

  const { warehouseId } = useMrpWorkspace();
  const { articulos } = usePalletArticulos({ warehouseId });

  const filters = useMemo(() => {
    const f = {};
    if (warehouseId) f.warehouseId = warehouseId;
    if (raw.movementCode.trim()) f.movementCode = raw.movementCode.trim();
    if (raw.taskId.trim()) f.taskId = raw.taskId.trim();
    if (raw.movementType) f.movementType = raw.movementType;
    if (raw.articuloId) f.articuloId = raw.articuloId;
    if (raw.originLocation) f.originLocation = raw.originLocation;
    if (raw.destinationLocation) f.destinationLocation = raw.destinationLocation;
    if (raw.userEmail.trim()) f.userEmail = raw.userEmail.trim();
    if (raw.reason.trim()) f.reason = raw.reason.trim();
    if (raw.dateFrom) f.dateFrom = `${raw.dateFrom}T00:00:00`;
    if (raw.dateTo) f.dateTo = `${raw.dateTo}T23:59:59`;
    return f;
  }, [raw, warehouseId]);

  const { movements, loading, error, refetch } = usePalletMovements(filters);

  return (
    <>
      <SectionTitle
        title="Historial de movimientos"
        action={<Badge tone="accent">Movimientos</Badge>}
      />

      {/* Atajos por tipo de movimiento */}
      <ChipsRow>
                <Chip
                  active={!raw.movementType}
                  onClick={() => set("movementType", "")}
                >
                  Todos
                </Chip>
                {PALLET_MOVEMENT_TYPES.map((m) => (
                  <Chip
                    key={m}
                    active={raw.movementType === m}
                    onClick={() => set("movementType", m)}
                  >
                    {PALLET_MOVEMENT_TYPE_LABELS[m]}
                  </Chip>
                ))}
              </ChipsRow>

              {/* Filtros (colapsables, ocultos por defecto) */}
              <div>
                <GhostButton
                  icon={SlidersHorizontal}
                  onClick={() => setShowFilters((v) => !v)}
                >
                  {showFilters ? "Ocultar filtros" : "Filtros"}
                </GhostButton>
              </div>

              {showFilters && (
                <Card>
                  <div style={filtersRow}>
                    <Field label="ID movimiento">
                      <Field.Input
                        value={raw.movementCode}
                        onChange={(e) => set("movementCode", e.target.value)}
                        placeholder="MOV-…"
                      />
                    </Field>
                    <Field label="ID tarea">
                      <Field.Input
                        value={raw.taskId}
                        onChange={(e) => set("taskId", e.target.value)}
                        placeholder="UUID de tarea"
                      />
                    </Field>
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
                    <Field label="Origen">
                      <Field.Select
                        value={raw.originLocation}
                        onChange={(e) => set("originLocation", e.target.value)}
                      >
                        <option value="">Todas</option>
                        {PALLET_LOCATIONS.map((l) => (
                          <option key={l} value={l}>
                            {PALLET_LOCATION_LABELS[l]}
                          </option>
                        ))}
                      </Field.Select>
                    </Field>
                    <Field label="Destino">
                      <Field.Select
                        value={raw.destinationLocation}
                        onChange={(e) =>
                          set("destinationLocation", e.target.value)
                        }
                      >
                        <option value="">Todas</option>
                        {PALLET_LOCATIONS.map((l) => (
                          <option key={l} value={l}>
                            {PALLET_LOCATION_LABELS[l]}
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
                    <Field label="Motivo">
                      <Field.Input
                        value={raw.reason}
                        onChange={(e) => set("reason", e.target.value)}
                        placeholder="texto del motivo…"
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
              )}

              <SectionTitle
                title="Movimientos"
                hint={!loading ? `${movements.length} resultado(s)` : undefined}
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
                          <th style={th}>Fecha</th>
                          <th style={th}>Movimiento</th>
                          <th style={th}>ID movimiento</th>
                          <th style={th}>ID tarea</th>
                          <th style={th}>Artículo</th>
                          <th style={{ ...th, textAlign: "right" }}>Cantidad</th>
                          <th style={th}>Origen</th>
                          <th style={th}>Destino</th>
                          <th style={th}>Motivo</th>
                          <th style={th}>Usuario</th>
                        </tr>
                      </thead>
                      <tbody>
                        {movements.map((m) => (
                          <tr key={m.id}>
                            <td style={td}>{fmtDate(m.created_at)}</td>
                            <td style={td}>
                              <MovementBadge value={m.movement_type} metadata={m.metadata} />
                            </td>
                            <td style={{ ...td, fontFamily: "monospace" }}>
                              {m.movement_code}
                            </td>
                            <td style={{ ...td, fontFamily: "monospace" }}>
                              {m.task_id ? m.task_id.slice(0, 8) : "—"}
                            </td>
                            <td style={td}>
                              <span
                                style={{ fontFamily: "monospace", fontWeight: 950 }}
                              >
                                {m.articulo?.codigo}
                              </span>{" "}
                              · {m.articulo?.nombre}
                            </td>
                            <td style={{ ...td, textAlign: "right", fontWeight: 950 }}>
                              {m.quantity}
                            </td>
                            <td style={td}>
                              <LocationBadge value={m.origin_location} />
                            </td>
                            <td style={td}>
                              <LocationBadge value={m.destination_location} />
                            </td>
                            <td style={td}>{m.reason || "—"}</td>
                            <td style={td}>{m.user_email || m.user_id || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableScroll>
                </Card>
              )}
    </>
  );
}
