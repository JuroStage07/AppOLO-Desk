import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import {
  ArrowLeft,
  Clock,
  Mail,
  Save,
  Search,
  Users,
} from "lucide-react";
import { functions, auth } from "../../firebase";
import {
  Badge,
  Brand,
  Button,
  Container,
  EmptyState,
  GhostButton,
  Hero,
  Main,
  Shell,
  Spinner,
  Topbar,
} from "../../components/ui";
import {
  ACCENT,
  BORDER,
  DANGER,
  SHADOW_CARD,
  SLATE,
  SURFACE,
  TEXT,
} from "../../styles/theme";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function CoordinatorRow({ coordinator, value, onChange }) {
  const invalid = value.trim() !== "" && !EMAIL_RE.test(value.trim());

  return (
    <div style={styles.row}>
      <div style={styles.coordInfo}>
        <div style={styles.avatar}>
          <Users size={16} strokeWidth={2.2} />
        </div>
        <span style={styles.coordName}>{coordinator}</span>
      </div>

      <div style={styles.inputWrap}>
        <div
          style={{
            ...styles.inputBox,
            ...(invalid ? styles.inputBoxError : {}),
          }}
        >
          <Mail size={15} strokeWidth={2.2} color={invalid ? DANGER : SLATE} />
          <input
            type="email"
            value={value}
            onChange={(e) => onChange(coordinator, e.target.value)}
            placeholder="correo@empresa.com"
            style={styles.input}
            aria-label={`Correo de ${coordinator}`}
          />
        </div>
        {invalid && <span style={styles.inputError}>Correo inválido</span>}
      </div>
    </div>
  );
}

