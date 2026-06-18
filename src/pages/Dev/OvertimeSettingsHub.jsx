import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  CalendarRange,
  Clock,
  Mail,
  Network,
  Save,
  Scissors,
  Search,
  UserMinus,
  UserPlus,
  Users,
  UserX,
} from "lucide-react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import {
  getOvertimeCoordinators,
  saveCoordinatorEmails,
} from "../../services/overtimeApi";
import {
  Badge,
  Brand,
  Chip,
  ChipsRow,
  Container,
  EmptyState,
  GhostButton,
  Hero,
  Main,
  ModuleCard,
  ModuleGrid,
  PrimaryButton,
  SecondaryButton,
  Sheet,
  Shell,
  Spinner,
  Topbar,
  useToast,
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
const ROLES = ["Coordinador", "Gerente"];
const DEFAULT_ROLE = "Coordinador";

function CoordinatorRow({ coordinator, value, role, onChange, onRoleChange, onExclude }) {
  const invalid = value.trim() !== "" && !EMAIL_RE.test(value.trim());

  return (
    <div style={styles.row}>
      <div style={styles.coordInfo}>
        <div style={styles.avatar}>
          <Users size={16} strokeWidth={2.2} />
        </div>
        <span style={styles.coordName}>{coordinator}</span>
      </div>

      <div style={styles.controls}>
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

        <label style={styles.selectWrap}>
          <span style={styles.selectLabel}>Rol</span>
          <select
            value={role}
            onChange={(e) => onRoleChange(coordinator, e.target.value)}
            style={styles.select}
            aria-label={`Rol de ${coordinator}`}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => onExclude(coordinator)}
          style={styles.excludeBtn}
          title="Excluir de la lista"
        >
          <UserMinus size={15} strokeWidth={2.4} />
          Excluir
        </button>
      </div>
    </div>
  );
}

