// Configuración MRP Tarimas › Administración de motivos.
//
// CRUD de motivos por tipo de movimiento (ajuste positivo/negativo, traslado,
// traslado de almacén). Los motivos activos se muestran en los modales de Ajuste
// y Traslado según el tipo. Requiere supabase/mrp_motivos.sql.
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ListChecks, Plus, Trash2, Eye, EyeOff } from "lucide-react";
import {
  Badge,
  Brand,
  Card,
  Chip,
  ChipsRow,
  Container,
  EmptyState,
  Field,
  GhostButton,
  Hero,
  Main,
  PrimaryButton,
  Shell,
  Spinner,
  Topbar,
  useConfirm,
} from "../../components/ui";
import { usePalletMotivos } from "../../hooks/mrp";
import { MOTIVO_TIPOS, MOTIVO_TIPO_LABELS } from "../../services/mrp";
import { ACCENT, ACCENT_SOFT, BORDER, SLATE, SURFACE, SURFACE_INSET, TEXT, FW_EXTRABOLD } from "../../styles/theme";

const HUB_PATH = "/dev/config-modulos/mrp-tarimas";

export default function ConfigMRPMotivos() {
  const nav = useNavigate();
  const confirm = useConfirm();

  const [tipo, setTipo] = useState(MOTIVO_TIPOS[0]);
  const [nuevo, setNuevo] = useState("");

  const { motivos, loading, error, refetch, create, setActive, remove, busy } =
    usePalletMotivos({ tipo, includeInactive: true });

  const onAdd = async () => {
    const label = nuevo.trim();
    if (!label) return;
    try {
      await create(label);
      setNuevo("");
    } catch {
      /* toast ya mostrado por el hook */
    }
  };

  const onRemove = async (m) => {
    const ok = await confirm({
      title: "Eliminar motivo",
      message: `¿Eliminar el motivo “${m.label}”? Dejará de aparecer en los modales.`,
      confirmText: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await remove(m.id);
    } catch {
      /* toast ya mostrado */
    }
  };

  return (
    <Shell>
      <Topbar>
        <Brand
          icon={ListChecks}
          title="Administración de motivos"
          subtitle="Configuración MRP Tarimas"
          onClick={() => nav(HUB_PATH)}
        />
        <Topbar.Right>
          <GhostButton icon={ArrowLeft} onClick={() => nav(HUB_PATH)}>
            Volver
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container>
          <Hero
            kicker="Administración de motivos"
            title="Motivos por tipo de movimiento"
            subtitle="Definí los motivos que se muestran en los modales de Ajuste y Traslado. Cada catálogo aplica a un tipo de movimiento."
            badge={<Badge icon={ListChecks}>Motivos</Badge>}
          />

          <ChipsRow>
            {MOTIVO_TIPOS.map((t) => (
              <Chip key={t} active={tipo === t} onClick={() => setTipo(t)}>
                {MOTIVO_TIPO_LABELS[t]}
              </Chip>
            ))}
          </ChipsRow>

          {/* Alta de motivo */}
          <Card>
            <div style={styles.addRow}>
              <Field label={`Nuevo motivo · ${MOTIVO_TIPO_LABELS[tipo]}`} style={{ flex: 1, minWidth: 0 }}>
                <Field.Input
                  value={nuevo}
                  onChange={(e) => setNuevo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onAdd();
                    }
                  }}
                  placeholder="Ej: Ingreso, Devolución, Merma…"
                />
              </Field>
              <PrimaryButton icon={Plus} onClick={onAdd} loading={busy} disabled={!nuevo.trim()}>
                Agregar
              </PrimaryButton>
            </div>
          </Card>

          {loading ? (
            <Spinner label="Cargando motivos…" />
          ) : error ? (
            <EmptyState
              icon={ListChecks}
              title="No se pudieron cargar los motivos"
              description={
                error.message ||
                "Verificá la migración de Supabase (supabase/mrp_motivos.sql)."
              }
              action={<GhostButton onClick={refetch}>Reintentar</GhostButton>}
            />
          ) : motivos.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="Sin motivos"
              description={`No hay motivos para “${MOTIVO_TIPO_LABELS[tipo]}”. Agregá el primero arriba.`}
            />
          ) : (
            <div style={styles.list}>
              {motivos.map((m) => (
                <div
                  key={m.id}
                  style={{ ...styles.row, ...(m.active ? {} : styles.rowInactive) }}
                >
                  <div style={styles.info}>
                    <span style={styles.label}>{m.label}</span>
                    {!m.active && <span style={styles.tagOff}>Inactivo</span>}
                  </div>
                  <div style={styles.actions}>
                    <button
                      type="button"
                      onClick={() => setActive(m.id, !m.active)}
                      style={styles.iconBtn}
                      title={m.active ? "Desactivar" : "Activar"}
                    >
                      {m.active ? (
                        <EyeOff size={15} strokeWidth={2.3} />
                      ) : (
                        <Eye size={15} strokeWidth={2.3} />
                      )}
                      {m.active ? "Desactivar" : "Activar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(m)}
                      style={styles.deleteBtn}
                      title="Eliminar"
                    >
                      <Trash2 size={15} strokeWidth={2.3} />
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Container>
      </Main>
    </Shell>
  );
}

const styles = {
  addRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: 12,
    flexWrap: "wrap",
  },
  list: { display: "grid", gap: 10 },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: 14,
    padding: "12px 16px",
  },
  rowInactive: { opacity: 0.6 },
  info: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 },
  label: { fontSize: 14, fontWeight: 800, color: TEXT },
  tagOff: {
    fontSize: 10.5,
    fontWeight: FW_EXTRABOLD,
    color: SLATE,
    background: SURFACE_INSET,
    border: `1px solid ${BORDER}`,
    borderRadius: 999,
    padding: "1px 8px",
  },
  actions: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  iconBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 12px",
    borderRadius: 10,
    border: `1px solid ${ACCENT}`,
    background: ACCENT_SOFT,
    color: ACCENT,
    fontWeight: 800,
    fontSize: 12.5,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  deleteBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid rgba(185,28,28,0.30)",
    background: "#FEF2F2",
    color: "#B91C1C",
    fontWeight: 800,
    fontSize: 12.5,
    cursor: "pointer",
    fontFamily: "inherit",
  },
};