export default function OvertimeSettingsHub() {
  const nav = useNavigate();
  const user = auth.currentUser;

  const [coordinators, setCoordinators] = useState([]); // [{ name, email }]
  const [emails, setEmails] = useState({}); // { [name]: email }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [query, setQuery] = useState("");

  const loadCoordinators = async () => {
    setLoading(true);
    setError("");
    setOkMsg("");
    try {
      const getOvertimeCoordinators = httpsCallable(
        functions,
        "getOvertimeCoordinators"
      );
      const res = await getOvertimeCoordinators();
      const list = res.data.coordinators || [];
      setCoordinators(list);
      setEmails(
        list.reduce((acc, c) => {
          acc[c.name] = c.email || "";
          return acc;
        }, {})
      );
    } catch (e) {
      console.error("Error cargando coordinadores:", e);
      setError("No se pudieron cargar los coordinadores. Intentá de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCoordinators();
  }, []);

  const handleEmailChange = (name, value) => {
    setOkMsg("");
    setEmails((prev) => ({ ...prev, [name]: value }));
  };

  const term = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!term) return coordinators;
    return coordinators.filter((c) => c.name.toLowerCase().includes(term));
  }, [coordinators, term]);

  const configuredCount = useMemo(
    () => Object.values(emails).filter((v) => v.trim() !== "").length,
    [emails]
  );

  const hasInvalid = useMemo(
    () =>
      Object.values(emails).some(
        (v) => v.trim() !== "" && !EMAIL_RE.test(v.trim())
      ),
    [emails]
  );

  const handleSave = async () => {
    if (hasInvalid) {
      setError("Corregí los correos inválidos antes de guardar.");
      return;
    }
    setSaving(true);
    setError("");
    setOkMsg("");
    try {
      const saveCoordinatorEmails = httpsCallable(
        functions,
        "saveCoordinatorEmails"
      );
      const payload = coordinators.map((c) => ({
        name: c.name,
        email: (emails[c.name] || "").trim(),
      }));
      await saveCoordinatorEmails({ coordinators: payload });
      setOkMsg("Configuración guardada correctamente.");
    } catch (e) {
      console.error("Error guardando correos:", e);
      setError("No se pudo guardar la configuración. Intentá de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell>
      <Topbar>
        <Brand
          icon={Clock}
          title="Configuración Horas Extras"
          subtitle="Coordinadores"
          onClick={() => nav("/dev/config-modulos")}
        />
        <Topbar.Right>
          <Topbar.UserHint title={user?.email || ""}>
            {user?.displayName || user?.email || "Sesión activa"}
          </Topbar.UserHint>
          <GhostButton icon={ArrowLeft} onClick={() => nav("/dev/config-modulos")}>
            Volver
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container>
          <Hero
            kicker="Configuración"
            title="Correos de coordinadores"
            subtitle="Asigná un correo a cada coordinador. Se usará para enrutar y filtrar las aprobaciones de horas extra."
            badge={
              <Badge icon={Users}>
                {configuredCount}/{coordinators.length} configurados
              </Badge>
            }
            aside={
              <Button
                variant="primary"
                icon={Save}
                onClick={handleSave}
                loading={saving}
                disabled={loading || saving || coordinators.length === 0}
                block
              >
                Guardar cambios
              </Button>
            }
          />

          {!!error && <div style={styles.errorBanner}>{error}</div>}
          {!!okMsg && <div style={styles.okBanner}>{okMsg}</div>}

          {loading ? (
            <Spinner label="Cargando coordinadores…" />
          ) : coordinators.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Sin coordinadores"
              description="No se encontraron coordinadores en la base de datos Bit2."
              action={
                <Button variant="primary" icon={Search} onClick={loadCoordinators}>
                  Recargar
                </Button>
              }
            />
          ) : (
            <>
              <div style={styles.searchWrap}>
                <Search size={16} strokeWidth={2.2} color={SLATE} />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar coordinador…"
                  style={styles.searchInput}
                  aria-label="Buscar coordinador"
                />
              </div>

              {filtered.length === 0 ? (
                <EmptyState
                  icon={Search}
                  title="Sin resultados"
                  description={`No hay coordinadores que coincidan con “${query}”.`}
                />
              ) : (
                <div style={styles.list}>
                  {filtered.map((c) => (
                    <CoordinatorRow
                      key={c.name}
                      coordinator={c.name}
                      value={emails[c.name] || ""}
                      onChange={handleEmailChange}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </Container>
      </Main>
    </Shell>
  );
}

const styles = {
  errorBanner: {
    background: "#FEF2F2",
    border: "1px solid #FECACA",
    color: DANGER,
    borderRadius: 14,
    padding: 14,
    fontWeight: 800,
    fontSize: 13,
  },
  okBanner: {
    background: "rgba(8,159,138,0.10)",
    border: "1px solid rgba(8,159,138,0.30)",
    color: ACCENT,
    borderRadius: 14,
    padding: 14,
    fontWeight: 800,
    fontSize: 13,
  },
  searchWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: 14,
    padding: "10px 14px",
    boxShadow: SHADOW_CARD,
  },
  searchInput: {
    flex: 1,
    border: "none",
    outline: "none",
    background: "transparent",
    fontSize: 14,
    fontWeight: 700,
    color: TEXT,
    fontFamily: "inherit",
    minWidth: 0,
  },
  list: {
    display: "grid",
    gap: 10,
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    flexWrap: "wrap",
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: 16,
    padding: "14px 16px",
    boxShadow: SHADOW_CARD,
  },
  coordInfo: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
    flex: "1 1 200px",
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    background: "rgba(8,159,138,0.12)",
    color: ACCENT,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  coordName: {
    fontWeight: 850,
    fontSize: 14,
    color: TEXT,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  inputWrap: {
    display: "grid",
    gap: 4,
    flex: "1 1 280px",
    minWidth: 0,
  },
  inputBox: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    border: `1px solid ${BORDER}`,
    background: "#FBFCFF",
    borderRadius: 12,
    padding: "9px 12px",
  },
  inputBoxError: {
    borderColor: "rgba(185,28,28,0.45)",
    background: "#FEF2F2",
  },
  input: {
    flex: 1,
    border: "none",
    outline: "none",
    background: "transparent",
    fontSize: 13.5,
    fontWeight: 750,
    color: TEXT,
    fontFamily: "inherit",
    minWidth: 0,
  },
  inputError: {
    fontSize: 11.5,
    fontWeight: 800,
    color: DANGER,
  },
};