export default function OvertimeSettingsHub() {
  const nav = useNavigate();
  const toast = useToast();

  const [coordModalOpen, setCoordModalOpen] = useState(false);
  const [excludedModalOpen, setExcludedModalOpen] = useState(false);
  const [feriadosModalOpen, setFeriadosModalOpen] = useState(false);
  const [feriadoDatePickerOpen, setFeriadoDatePickerOpen] = useState(false);
  const [feriadoNameModalOpen, setFeriadoNameModalOpen] = useState(false);
  const [feriadoSelectedDate, setFeriadoSelectedDate] = useState("");
  const [feriadoName, setFeriadoName] = useState("");
  const [feriados, setFeriados] = useState([]);
  const [feriadosLoading, setFeriadosLoading] = useState(false);

  // Fecha de corte (ciclo mensual de horas extra)
  const [cutoffModalOpen, setCutoffModalOpen] = useState(false);
  const [cutoffStart, setCutoffStart] = useState(""); // "YYYY-MM-DD"
  const [cutoffEnd, setCutoffEnd] = useState(""); // "YYYY-MM-DD"
  const [cutoffPicker, setCutoffPicker] = useState(null); // "start" | "end" | null
  const [cutoffPickerValue, setCutoffPickerValue] = useState("");
  const [cutoffSaving, setCutoffSaving] = useState(false);
  const [cutoffError, setCutoffError] = useState("");
  const [cutoffOk, setCutoffOk] = useState("");

  // Relación Coordinador → Gerente (segunda aprobación)
  const [relModalOpen, setRelModalOpen] = useState(false);
  const [relAssign, setRelAssign] = useState({}); // { [coordinatorName]: managerName }
  const [relLoading, setRelLoading] = useState(true);
  const [relSaving, setRelSaving] = useState(false);
  const [relError, setRelError] = useState("");
  const [relOk, setRelOk] = useState("");
  const [relSearch, setRelSearch] = useState("");

  useEffect(() => {
    const ref = doc(db, "overtimeConfig", "managerRelations");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data();
        const list = Array.isArray(data?.relations) ? data.relations : [];
        setRelAssign(
          list.reduce((acc, r) => {
            if (r?.coordinatorName) acc[r.coordinatorName] = r.managerName || "";
            return acc;
          }, {})
        );
        setRelLoading(false);
      },
      (err) => {
        console.error("Error cargando relaciones:", err);
        setRelLoading(false);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const ref = collection(db, "feriadosAnuales");
    const unsub = onSnapshot(
      query(ref, orderBy("date", "asc")),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setFeriados(list);
      },
      (err) => console.error("Error cargando feriados:", err)
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const ref = doc(db, "overtimeConfig", "cutoffDates");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data();
        setCutoffStart(data?.startDate || "");
        setCutoffEnd(data?.endDate || "");
      },
      (err) => console.error("Error cargando fechas de corte:", err)
    );
    return () => unsub();
  }, []);

  const dayOf = (dateStr) =>
    dateStr ? new Date(dateStr + "T12:00:00").getDate() : null;

  const pad2 = (n) => String(n).padStart(2, "0");
  const fmtDMY = (d) =>
    d ? `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}` : "";

  // Calcula los periodos de corte: el ACTUAL (el que contiene hoy) y el PRÓXIMO.
  // El final del corte cae en el mes siguiente al inicio cuando su día es menor
  // (ej: inicio 21 → final 20 del mes siguiente). El periodo activo es aquel cuyo
  // final es la próxima ocurrencia de endDay a partir de hoy.
  const cutoffDates = useMemo(() => {
    const startDay = dayOf(cutoffStart);
    const endDay = dayOf(cutoffEnd);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let actStart = null;
    let actEnd = null;
    let nextStart = null;
    let nextEnd = null;

    // Deriva el inicio de un periodo a partir de su fecha de final.
    const startFor = (endDate) => {
      if (!startDay || !endDate) return null;
      return startDay <= endDay
        ? new Date(endDate.getFullYear(), endDate.getMonth(), startDay)
        : new Date(endDate.getFullYear(), endDate.getMonth() - 1, startDay);
    };

    if (endDay) {
      actEnd = new Date(today.getFullYear(), today.getMonth(), endDay);
      if (actEnd < today) {
        actEnd = new Date(today.getFullYear(), today.getMonth() + 1, endDay);
      }
      nextEnd = new Date(actEnd.getFullYear(), actEnd.getMonth() + 1, endDay);
      actStart = startFor(actEnd);
      nextStart = startFor(nextEnd);
    } else if (startDay) {
      // Sin final definido: aproximar inicio del mes actual y del siguiente.
      actStart = new Date(today.getFullYear(), today.getMonth(), startDay);
      nextStart = new Date(today.getFullYear(), today.getMonth() + 1, startDay);
    }

    return { actStart, actEnd, nextStart, nextEnd };
  }, [cutoffStart, cutoffEnd]);

  const dayLabel = (dateStr) => {
    const d = dayOf(dateStr);
    return d ? `Día ${d}` : "Sin definir";
  };

  // Etiqueta de contexto del mes para la fecha "próxima".
  const monthContext = (d) => {
    if (!d) return "";
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      ? "del mes actual"
      : "del siguiente mes";
  };

  const cutoffSummary =
    cutoffStart && cutoffEnd
      ? `${dayOf(cutoffEnd)} → ${dayOf(cutoffStart)}`
      : "Sin definir";

  const handleSaveCutoff = async () => {
    setCutoffSaving(true);
    setCutoffError("");
    setCutoffOk("");
    try {
      await setDoc(doc(db, "overtimeConfig", "cutoffDates"), {
        startDate: cutoffStart || null,
        endDate: cutoffEnd || null,
        startDay: dayOf(cutoffStart),
        endDay: dayOf(cutoffEnd),
        updatedAt: new Date().toISOString(),
        updatedBy: auth.currentUser?.uid || null,
      });
      setCutoffOk("Fechas de corte guardadas correctamente.");
    } catch (e) {
      console.error("Error guardando fechas de corte:", e);
      setCutoffError(
        e.message || "No se pudieron guardar las fechas. Revisá permisos de Firestore."
      );
    } finally {
      setCutoffSaving(false);
    }
  };

  const handleAddFeriado = async (date, name) => {
    try {
      const docId = `${date}_${Date.now()}`;
      await setDoc(doc(db, "feriadosAnuales", docId), {
        date,
        name,
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser?.uid || null,
      });
    } catch (e) {
      console.error("Error guardando feriado:", e);
      toast.error("No se pudo guardar el feriado. Revisá permisos de Firestore.");
    }
  };

  const handleDeleteFeriado = async (feriadoId) => {
    try {
      await deleteDoc(doc(db, "feriadosAnuales", feriadoId));
    } catch (e) {
      console.error("Error eliminando feriado:", e);
      toast.error("No se pudo eliminar el feriado. Revisá permisos de Firestore.");
    }
  };

  const [coordinators, setCoordinators] = useState([]); // [{ name, email, role, excluded }]
  const [emails, setEmails] = useState({}); // { [name]: email }
  const [roles, setRoles] = useState({}); // { [name]: "Coordinador" | "Gerente" }
  const [excluded, setExcluded] = useState({}); // { [name]: boolean }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all"); // "all" | "Coordinador" | "Gerente"

  const loadCoordinators = async () => {
    setLoading(true);
    setError("");
    setOkMsg("");
    try {
      const res = await getOvertimeCoordinators();
      const list = res.coordinators || [];
      setCoordinators(list);
      setEmails(
        list.reduce((acc, c) => {
          acc[c.name] = c.email || "";
          return acc;
        }, {})
      );
      setRoles(
        list.reduce((acc, c) => {
          acc[c.name] = ROLES.includes(c.role) ? c.role : DEFAULT_ROLE;
          return acc;
        }, {})
      );
      setExcluded(
        list.reduce((acc, c) => {
          acc[c.name] = !!c.excluded;
          return acc;
        }, {})
      );
    } catch (e) {
      console.error("Error cargando coordinadores:", e);
      setError(e.message || "No se pudieron cargar los coordinadores. Intentá de nuevo.");
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

  const handleRoleChange = (name, value) => {
    setOkMsg("");
    setRoles((prev) => ({ ...prev, [name]: value }));
  };

  const handleExclude = (name) => {
    setOkMsg("");
    setExcluded((prev) => ({ ...prev, [name]: true }));
  };

  const handleInclude = (name) => {
    setOkMsg("");
    setExcluded((prev) => ({ ...prev, [name]: false }));
  };

  const activeCoordinators = useMemo(
    () => coordinators.filter((c) => !excluded[c.name]),
    [coordinators, excluded]
  );

  const excludedCoordinators = useMemo(
    () => coordinators.filter((c) => excluded[c.name]),
    [coordinators, excluded]
  );

  const roleOf = (name) => roles[name] || DEFAULT_ROLE;

  const roleCounts = useMemo(() => {
    const counts = { Coordinador: 0, Gerente: 0 };
    activeCoordinators.forEach((c) => {
      counts[roleOf(c.name)] = (counts[roleOf(c.name)] || 0) + 1;
    });
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCoordinators, roles]);

  const term = searchQuery.trim().toLowerCase();
  const filtered = useMemo(() => {
    return activeCoordinators.filter((c) => {
      if (roleFilter !== "all" && roleOf(c.name) !== roleFilter) return false;
      if (term && !c.name.toLowerCase().includes(term)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCoordinators, roles, roleFilter, term]);

  const configuredCount = useMemo(
    () => activeCoordinators.filter((c) => (emails[c.name] || "").trim() !== "").length,
    [activeCoordinators, emails]
  );

  const hasInvalid = useMemo(
    () =>
      Object.values(emails).some(
        (v) => v.trim() !== "" && !EMAIL_RE.test(v.trim())
      ),
    [emails]
  );

  const openCoordModal = () => {
    setError("");
    setOkMsg("");
    setSearchQuery("");
    setRoleFilter("all");
    setCoordModalOpen(true);
  };

  // --- Relación Coordinador → Gerente ---
  const managers = useMemo(
    () => activeCoordinators.filter((c) => roleOf(c.name) === "Gerente"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeCoordinators, roles]
  );

  const coordsToAssign = useMemo(
    () => activeCoordinators.filter((c) => roleOf(c.name) === "Coordinador"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeCoordinators, roles]
  );

  const assignedCount = useMemo(
    () => coordsToAssign.filter((c) => (relAssign[c.name] || "").trim() !== "").length,
    [coordsToAssign, relAssign]
  );

  const relTerm = relSearch.trim().toLowerCase();
  const relFiltered = useMemo(
    () =>
      coordsToAssign.filter(
        (c) => !relTerm || c.name.toLowerCase().includes(relTerm)
      ),
    [coordsToAssign, relTerm]
  );

  const relSummary = loading || relLoading
    ? "…"
    : `${assignedCount}/${coordsToAssign.length}`;

  const openRelModal = () => {
    setRelError("");
    setRelOk("");
    setRelSearch("");
    setRelModalOpen(true);
  };

  const handleAssignChange = (coordName, managerName) => {
    setRelOk("");
    setRelAssign((prev) => ({ ...prev, [coordName]: managerName }));
  };

  const handleSaveRelations = async () => {
    setRelSaving(true);
    setRelError("");
    setRelOk("");
    try {
      const relations = coordsToAssign
        .filter((c) => (relAssign[c.name] || "").trim() !== "")
        .map((c) => {
          const mgrName = relAssign[c.name];
          const mgr = managers.find((m) => m.name === mgrName);
          return {
            coordinatorName: c.name,
            coordinatorEmail: (emails[c.name] || c.email || "").trim(),
            managerName: mgrName,
            managerEmail: (mgr ? emails[mgr.name] || mgr.email || "" : "").trim(),
          };
        });
      await setDoc(doc(db, "overtimeConfig", "managerRelations"), {
        relations,
        updatedAt: new Date().toISOString(),
        updatedBy: auth.currentUser?.uid || null,
      });
      setRelOk("Relaciones guardadas correctamente.");
    } catch (e) {
      console.error("Error guardando relaciones:", e);
      setRelError(
        e.message || "No se pudieron guardar las relaciones. Revisá permisos de Firestore."
      );
    } finally {
      setRelSaving(false);
    }
  };

  const handleSave = async () => {
    if (hasInvalid) {
      setError("Corregí los correos inválidos antes de guardar.");
      return;
    }
    setSaving(true);
    setError("");
    setOkMsg("");
    try {
      const payload = coordinators.map((c) => ({
        name: c.name,
        email: (emails[c.name] || "").trim(),
        role: roles[c.name] || DEFAULT_ROLE,
        excluded: !!excluded[c.name],
      }));
      await saveCoordinatorEmails(payload);
      setOkMsg("Configuración guardada correctamente.");
    } catch (e) {
      console.error("Error guardando correos:", e);
      setError(e.message || "No se pudo guardar la configuración. Intentá de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const coordSummary = loading
    ? "…"
    : `${configuredCount}/${activeCoordinators.length}`;

  return (
    <Shell>
      <Topbar>
        <Brand
          icon={Clock}
          title="Configuración Horas Extras"
          subtitle="Parámetros del módulo"
          onClick={() => nav("/dev/config-modulos")}
        />
        <Topbar.Right>
          <GhostButton icon={ArrowLeft} onClick={() => nav("/dev/config-modulos")}>
            Volver
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container>
          <Hero
            kicker="Configuración"
            title="Configuración de Módulo Horas Extras"
            subtitle="Gestioná los parámetros del módulo de horas extra. Elegí una configuración para editarla."
            badge={<Badge icon={Clock}>Módulo Horas Extra</Badge>}
          />

          <ModuleGrid>
            <ModuleCard
              title="Coordinadores"
              desc="Asigná un correo y rol a cada coordinador. Se usa para enrutar y filtrar las aprobaciones de horas extra."
              icon={Users}
              tone="accent"
              tag={`${coordSummary} con correo`}
              cta="Configurar coordinadores"
              onClick={openCoordModal}
            />
            <ModuleCard
              title="Feriados anuales"
              desc="Definí los días feriados del año para el cálculo correcto de horas extra."
              icon={Calendar}
              tone="accent"
              cta="Configurar feriados anuales"
              onClick={() => setFeriadosModalOpen(true)}
            />
            <ModuleCard
              title="Relación Coordinador–Gerente"
              desc="Asigná a cada coordinador el gerente que confirmará sus aprobaciones de horas extra antes del pago."
              icon={Network}
              tone="accent"
              tag={`${relSummary} asignados`}
              cta="Configurar relaciones"
              onClick={openRelModal}
            />
            <ModuleCard
              title="Fecha de corte"
              desc="Definí el día de inicio y final del corte mensual de horas extra. El corte funciona por días del mes (ej: cierra el 20 y reinicia el 21)."
              icon={CalendarRange}
              tone="accent"
              tag={`Corte: ${cutoffSummary}`}
              cta="Configurar fecha de corte"
              onClick={() => {
                setCutoffError("");
                setCutoffOk("");
                setCutoffModalOpen(true);
              }}
            />
          </ModuleGrid>
        </Container>
      </Main>

      {/* Modal principal: coordinadores activos */}
      <Sheet
        open={coordModalOpen}
        onClose={() => setCoordModalOpen(false)}
        title="Correos de coordinadores"
        placement="center"
        maxWidth={820}
      >
        <Sheet.Body>
          <div style={styles.modalTop}>
            <p style={styles.modalIntro}>
              Asigná un correo y rol a cada coordinador. Se usará para enrutar y
              filtrar las aprobaciones de horas extra.
            </p>
            <button
              type="button"
              onClick={() => setExcludedModalOpen(true)}
              style={styles.excludedToggle}
              title="Ver coordinadores excluidos"
            >
              <UserX size={15} strokeWidth={2.4} />
              Excluidos ({excludedCoordinators.length})
            </button>
          </div>

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
                <PrimaryButton icon={Search} onClick={loadCoordinators}>
                  Recargar
                </PrimaryButton>
              }
            />
          ) : (
            <>
              <ChipsRow>
                <Chip
                  active={roleFilter === "all"}
                  onClick={() => setRoleFilter("all")}
                >
                  Todos ({activeCoordinators.length})
                </Chip>
                <Chip
                  active={roleFilter === "Coordinador"}
                  onClick={() => setRoleFilter("Coordinador")}
                >
                  Coordinadores ({roleCounts.Coordinador || 0})
                </Chip>
                <Chip
                  active={roleFilter === "Gerente"}
                  onClick={() => setRoleFilter("Gerente")}
                >
                  Gerentes ({roleCounts.Gerente || 0})
                </Chip>
              </ChipsRow>

              <div style={styles.searchWrap}>
                <Search size={16} strokeWidth={2.2} color={SLATE} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar coordinador…"
                  style={styles.searchInput}
                  aria-label="Buscar coordinador"
                />
              </div>

              {filtered.length === 0 ? (
                <EmptyState
                  icon={Search}
                  title="Sin resultados"
                  description={
                    term
                      ? `No hay coordinadores que coincidan con “${searchQuery}”.`
                      : roleFilter !== "all"
                      ? `No hay ${roleFilter === "Gerente" ? "gerentes" : "coordinadores"} en la lista.`
                      : "Todos los coordinadores están excluidos."
                  }
                />
              ) : (
                <div style={styles.modalList}>
                  {filtered.map((c) => (
                    <CoordinatorRow
                      key={c.name}
                      coordinator={c.name}
                      value={emails[c.name] || ""}
                      role={roles[c.name] || DEFAULT_ROLE}
                      onChange={handleEmailChange}
                      onRoleChange={handleRoleChange}
                      onExclude={handleExclude}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </Sheet.Body>

        <Sheet.Actions>
          <SecondaryButton onClick={() => setCoordModalOpen(false)}>
            Cerrar
          </SecondaryButton>
          <PrimaryButton
            icon={Save}
            onClick={handleSave}
            loading={saving}
            disabled={loading || saving || coordinators.length === 0}
          >
            Guardar cambios
          </PrimaryButton>
        </Sheet.Actions>
      </Sheet>

      {/* Sub-modal: coordinadores excluidos */}
      <Sheet
        open={excludedModalOpen}
        onClose={() => setExcludedModalOpen(false)}
        title="Coordinadores excluidos"
        placement="center"
        maxWidth={640}
      >
        <Sheet.Body>
          <p style={styles.modalIntro}>
            Estos coordinadores no aparecen en la lista de configuración.
            Incluilos de nuevo para asignarles correo y rol. Recordá guardar los
            cambios.
          </p>

          {excludedCoordinators.length === 0 ? (
            <EmptyState
              icon={UserX}
              title="Sin excluidos"
              description="No hay coordinadores excluidos por el momento."
            />
          ) : (
            <div style={styles.modalList}>
              {excludedCoordinators.map((c) => (
                <div key={c.name} style={styles.row}>
                  <div style={styles.coordInfo}>
                    <div style={styles.avatar}>
                      <Users size={16} strokeWidth={2.2} />
                    </div>
                    <div style={styles.excludedInfo}>
                      <span style={styles.coordName}>{c.name}</span>
                      <span style={styles.roleBadge}>
                        {roles[c.name] || DEFAULT_ROLE}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleInclude(c.name)}
                    style={styles.includeBtn}
                    title="Incluir en la lista"
                  >
                    <UserPlus size={15} strokeWidth={2.4} />
                    Incluir
                  </button>
                </div>
              ))}
            </div>
          )}
        </Sheet.Body>

        <Sheet.Actions>
          <SecondaryButton onClick={() => setExcludedModalOpen(false)}>
            Cerrar
          </SecondaryButton>
          <span />
        </Sheet.Actions>
      </Sheet>

      {/* Modal: feriados anuales */}
      <Sheet
        open={feriadosModalOpen}
        onClose={() => setFeriadosModalOpen(false)}
        title="Feriados anuales"
        placement="center"
        maxWidth={560}
      >
        <Sheet.Body>
          <p style={styles.modalIntro}>
            Agregá los días feriados del año. Se usarán para el cálculo de horas extra.
          </p>

          <button
            type="button"
            onClick={() => {
              setFeriadoSelectedDate("");
              setFeriadoDatePickerOpen(true);
            }}
            style={styles.includeBtn}
          >
            <Calendar size={15} strokeWidth={2.4} />
            Agregar día
          </button>

          {feriados.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="Sin feriados"
              description="No se han agregado feriados todavía."
            />
          ) : (
            <div style={styles.modalList}>
              {feriados
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((f, i) => (
                  <div key={`${f.date}-${i}`} style={styles.row}>
                    <div style={styles.coordInfo}>
                      <div style={styles.avatar}>
                        <Calendar size={16} strokeWidth={2.2} />
                      </div>
                      <div style={styles.excludedInfo}>
                        <span style={styles.coordName}>{f.name}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: SLATE }}>
                          {new Date(f.date + "T12:00:00").toLocaleDateString("es-CR", {
                            day: "numeric",
                            month: "long",
                          })}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteFeriado(f.id)}
                      style={styles.excludeBtn}
                      title="Eliminar feriado"
                    >
                      <UserMinus size={15} strokeWidth={2.4} />
                      Eliminar
                    </button>
                  </div>
                ))}
            </div>
          )}
        </Sheet.Body>
        <Sheet.Actions>
          <SecondaryButton onClick={() => setFeriadosModalOpen(false)}>
            Cerrar
          </SecondaryButton>
          <span />
        </Sheet.Actions>
      </Sheet>

      {/* Sub-modal: seleccionar fecha */}
      <Sheet
        open={feriadoDatePickerOpen}
        onClose={() => setFeriadoDatePickerOpen(false)}
        title="Seleccionar fecha"
        placement="center"
        maxWidth={380}
      >
        <Sheet.Body>
          <p style={styles.modalIntro}>
            Elegí el día feriado en el calendario.
          </p>
          <input
            type="date"
            value={feriadoSelectedDate}
            onChange={(e) => setFeriadoSelectedDate(e.target.value)}
            style={styles.select}
          />
        </Sheet.Body>
        <Sheet.Actions>
          <SecondaryButton onClick={() => setFeriadoDatePickerOpen(false)}>
            Cancelar
          </SecondaryButton>
          <PrimaryButton
            disabled={!feriadoSelectedDate}
            onClick={() => {
              setFeriadoDatePickerOpen(false);
              setFeriadoName("");
              setFeriadoNameModalOpen(true);
            }}
          >
            Continuar
          </PrimaryButton>
        </Sheet.Actions>
      </Sheet>

      {/* Sub-modal: nombre del feriado */}
      <Sheet
        open={feriadoNameModalOpen}
        onClose={() => setFeriadoNameModalOpen(false)}
        title="Nombre del feriado"
        placement="center"
        maxWidth={420}
      >
        <Sheet.Body>
          <p style={styles.modalIntro}>
            Fecha seleccionada:{" "}
            <strong>
              {feriadoSelectedDate
                ? new Date(feriadoSelectedDate + "T12:00:00").toLocaleDateString("es-CR", {
                    day: "numeric",
                    month: "long",
                  })
                : "—"}
            </strong>
          </p>
          <input
            type="text"
            value={feriadoName}
            onChange={(e) => setFeriadoName(e.target.value)}
            placeholder="Ej: Día de la Independencia"
            style={{ ...styles.input, width: "100%", boxSizing: "border-box", padding: "11px 14px", borderRadius: 14, border: `1px solid ${BORDER}`, background: "#FBFCFF" }}
          />
        </Sheet.Body>
        <Sheet.Actions>
          <SecondaryButton onClick={() => setFeriadoNameModalOpen(false)}>
            Cancelar
          </SecondaryButton>
          <PrimaryButton
            disabled={!feriadoName.trim()}
            onClick={async () => {
              await handleAddFeriado(feriadoSelectedDate, feriadoName.trim());
              setFeriadoNameModalOpen(false);
              setFeriadoSelectedDate("");
              setFeriadoName("");
            }}
          >
            Guardar feriado
          </PrimaryButton>
        </Sheet.Actions>
      </Sheet>

      {/* Modal: fecha de corte */}
      <Sheet
        open={cutoffModalOpen}
        onClose={() => setCutoffModalOpen(false)}
        title="Fecha de corte"
        placement="center"
        maxWidth={520}
      >
        <Sheet.Body>
          <p style={styles.modalIntro}>
            Definí el inicio y el final del corte mensual. El corte funciona por
            días del mes: por ejemplo, el corte cierra el día 20 y reinicia el día 21.
          </p>

          {!!cutoffError && <div style={styles.errorBanner}>{cutoffError}</div>}
          {!!cutoffOk && <div style={styles.okBanner}>{cutoffOk}</div>}

          <div style={styles.modalList}>
            <div style={styles.row}>
              <div style={styles.coordInfo}>
                <div style={styles.avatar}>
                  <Calendar size={16} strokeWidth={2.2} />
                </div>
                <div style={styles.excludedInfo}>
                  <span style={styles.coordName}>Inicio del corte</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: SLATE }}>
                    {cutoffStart
                      ? `${dayLabel(cutoffStart)} · ${monthContext(cutoffDates.nextStart)}`
                      : "Sin definir"}
                  </span>
                  {cutoffStart && (
                    <span style={styles.cutoffDetail}>
                      Próximo inicio:{" "}
                      <strong style={styles.cutoffNext}>
                        {fmtDMY(cutoffDates.nextStart)}
                      </strong>
                      {cutoffDates.actStart && (
                        <>
                          {" · Inicio actual: "}
                          <strong style={styles.cutoffCurrent}>
                            {fmtDMY(cutoffDates.actStart)}
                          </strong>
                        </>
                      )}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCutoffPicker("start");
                  setCutoffPickerValue(cutoffStart);
                }}
                style={styles.includeBtn}
              >
                <Calendar size={15} strokeWidth={2.4} />
                Elegir día
              </button>
            </div>

            <div style={styles.row}>
              <div style={styles.coordInfo}>
                <div style={styles.avatar}>
                  <Scissors size={16} strokeWidth={2.2} />
                </div>
                <div style={styles.excludedInfo}>
                  <span style={styles.coordName}>Final del corte</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: SLATE }}>
                    {cutoffEnd
                      ? `${dayLabel(cutoffEnd)} · ${monthContext(cutoffDates.nextEnd)}`
                      : "Sin definir"}
                  </span>
                  {cutoffEnd && (
                    <span style={styles.cutoffDetail}>
                      Próximo final:{" "}
                      <strong style={styles.cutoffNext}>
                        {fmtDMY(cutoffDates.nextEnd)}
                      </strong>
                      {cutoffDates.actEnd && (
                        <>
                          {" · Final actual: "}
                          <strong style={styles.cutoffCurrent}>
                            {fmtDMY(cutoffDates.actEnd)}
                          </strong>
                        </>
                      )}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCutoffPicker("end");
                  setCutoffPickerValue(cutoffEnd);
                }}
                style={styles.includeBtn}
              >
                <Calendar size={15} strokeWidth={2.4} />
                Elegir día
              </button>
            </div>
          </div>
        </Sheet.Body>
        <Sheet.Actions>
          <SecondaryButton onClick={() => setCutoffModalOpen(false)}>
            Cerrar
          </SecondaryButton>
          <PrimaryButton
            icon={Save}
            onClick={handleSaveCutoff}
            loading={cutoffSaving}
            disabled={cutoffSaving}
          >
            Guardar fechas
          </PrimaryButton>
        </Sheet.Actions>
      </Sheet>

      {/* Sub-modal: seleccionar día de corte */}
      <Sheet
        open={cutoffPicker !== null}
        onClose={() => setCutoffPicker(null)}
        title={
          cutoffPicker === "start" ? "Inicio del corte" : "Final del corte"
        }
        placement="center"
        maxWidth={380}
      >
        <Sheet.Body>
          <p style={styles.modalIntro}>
            Elegí el día en el calendario. El corte se aplica por día del mes.
          </p>
          <input
            type="date"
            value={cutoffPickerValue}
            onChange={(e) => setCutoffPickerValue(e.target.value)}
            style={styles.select}
          />
        </Sheet.Body>
        <Sheet.Actions>
          <SecondaryButton onClick={() => setCutoffPicker(null)}>
            Cancelar
          </SecondaryButton>
          <PrimaryButton
            disabled={!cutoffPickerValue}
            onClick={() => {
              setCutoffOk("");
              if (cutoffPicker === "start") setCutoffStart(cutoffPickerValue);
              else if (cutoffPicker === "end") setCutoffEnd(cutoffPickerValue);
              setCutoffPicker(null);
            }}
          >
            Confirmar día
          </PrimaryButton>
        </Sheet.Actions>
      </Sheet>

      {/* Modal: relación coordinador → gerente */}
      <Sheet
        open={relModalOpen}
        onClose={() => setRelModalOpen(false)}
        title="Relación Coordinador–Gerente"
        placement="center"
        maxWidth={760}
      >
        <Sheet.Body>
          <p style={styles.modalIntro}>
            Asigná a cada coordinador el gerente que confirmará sus aprobaciones
            de horas extra antes del pago.
          </p>

          {!!relError && <div style={styles.errorBanner}>{relError}</div>}
          {!!relOk && <div style={styles.okBanner}>{relOk}</div>}

          {loading || relLoading ? (
            <Spinner label="Cargando relaciones…" />
          ) : managers.length === 0 ? (
            <EmptyState
              icon={UserX}
              title="Sin gerentes"
              description="No hay coordinadores con rol Gerente. Asigná el rol Gerente en “Coordinadores” antes de crear relaciones."
            />
          ) : coordsToAssign.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Sin coordinadores"
              description="No hay coordinadores con rol Coordinador para asignar."
            />
          ) : (
            <>
              <div style={styles.searchWrap}>
                <Search size={16} strokeWidth={2.2} color={SLATE} />
                <input
                  type="text"
                  value={relSearch}
                  onChange={(e) => setRelSearch(e.target.value)}
                  placeholder="Buscar coordinador…"
                  style={styles.searchInput}
                  aria-label="Buscar coordinador"
                />
              </div>

              {relFiltered.length === 0 ? (
                <EmptyState
                  icon={Search}
                  title="Sin resultados"
                  description={`No hay coordinadores que coincidan con “${relSearch}”.`}
                />
              ) : (
                <div style={styles.modalList}>
                  {relFiltered.map((c) => (
                    <div key={c.name} style={styles.row}>
                      <div style={styles.coordInfo}>
                        <div style={styles.avatar}>
                          <Users size={16} strokeWidth={2.2} />
                        </div>
                        <span style={styles.coordName}>{c.name}</span>
                      </div>

                      <label style={styles.selectWrap}>
                        <span style={styles.selectLabel}>Gerente</span>
                        <select
                          value={relAssign[c.name] || ""}
                          onChange={(e) => handleAssignChange(c.name, e.target.value)}
                          style={styles.select}
                          aria-label={`Gerente de ${c.name}`}
                        >
                          <option value="">Sin asignar</option>
                          {managers.map((m) => (
                            <option key={m.name} value={m.name}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Sheet.Body>

        <Sheet.Actions>
          <SecondaryButton onClick={() => setRelModalOpen(false)}>
            Cerrar
          </SecondaryButton>
          <PrimaryButton
            icon={Save}
            onClick={handleSaveRelations}
            loading={relSaving}
            disabled={
              loading ||
              relLoading ||
              relSaving ||
              managers.length === 0 ||
              coordsToAssign.length === 0
            }
          >
            Guardar relaciones
          </PrimaryButton>
        </Sheet.Actions>
      </Sheet>
    </Shell>
  );
}

const styles = {
  modalTop: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  modalIntro: {
    margin: 0,
    color: SLATE,
    fontWeight: 650,
    fontSize: 13,
    lineHeight: 1.45,
    flex: "1 1 280px",
    minWidth: 0,
  },
  excludedToggle: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 14px",
    borderRadius: 999,
    border: `1px solid ${BORDER}`,
    background: "#F2F4FB",
    color: TEXT,
    fontWeight: 900,
    fontSize: 12.5,
    cursor: "pointer",
    fontFamily: "inherit",
    flexShrink: 0,
  },
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
  modalList: {
    display: "grid",
    gap: 10,
    maxHeight: "min(52vh, 460px)",
    overflowY: "auto",
    paddingRight: 4,
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
    flex: "1 1 180px",
  },
  excludedInfo: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
  },
  roleBadge: {
    alignSelf: "flex-start",
    padding: "2px 10px",
    borderRadius: 999,
    background: "rgba(8,159,138,0.12)",
    color: ACCENT,
    fontWeight: 850,
    fontSize: 11,
  },
  cutoffDetail: {
    fontSize: 12,
    fontWeight: 700,
    color: SLATE,
    lineHeight: 1.4,
  },
  cutoffNext: {
    color: ACCENT,
    fontWeight: 900,
  },
  cutoffCurrent: {
    color: TEXT,
    fontWeight: 900,
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
  controls: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    flex: "1 1 360px",
    justifyContent: "flex-end",
  },
  inputWrap: {
    display: "grid",
    gap: 4,
    flex: "1 1 220px",
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
  selectWrap: {
    display: "grid",
    gap: 4,
    flexShrink: 0,
  },
  selectLabel: {
    fontSize: 11,
    fontWeight: 850,
    color: SLATE,
    paddingLeft: 2,
  },
  select: {
    border: `1px solid ${BORDER}`,
    background: "#FBFCFF",
    borderRadius: 12,
    padding: "9px 12px",
    fontSize: 13,
    fontWeight: 800,
    color: TEXT,
    fontFamily: "inherit",
    cursor: "pointer",
    minWidth: 130,
  },
  excludeBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "9px 13px",
    borderRadius: 12,
    border: "1px solid rgba(185,28,28,0.30)",
    background: "#FEF2F2",
    color: DANGER,
    fontWeight: 850,
    fontSize: 12.5,
    cursor: "pointer",
    fontFamily: "inherit",
    flexShrink: 0,
    alignSelf: "flex-end",
    height: 40,
  },
  includeBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "9px 14px",
    borderRadius: 12,
    border: "1px solid rgba(8,159,138,0.30)",
    background: "#F3FBF9",
    color: ACCENT,
    fontWeight: 850,
    fontSize: 12.5,
    cursor: "pointer",
    fontFamily: "inherit",
    flexShrink: 0,
  },
};
