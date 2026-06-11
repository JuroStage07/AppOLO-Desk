import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Clock,
  FileSpreadsheet,
  Lock,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { auth } from "../../firebase";
import {
  Badge,
  Brand,
  Container,
  GhostButton,
  Hero,
  Main,
  ModuleCard,
  ModuleGrid,
  QuickCard,
  Shell,
  Topbar,
} from "../../components/ui";
import usePinnedModules from "../../hooks/usePinnedModules";
import {
  ACCENT,
  BORDER,
  SHADOW_CARD,
  SLATE,
  SURFACE,
  TEXT,
} from "../../styles/theme";

/* ─── Modal de selección de flujo Horas Extra ─── */
function OvertimeFlowModal({ open, onClose, onSelect }) {
  if (!open) return null;

  return (
    <div style={modalStyles.backdrop} onClick={onClose}>
      <div style={modalStyles.dialog} onClick={(e) => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <div>
            <div style={modalStyles.title}>Horas Extra</div>
            <div style={modalStyles.subtitle}>
              Seleccioná el flujo de aprobación al que querés ingresar.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={modalStyles.closeBtn}
            aria-label="Cerrar"
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>

        <div style={modalStyles.options}>
          <button
            type="button"
            style={modalStyles.optionCard}
            onClick={() => onSelect("coordinador")}
          >
            <div style={modalStyles.optionIcon}>
              <UserCheck size={22} strokeWidth={2.2} />
            </div>
            <div style={modalStyles.optionText}>
              <div style={modalStyles.optionTitle}>Aprobar horas extra</div>
              <div style={modalStyles.optionDesc}>Coordinador</div>
            </div>
          </button>

          <button
            type="button"
            style={modalStyles.optionCard}
            onClick={() => onSelect("gerente")}
          >
            <div style={{ ...modalStyles.optionIcon, background: "rgba(124,58,237,0.12)", color: "#7C3AED" }}>
              <ShieldCheck size={22} strokeWidth={2.2} />
            </div>
            <div style={modalStyles.optionText}>
              <div style={modalStyles.optionTitle}>Validar horas extra</div>
              <div style={modalStyles.optionDesc}>Gerente</div>
            </div>
          </button>

          <button
            type="button"
            style={modalStyles.optionCard}
            onClick={() => onSelect("reporte")}
          >
            <div style={{ ...modalStyles.optionIcon, background: "rgba(234,88,12,0.12)", color: "#EA580C" }}>
              <FileSpreadsheet size={22} strokeWidth={2.2} />
            </div>
            <div style={modalStyles.optionText}>
              <div style={modalStyles.optionTitle}>Reporte Mensual</div>
              <div style={modalStyles.optionDesc}>Exportar reporte</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

const modalStyles = {
  backdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 50000,
    background: "rgba(15,23,42,0.45)",
    backdropFilter: "blur(4px)",
    display: "grid",
    placeItems: "center",
    padding: 16,
  },
  dialog: {
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: 22,
    boxShadow: "0 24px 60px rgba(15,23,42,0.18)",
    padding: 28,
    width: "100%",
    maxWidth: 420,
    display: "grid",
    gap: 24,
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: 950,
    color: TEXT,
    lineHeight: 1.2,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: 700,
    color: SLATE,
    marginTop: 4,
  },
  closeBtn: {
    display: "grid",
    placeItems: "center",
    width: 34,
    height: 34,
    borderRadius: 10,
    border: `1px solid ${BORDER}`,
    background: "transparent",
    color: SLATE,
    cursor: "pointer",
    flexShrink: 0,
  },
  options: {
    display: "grid",
    gap: 12,
  },
  optionCard: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: 16,
    border: `1px solid ${BORDER}`,
    borderRadius: 16,
    background: SURFACE,
    cursor: "pointer",
    transition: "border-color 0.15s, box-shadow 0.15s",
    boxShadow: SHADOW_CARD,
    textAlign: "left",
  },
  optionIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    background: "rgba(8,159,138,0.12)",
    color: ACCENT,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  optionText: {
    display: "grid",
    gap: 2,
    minWidth: 0,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: 900,
    color: TEXT,
  },
  optionDesc: {
    fontSize: 12.5,
    fontWeight: 700,
    color: SLATE,
  },
};

/* ─── Page ─── */
export default function AdministracionHub() {
  const nav = useNavigate();
  const user = auth.currentUser;
  const { isPinned, togglePin } = usePinnedModules("administracion");
  const [showOTModal, setShowOTModal] = useState(false);

  const go = (path) => nav(path);

  const handleOTSelect = (flow) => {
    setShowOTModal(false);
    if (flow === "coordinador") {
      nav("/horas-extra");
    } else if (flow === "reporte") {
      nav("/horas-extra/reporte");
    } else {
      nav("/horas-extra/gerencia");
    }
  };

  const modules = useMemo(
    () => [
      {
        key: "usuarios",
        title: "Usuarios",
        desc: "Gestión de usuarios, roles y permisos de la plataforma",
        path: "/administracion/usuarios",
        icon: Users,
        tag: "Prioritario",
      },
      {
        key: "horas-extra",
        title: "Horas Extra",
        desc: "Revisión y aprobación de horas extra del personal",
        path: null, // handled by modal
        icon: Clock,
        tag: "Aprobaciones",
      },
    ],
    []
  );

  return (
    <Shell>
      <Topbar>
        <Brand
          icon={ShieldCheck}
          title="Administración"
          subtitle="Panel de módulos"
          onClick={() => go("/administracion")}
        />
        <Topbar.Right>
          <Topbar.UserHint title={user?.email || ""}>
            {user?.displayName || user?.email || "Sesión activa"}
          </Topbar.UserHint>
          <GhostButton icon={ArrowLeft} onClick={() => go("/")}>
            Inicio
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container>
          <Hero
            kicker="Centro de control"
            title="Módulos"
            subtitle="Seleccioná un módulo para ingresar. Las acciones quedan asociadas a tu usuario."
            badge={<Badge icon={Lock}>Administración</Badge>}
            aside={<QuickCard moduleKey="administracion" />}
          />

          <ModuleGrid>
            {modules.map((m) => (
              <ModuleCard
                key={m.key}
                title={m.title}
                desc={m.desc}
                icon={m.icon}
                tag={m.tag}
                tone="accent"
                href={m.path}
                onClick={() => {
                  if (m.key === "horas-extra") {
                    setShowOTModal(true);
                  } else {
                    go(m.path);
                  }
                }}
                pinned={isPinned(m.path || m.key)}
                onTogglePin={() => togglePin(m.title, m.path || m.key)}
              />
            ))}
          </ModuleGrid>
        </Container>
      </Main>

      <OvertimeFlowModal
        open={showOTModal}
        onClose={() => setShowOTModal(false)}
        onSelect={handleOTSelect}
      />
    </Shell>
  );
}
