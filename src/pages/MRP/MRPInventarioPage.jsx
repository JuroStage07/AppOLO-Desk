import React, { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Eye,
  Package,
  Send,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import {
  Badge,
  Brand,
  Chip,
  ChipsRow,
  Container,
  GhostButton,
  Hero,
  Main,
  SearchInput,
  Sheet,
  Shell,
  StatusPill,
  TableScroll,
  Topbar,
  Field,
  PrimaryButton,
  SecondaryButton,
  SectionTitle,
} from "../../components/ui";
import {
  TARIMAS as INITIAL_TARIMAS,
  MATERIALES as INITIAL_MATERIALES,
  REPARACIONES as INITIAL_REPARACIONES,
  UBICACIONES,
  TIPOS_DANO,
  RESPONSABLES,
} from "../../mocks/mockMRPTarimas";
import {
  ACCENT,
  BORDER,
  SLATE,
  TEXT,
  MUTED,
} from "../../styles/theme";

const ESTADO_LABELS = {
  disponible: "Disponible",
  en_uso: "En uso",
  dañada: "Dañada",
  en_reparacion: "En reparación",
  reparada: "Reparada",
  descartada: "Descartada",
};

const ESTADO_TONE = {
  disponible: "ok",
  en_uso: "accent",
  dañada: "danger",
  en_reparacion: "warn",
  reparada: "ok",
  descartada: "dark",
};

export default function MRPInventarioPage() {
  const nav = useNavigate();

  const [tarimas, setTarimas] = useState(INITIAL_TARIMAS);
  const [materiales, setMateriales] = useState(INITIAL_MATERIALES);
  const [reparaciones, setReparaciones] = useState(INITIAL_REPARACIONES);

  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState("todos");
  const [filterEstado, setFilterEstado] = useState("todos");
  const [filterUbicacion, setFilterUbicacion] = useState("todos");

  // Detalle sheet
  const [detalleTarima, setDetalleTarima] = useState(null);

  // Reparación sheet
  const [repSheet, setRepSheet] = useState(false);
  const [repTarima, setRepTarima] = useState(null);
  const [repForm, setRepForm] = useState({
    tipoDano: "",
    materialId: "",
    cantidadMaterial: 1,
    costoManoObra: 0,
    otrosGastos: 0,
    observaciones: "",
    responsable: "",
  });

  const filtered = useMemo(() => {
    return tarimas.filter((t) => {
      if (search && !t.id.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterTipo !== "todos" && t.tipo !== filterTipo) return false;
      if (filterEstado !== "todos" && t.estado !== filterEstado) return false;
      if (filterUbicacion !== "todos" && t.ubicacion !== filterUbicacion) return false;
      return true;
    });
  }, [tarimas, search, filterTipo, filterEstado, filterUbicacion]);

  const openReparacion = (tarima) => {
    setRepTarima(tarima);
    setRepForm({
      tipoDano: "",
      materialId: "",
      cantidadMaterial: 1,
      costoManoObra: 0,
      otrosGastos: 0,
      observaciones: "",
      responsable: "",
    });
    setRepSheet(true);
  };

  const submitReparacion = () => {
    if (!repTarima || !repForm.tipoDano) return;

    const mat = materiales.find((m) => m.id === repForm.materialId);
    const costoMat = mat ? mat.costoUnitario * repForm.cantidadMaterial : 0;
    const costoTotal = costoMat + Number(repForm.costoManoObra) + Number(repForm.otrosGastos);

    // Update tarima state
    setTarimas((prev) =>
      prev.map((t) =>
        t.id === repTarima.id
          ? {
              ...t,
              estado: "en_reparacion",
              ubicacion: "Taller",
              ultimoMovimiento: new Date().toISOString().split("T")[0],
              costoAcumulado: t.costoAcumulado + costoTotal,
            }
          : t
      )
    );

    // Consume material stock
    if (mat) {
      setMateriales((prev) =>
        prev.map((m) =>
          m.id === repForm.materialId
            ? { ...m, stock: Math.max(0, m.stock - repForm.cantidadMaterial) }
            : m
        )
      );
    }

    // Add reparacion record
    const newRep = {
      id: `REP-${String(reparaciones.length + 1).padStart(3, "0")}`,
      tarimaId: repTarima.id,
      tipoDano: repForm.tipoDano,
      materiales: mat
        ? [{ materialId: mat.id, cantidad: repForm.cantidadMaterial, costo: costoMat }]
        : [],
      costoManoObra: Number(repForm.costoManoObra),
      otrosGastos: Number(repForm.otrosGastos),
      observaciones: repForm.observaciones,
      fecha: new Date().toISOString().split("T")[0],
      responsable: repForm.responsable,
      estado: "en_proceso",
    };
    setReparaciones((prev) => [newRep, ...prev]);

    setRepSheet(false);
    setRepTarima(null);
  };

  const marcarReparada = (tarimaId) => {
    setTarimas((prev) =>
      prev.map((t) =>
        t.id === tarimaId
          ? { ...t, estado: "reparada", ultimoMovimiento: new Date().toISOString().split("T")[0] }
          : t
      )
    );
  };

  const descartar = (tarimaId) => {
    setTarimas((prev) =>
      prev.map((t) =>
        t.id === tarimaId
          ? { ...t, estado: "descartada", ultimoMovimiento: new Date().toISOString().split("T")[0] }
          : t
      )
    );
  };

  const tarimaHistorial = useMemo(() => {
    if (!detalleTarima) return [];
    return reparaciones.filter((r) => r.tarimaId === detalleTarima.id);
  }, [detalleTarima, reparaciones]);

  return (
    <Shell>
      <Topbar>
        <Brand
          icon={Package}
          title="Inventario"
          subtitle="Tarimas"
          onClick={() => nav("/mrp-tarimas/inventario")}
        />
        <Topbar.Right>
          <GhostButton icon={ArrowLeft} onClick={() => nav("/mrp-tarimas")}>
            MRP
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container>
          <Hero
            layout="compact"
            kicker="MRP Tarimas"
            title="Inventario"
            badge={<Badge icon={Package}>Inventario</Badge>}
          />

          {/* Filters */}
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar por ID de tarima..."
          />

          <div style={styles.filtersRow}>
            <ChipsRow>
              <Chip active={filterTipo === "todos"} onClick={() => setFilterTipo("todos")}>
                Todos
              </Chip>
              <Chip active={filterTipo === "sencilla"} onClick={() => setFilterTipo("sencilla")}>
                Sencilla
              </Chip>
              <Chip active={filterTipo === "doble"} onClick={() => setFilterTipo("doble")}>
                Doble
              </Chip>
            </ChipsRow>

            <ChipsRow>
              <Chip active={filterEstado === "todos"} onClick={() => setFilterEstado("todos")}>
                Todos
              </Chip>
              {Object.entries(ESTADO_LABELS).map(([k, v]) => (
                <Chip key={k} active={filterEstado === k} onClick={() => setFilterEstado(k)}>
                  {v}
                </Chip>
              ))}
            </ChipsRow>
          </div>

          {/* Table */}
          <SectionTitle
            title="Tarimas"
            hint={`${filtered.length} resultado${filtered.length !== 1 ? "s" : ""}`}
          />

          <div style={styles.tableWrap}>
            <TableScroll minWidth={780} bordered={false}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>ID</th>
                  <th style={styles.th}>Tipo</th>
                  <th style={styles.th}>Estado</th>
                  <th style={styles.th}>Ubicación</th>
                  <th style={styles.th}>Últ. movimiento</th>
                  <th style={styles.th}>Costo acum.</th>
                  <th style={styles.th}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} style={styles.tr}>
                    <td style={styles.td}>
                      <span style={styles.tdId}>{t.id}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={styles.tdTipo}>{t.tipo === "doble" ? "Doble" : "Sencilla"}</span>
                    </td>
                    <td style={styles.td}>
                      <StatusPill tone={ESTADO_TONE[t.estado]}>
                        {ESTADO_LABELS[t.estado]}
                      </StatusPill>
                    </td>
                    <td style={styles.td}>{t.ubicacion}</td>
                    <td style={styles.td}>{t.ultimoMovimiento}</td>
                    <td style={styles.td}>
                      {t.costoAcumulado > 0
                        ? `₡${t.costoAcumulado.toLocaleString()}`
                        : "—"}
                    </td>
                    <td style={styles.td}>
                      <div style={styles.actions}>
                        <button
                          type="button"
                          style={styles.actionBtn}
                          title="Ver detalle"
                          aria-label="Ver detalle"
                          onClick={() => setDetalleTarima(t)}
                        >
                          <Eye size={14} strokeWidth={2.2} />
                        </button>
                        {(t.estado === "disponible" || t.estado === "dañada") && (
                          <button
                            type="button"
                            style={styles.actionBtn}
                            title="Enviar a reparación"
                            aria-label="Enviar a reparación"
                            onClick={() => openReparacion(t)}
                          >
                            <Send size={14} strokeWidth={2.2} />
                          </button>
                        )}
                        {t.estado === "en_reparacion" && (
                          <button
                            type="button"
                            style={{ ...styles.actionBtn, color: ACCENT }}
                            title="Marcar como reparada"
                            aria-label="Marcar como reparada"
                            onClick={() => marcarReparada(t.id)}
                          >
                            <CheckCircle2 size={14} strokeWidth={2.2} />
                          </button>
                        )}
                        {(t.estado === "dañada" || t.estado === "reparada") && (
                          <button
                            type="button"
                            style={{ ...styles.actionBtn, color: "#B91C1C" }}
                            title="Descartar"
                            aria-label="Descartar"
                            onClick={() => descartar(t.id)}
                          >
                            <Trash2 size={14} strokeWidth={2.2} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </TableScroll>
          </div>
        </Container>
      </Main>

      {/* Sheet: Detalle tarima */}
      <Sheet
        open={!!detalleTarima}
        onClose={() => setDetalleTarima(null)}
        title={detalleTarima ? `Detalle ${detalleTarima.id}` : ""}
        placement="center"
      >
        {detalleTarima && (
          <>
            <Sheet.Body>
              <div style={styles.detalleGrid}>
                <div><span style={styles.detLabel}>Tipo:</span> {detalleTarima.tipo === "doble" ? "Doble" : "Sencilla"}</div>
                <div><span style={styles.detLabel}>Estado:</span> <StatusPill tone={ESTADO_TONE[detalleTarima.estado]}>{ESTADO_LABELS[detalleTarima.estado]}</StatusPill></div>
                <div><span style={styles.detLabel}>Ubicación:</span> {detalleTarima.ubicacion}</div>
                <div><span style={styles.detLabel}>Ingreso:</span> {detalleTarima.fechaIngreso}</div>
                <div><span style={styles.detLabel}>Últ. movimiento:</span> {detalleTarima.ultimoMovimiento}</div>
                <div><span style={styles.detLabel}>Costo acumulado:</span> ₡{detalleTarima.costoAcumulado.toLocaleString()}</div>
              </div>

              {tarimaHistorial.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <SectionTitle title="Historial de reparaciones" />
                  <div style={{ display: "grid", gap: 8 }}>
                    {tarimaHistorial.map((r) => (
                      <div key={r.id} style={styles.histRow}>
                        <div style={styles.histInfo}>
                          <span style={styles.histTitle}>{r.tipoDano}</span>
                          <span style={styles.histMeta}>
                            {r.fecha} · {r.responsable}
                          </span>
                        </div>
                        <StatusPill
                          tone={r.estado === "completada" ? "ok" : r.estado === "en_proceso" ? "warn" : "neutral"}
                        >
                          {r.estado === "completada" ? "Completada" : r.estado === "en_proceso" ? "En proceso" : "Pendiente"}
                        </StatusPill>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Sheet.Body>
            <Sheet.Actions>
              <SecondaryButton onClick={() => setDetalleTarima(null)}>
                Cerrar
              </SecondaryButton>
              {(detalleTarima.estado === "disponible" || detalleTarima.estado === "dañada") && (
                <PrimaryButton
                  icon={Send}
                  onClick={() => {
                    setDetalleTarima(null);
                    openReparacion(detalleTarima);
                  }}
                >
                  Enviar a reparación
                </PrimaryButton>
              )}
            </Sheet.Actions>
          </>
        )}
      </Sheet>

      {/* Sheet: Enviar a reparación */}
      <Sheet
        open={repSheet}
        onClose={() => setRepSheet(false)}
        title={repTarima ? `Reparar ${repTarima.id}` : "Reparación"}
        placement="center"
        maxWidth={560}
      >
        <Sheet.Body>
          <Field label="Tipo de daño">
            <Field.Select
              value={repForm.tipoDano}
              onChange={(e) => setRepForm({ ...repForm, tipoDano: e.target.value })}
            >
              <option value="">Seleccionar...</option>
              {TIPOS_DANO.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </Field.Select>
          </Field>

          <Field label="Material a usar">
            <Field.Select
              value={repForm.materialId}
              onChange={(e) => setRepForm({ ...repForm, materialId: e.target.value })}
            >
              <option value="">Sin material</option>
              {materiales.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre} (stock: {m.stock} {m.unidad})
                </option>
              ))}
            </Field.Select>
          </Field>

          {repForm.materialId && (
            <Field label="Cantidad de material">
              <Field.Input
                type="number"
                min={0}
                value={repForm.cantidadMaterial}
                onChange={(e) =>
                  setRepForm({ ...repForm, cantidadMaterial: Number(e.target.value) })
                }
              />
            </Field>
          )}

          <Field label="Costo mano de obra (₡)">
            <Field.Input
              type="number"
              min={0}
              value={repForm.costoManoObra}
              onChange={(e) =>
                setRepForm({ ...repForm, costoManoObra: e.target.value })
              }
            />
          </Field>

          <Field label="Otros gastos (₡)">
            <Field.Input
              type="number"
              min={0}
              value={repForm.otrosGastos}
              onChange={(e) =>
                setRepForm({ ...repForm, otrosGastos: e.target.value })
              }
            />
          </Field>

          <Field label="Responsable">
            <Field.Select
              value={repForm.responsable}
              onChange={(e) => setRepForm({ ...repForm, responsable: e.target.value })}
            >
              <option value="">Seleccionar...</option>
              {RESPONSABLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Field.Select>
          </Field>

          <Field label="Observaciones">
            <Field.Textarea
              value={repForm.observaciones}
              onChange={(e) =>
                setRepForm({ ...repForm, observaciones: e.target.value })
              }
              placeholder="Descripción del daño o notas adicionales..."
            />
          </Field>
        </Sheet.Body>
        <Sheet.Actions>
          <SecondaryButton onClick={() => setRepSheet(false)}>
            Cancelar
          </SecondaryButton>
          <PrimaryButton icon={Send} onClick={submitReparacion} disabled={!repForm.tipoDano}>
            Enviar a reparación
          </PrimaryButton>
        </Sheet.Actions>
      </Sheet>
    </Shell>
  );
}

const styles = {
  filtersRow: {
    display: "grid",
    gap: 10,
  },
  tableWrap: {
    overflowX: "auto",
    borderRadius: 14,
    border: `1px solid ${BORDER}`,
    background: "#fff",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
    fontFamily: "inherit",
  },
  th: {
    textAlign: "left",
    padding: "12px 12px",
    fontWeight: 900,
    fontSize: 11,
    color: SLATE,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    borderBottom: `1px solid ${BORDER}`,
    whiteSpace: "nowrap",
  },
  tr: {
    borderBottom: `1px solid ${BORDER}`,
  },
  td: {
    padding: "10px 12px",
    verticalAlign: "middle",
    whiteSpace: "nowrap",
    color: TEXT,
    fontWeight: 700,
  },
  tdId: {
    fontWeight: 900,
    color: ACCENT,
  },
  tdTipo: {
    fontWeight: 800,
  },
  actions: {
    display: "flex",
    gap: 6,
  },
  actionBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    border: `1px solid ${BORDER}`,
    background: "#fff",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    color: TEXT,
    padding: 0,
    fontFamily: "inherit",
  },
  detalleGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    fontSize: 13,
    fontWeight: 700,
    color: TEXT,
  },
  detLabel: {
    fontWeight: 900,
    color: SLATE,
    fontSize: 12,
    marginRight: 4,
  },
  histRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 12px",
    borderRadius: 12,
    border: `1px solid ${BORDER}`,
    gap: 12,
  },
  histInfo: {
    display: "grid",
    gap: 2,
    minWidth: 0,
  },
  histTitle: {
    fontWeight: 850,
    fontSize: 13,
    color: TEXT,
  },
  histMeta: {
    fontWeight: 700,
    fontSize: 12,
    color: SLATE,
  },
};
