// screens/AccionDescarga.jsx
import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckSquare,
  ChevronRight,
  Clock,
  Inbox,
  Layers,
  ListChecks,
  Loader,
  Lock,
  Package,
  ShieldAlert,
  SlidersHorizontal,
  Square,
  Trash2,
  Truck,
  User,
  X,
} from "lucide-react";
import {
  Brand,
  Container,
  EmptyState,
  ErrorState,
  Field,
  GhostButton,
  Main,
  PrimaryButton,
  SearchInput,
  SecondaryButton,
  Sheet,
  Shell,
  Spinner,
  StatusPill,
  Topbar,
  useToast,
} from "../../../components/ui";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
  writeBatch,
} from "firebase/firestore";
import { EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { AuthCtx } from "../../../auth/AuthProvider";
import { auth, db } from "../../../firebase";
import { filterByUserScope } from "../../../utils/dataScope";
import imgAccionDescarga from "../../../assets/accionDescarga.png";
import {
  ACCENT,
  ACCENT_SOFT,
  BORDER,
  BG,
  DANGER,
  DANGER_BG,
  DANGER_BORDER,
  MUTED,
  SHADOW_CARD,
  SHADOW_CARD_HOVER,
  SHADOW_HERO,
  SHADOW_SOFT,
  SLATE,
  SURFACE,
  SURFACE_INSET,
  SURFACE_SOFT,
  TEXT,
} from "../../../styles/theme";

/* ===================== Helpers ===================== */
function toDateSafe(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function getEstado(item) {
  const completedAtValue = item?.completedAt ?? item?.completeAt;
  const started = !!item?.startedAt;
  const completed = !!completedAtValue;
  if (completed) return "Completada";
  if (started) return "En proceso";
  return "Pendiente";
}

function estadoTone(estado) {
  if (estado === "Completada") return "ok";
  if (estado === "En proceso") return "warn";
  return "neutral";
}

function parseYMD(ymd) {
  if (!ymd) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd).trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  return isNaN(dt.getTime()) ? null : dt;
}

function endOfDay(date) {
  if (!date) return null;
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function formatDateTimeSafe(ts) {
  if (!ts) return "—";
  const d = typeof ts?.toDate === "function" ? ts.toDate() : toDateSafe(ts);
  if (!d) return "—";
  let s = d.toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  s = s.replace(/\u00A0/g, " ").trim();
  s = s
    .replace(/\bAM\b/i, "a. m.")
    .replace(/\bPM\b/i, "p. m.")
    .replace(/\ba\.m\.\b/i, "a. m.")
    .replace(/\bp\.m\.\b/i, "p. m.")
    .replace(/(\b[a-záéíóúñ]{3,})\./gi, "$1");
  return s;
}

/* ===================== Estado config ===================== */
const ESTADOS = [
  { key: "Todos", label: "Todos", icon: ListChecks },
  { key: "Pendiente", label: "Pendiente", icon: Clock },
  { key: "En proceso", label: "En proceso", icon: Loader },
  { key: "Completada", label: "Completada", icon: ListChecks },
];

/* ===================== Presentational parts ===================== */
function MetaItem({ Icon, children, title }) {
  return (
    <span style={ui.metaItem} title={title}>
      {React.createElement(Icon, {
        size: 13,
        strokeWidth: 2.2,
        style: { color: MUTED, flexShrink: 0 },
      })}
      <span style={ui.metaTxt}>{children}</span>
    </span>
  );
}

function RowCard({ item, hovered, onHover, onOpen, selectable, selected, onToggleSelect }) {
  const proveedor = item?.proveedorNombre || "(sin proveedor)";
  const anden = item?.idAnden || "—";

  const creadoPor = item?.creadoPorNombre || "—";
  const aperturaId = item?.aperturaId || "—";
  const fecha = formatDateTimeSafe(item?.creadoAt);

  const estado = getEstado(item);
  const tipo = item?.tipoDescarga || "—";
  const bultos = item?.cantidadBultos ? String(item.cantidadBultos) : "—";
  const dur = item?.totalTimeTxt || "—";

  const isHover = hovered === item.id;
  const handleActivate = () => (selectable ? onToggleSelect(item.id) : onOpen(item.id));

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selectable ? selected : undefined}
      onClick={handleActivate}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), handleActivate())}
      onMouseEnter={() => onHover(item.id)}
      onMouseLeave={() => onHover(null)}
      style={{
        ...ui.rowCard,
        ...(isHover ? ui.rowCardHover : {}),
        ...(selectable && selected ? ui.rowCardSelected : {}),
      }}
    >
      {selectable ? (
        <span style={ui.rowCheck} aria-hidden="true">
          {selected ? (
            <CheckSquare size={22} strokeWidth={2.2} color={ACCENT} />
          ) : (
            <Square size={22} strokeWidth={2.2} color={MUTED} />
          )}
        </span>
      ) : (
        <span style={ui.rowAvatar} aria-hidden="true">
          <Truck size={20} strokeWidth={2.2} color={ACCENT} />
        </span>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={ui.rowTop}>
          <div style={ui.rowTitle} title={proveedor}>
            {proveedor}
          </div>
          <StatusPill tone={estadoTone(estado)}>{estado}</StatusPill>
        </div>

        <div style={ui.rowMetaGrid}>
          <MetaItem Icon={Layers} title={`Andén ${anden}`}>
            Andén {anden}
          </MetaItem>
          <MetaItem Icon={Package} title={`Tipo: ${tipo} · Bultos: ${bultos}`}>
            {tipo} · {bultos} bultos
          </MetaItem>
          <MetaItem Icon={Clock} title={`Tiempo: ${dur}`}>
            {dur}
          </MetaItem>
          <MetaItem Icon={User} title={`Creado por: ${creadoPor}`}>
            {creadoPor}
          </MetaItem>
          <MetaItem Icon={Calendar} title={`${fecha} · Apertura: ${aperturaId}`}>
            {fecha}
          </MetaItem>
        </div>
      </div>

      {selectable ? null : (
        <ChevronRight
          size={22}
          strokeWidth={2.4}
          style={{ color: isHover ? ACCENT : MUTED, flexShrink: 0, transition: "color 120ms ease" }}
        />
      )}
    </div>
  );
}

/* ===================== Screen ===================== */
export default function AccionDescarga() {
  const nav = useNavigate();
  const authCtx = useContext(AuthCtx);
  const profile = authCtx?.profile || {};
  const authLoading = authCtx?.loading;
  const isDev = authCtx?.role === "dev";
  const toast = useToast();

  const [hovered, setHovered] = useState(null);

  // ── Herramientas dev (limpieza de datos) ──
  const [devSheetOpen, setDevSheetOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [devDesde, setDevDesde] = useState("");
  const [devHasta, setDevHasta] = useState("");
  // Confirmación con contraseña: { ids, label } | null
  const [pendingDelete, setPendingDelete] = useState(null);
  const [pwd, setPwd] = useState("");
  const [pwdError, setPwdError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [items, setItems] = useState([]);

  // filtros
  const [qText, setQText] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [fProveedor, setFProveedor] = useState("");
  const [fAnden, setFAnden] = useState("");
  const [fEstado, setFEstado] = useState("Todos");
  const [fDesde, setFDesde] = useState(""); // YYYY-MM-DD
  const [fHasta, setFHasta] = useState(""); // YYYY-MM-DD

  // Sheet (modal) filtros
  const [filtersOpen, setFiltersOpen] = useState(false);

  // realtime
  useEffect(() => {
    if (authLoading) return;
    // Reglas (sameTenantScopeData): la query debe filtrar por tenantId+company.
    // La bodega se aplica en memoria (filterByUserScope). Índice compuesto:
    // accion_descarga (tenantId, company, creadoAt DESC) — ver firestore.indexes.json.
    const q = query(
      collection(db, "accion_descarga"),
      where("tenantId", "==", String(profile?.tenantId || "")),
      where("company", "==", String(profile?.company || "")),
      orderBy("creadoAt", "desc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = filterByUserScope(
          snap.docs.map((d) => ({ id: d.id, ...d.data() })),
          profile?.tenantId,
          profile?.company,
          profile?.bodegaId
        );
        setItems(rows);
        setLoadError("");
        setLoading(false);
      },
      (err) => {
        console.error("accion_descarga onSnapshot error:", err);
        setItems([]);
        setLoadError("No se pudieron cargar las acciones de descarga.");
        setLoading(false);
      }
    );
    return () => unsub();
  }, [authLoading, profile?.tenantId, profile?.company, profile?.bodegaId]);

  // Debounce buscador
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(qText), 250);
    return () => clearTimeout(t);
  }, [qText]);

  // Conteo por estado (TOTAL)
  const estadoCounts = useMemo(() => {
    const counts = { Todos: items.length, Pendiente: 0, "En proceso": 0, Completada: 0 };
    for (const it of items) {
      const est = getEstado(it);
      if (counts[est] != null) counts[est] += 1;
    }
    return counts;
  }, [items]);

  // Filtrado final
  const filteredItems = useMemo(() => {
    const text = qDebounced.trim().toLowerCase();
    const prov = fProveedor.trim().toLowerCase();
    const anden = String(fAnden ?? "").trim();
    const desde = parseYMD(fDesde);
    const hasta = endOfDay(parseYMD(fHasta));

    return items.filter((it) => {
      const est = getEstado(it);
      if (fEstado !== "Todos" && est !== fEstado) return false;

      if (prov) {
        const p = String(it?.proveedorNombre ?? "").toLowerCase();
        if (!p.includes(prov)) return false;
      }

      if (anden) {
        const a = String(it?.idAnden ?? "").trim();
        if (a !== anden) return false;
      }

      const d = toDateSafe(it?.creadoAt);
      if (desde && (!d || d < desde)) return false;
      if (hasta && (!d || d > hasta)) return false;

      if (text) {
        const hay = [it?.proveedorNombre, it?.idAnden, it?.aperturaId]
          .map((x) => String(x ?? "").toLowerCase())
          .join(" · ");
        if (!hay.includes(text)) return false;
      }

      return true;
    });
  }, [items, qDebounced, fProveedor, fAnden, fEstado, fDesde, fHasta]);

  const advancedActive = [fProveedor, fAnden, fDesde, fHasta].filter(Boolean).length;
  const hasActiveFilters =
    fEstado !== "Todos" || !!qText || advancedActive > 0;

  const clearAll = () => {
    setQText("");
    setQDebounced("");
    setFProveedor("");
    setFAnden("");
    setFEstado("Todos");
    setFDesde("");
    setFHasta("");
  };

  const onCardOpen = (id) => {
    nav(`/recepcion/accion-descarga/${id}`);
  };

  /* ===================== Dev: limpieza de datos ===================== */
  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedIds(new Set(filteredItems.map((it) => it.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const enterSelectionMode = () => {
    setSelectionMode(true);
    setDevSheetOpen(false);
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    clearSelection();
  };

  // Acciones que caen dentro del rango de fecha configurado en el panel dev.
  const dateRangeMatches = useMemo(() => {
    const desde = parseYMD(devDesde);
    const hasta = endOfDay(parseYMD(devHasta));
    if (!desde && !hasta) return [];
    return items.filter((it) => {
      const d = toDateSafe(it?.creadoAt);
      if (!d) return false;
      if (desde && d < desde) return false;
      if (hasta && d > hasta) return false;
      return true;
    });
  }, [items, devDesde, devHasta]);

  // Abre el modal de confirmación con contraseña para una lista de ids.
  const requestDelete = (ids, label) => {
    if (!ids || ids.length === 0) return;
    setPwd("");
    setPwdError("");
    setPendingDelete({ ids, label });
  };

  const cancelDelete = () => {
    if (deleting) return;
    setPendingDelete(null);
    setPwd("");
    setPwdError("");
  };

  // Borra en lotes (máx. 400 por batch para no exceder el límite de Firestore).
  const performDelete = async (ids) => {
    const CHUNK = 400;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const batch = writeBatch(db);
      slice.forEach((id) => batch.delete(doc(db, "accion_descarga", id)));
      await batch.commit();
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    if (!pwd) {
      setPwdError("Ingresá tu contraseña.");
      return;
    }
    const currentUser = auth.currentUser;
    const email = currentUser?.email || authCtx?.user?.email;
    if (!currentUser || !email) {
      setPwdError("No se pudo verificar la sesión. Volvé a iniciar sesión.");
      return;
    }

    setDeleting(true);
    setPwdError("");
    try {
      // Reautenticación estricta con la contraseña del propio usuario dev.
      const cred = EmailAuthProvider.credential(email, pwd);
      await reauthenticateWithCredential(currentUser, cred);
    } catch (e) {
      console.warn("reauth error:", e?.code || e);
      const code = e?.code || "";
      if (
        code === "auth/wrong-password" ||
        code === "auth/invalid-credential" ||
        code === "auth/invalid-login-credentials"
      ) {
        setPwdError("Contraseña incorrecta.");
      } else if (code === "auth/too-many-requests") {
        setPwdError("Demasiados intentos. Esperá unos minutos e intentá de nuevo.");
      } else {
        setPwdError("No se pudo verificar la contraseña.");
      }
      setDeleting(false);
      return;
    }

    const ids = pendingDelete.ids;
    try {
      await performDelete(ids);
      toast.success(
        `${ids.length} ${ids.length === 1 ? "acción eliminada" : "acciones eliminadas"} correctamente.`
      );
      setPendingDelete(null);
      setPwd("");
      exitSelectionMode();
      setDevDesde("");
      setDevHasta("");
      setDevSheetOpen(false);
    } catch (e) {
      console.error("delete accion_descarga error:", e);
      const permission = e?.code === "permission-denied";
      toast.error(
        permission
          ? "No tenés permisos para eliminar estas acciones."
          : "No se pudieron eliminar algunas acciones."
      );
      setPwdError(
        permission ? "Permiso denegado por las reglas de seguridad." : "Ocurrió un error al eliminar."
      );
    } finally {
      setDeleting(false);
    }
  };

  /* ===================== UI Parts ===================== */

  // Píldoras de filtros activos (removibles individualmente)
  const activeChips = [];
  if (fProveedor)
    activeChips.push({ key: "prov", label: `Proveedor: ${fProveedor}`, clear: () => setFProveedor("") });
  if (fAnden)
    activeChips.push({ key: "anden", label: `Andén ${fAnden}`, clear: () => setFAnden("") });
  if (fDesde)
    activeChips.push({ key: "desde", label: `Desde ${fDesde}`, clear: () => setFDesde("") });
  if (fHasta)
    activeChips.push({ key: "hasta", label: `Hasta ${fHasta}`, clear: () => setFHasta("") });

  /* ===================== Render ===================== */
  return (
    <Shell>
      <Topbar>
        <Brand
          icon={Truck}
          title="Acciones de Descarga"
          subtitle="Listado y filtros"
          onClick={() => nav("/recepcion")}
        />
        <Topbar.Right>
          {isDev ? (
            <GhostButton
              icon={ShieldAlert}
              onClick={() => setDevSheetOpen(true)}
              style={{ borderColor: DANGER_BORDER, color: DANGER }}
            >
              Opciones dev
            </GhostButton>
          ) : null}
          <GhostButton icon={ArrowLeft} onClick={() => nav("/recepcion")}>
            Recepción
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main center>
        <Container style={ui.container}>
          {/* Mini-hero */}
          <div style={ui.heroMedia}>
            <div style={{ ...ui.heroMediaBg, backgroundImage: `url(${imgAccionDescarga})` }} />
            <div style={ui.heroMediaOverlay} />
            <div style={ui.heroMediaText}>
              <div style={ui.kickerRow}>
                <span style={ui.kickerDot} />
                <div style={ui.kicker}>Recepción</div>
                <span style={ui.badge}>Acciones</span>
              </div>
              <div style={ui.titleMini}>Acciones de Descarga</div>
              <div style={ui.subtitleMini}>Buscá, filtrá y abrí acciones en tiempo real.</div>
            </div>
          </div>

          {loadError ? (
            <ErrorState description={loadError} />
          ) : loading ? (
            <div style={ui.center}>
              <Spinner label="Cargando acciones…" />
            </div>
          ) : (
            <div style={ui.listWrap}>
              <div style={ui.stickyWrap}>
                {/* Barra de selección (modo dev) */}
                {selectionMode ? (
                  <div style={ui.selectionBar}>
                    <span style={ui.selectionCount}>
                      {selectedIds.size} de {filteredItems.length} seleccionadas
                    </span>
                    <div style={ui.selectionActions}>
                      <button type="button" style={ui.selPlainBtn} onClick={selectAllVisible}>
                        Seleccionar todo
                      </button>
                      <button
                        type="button"
                        style={ui.selPlainBtn}
                        onClick={clearSelection}
                        disabled={selectedIds.size === 0}
                      >
                        Quitar selección
                      </button>
                      <button
                        type="button"
                        style={{
                          ...ui.selDeleteBtn,
                          ...(selectedIds.size === 0 ? ui.selDeleteBtnOff : {}),
                        }}
                        disabled={selectedIds.size === 0}
                        onClick={() =>
                          requestDelete(
                            Array.from(selectedIds),
                            `${selectedIds.size} acción(es) seleccionada(s)`
                          )
                        }
                      >
                        <Trash2 size={15} strokeWidth={2.4} />
                        Eliminar ({selectedIds.size})
                      </button>
                      <button type="button" style={ui.selExitBtn} onClick={exitSelectionMode}>
                        Salir
                      </button>
                    </div>
                  </div>
                ) : null}

                {/* Stat tiles (filtro por estado) */}
                <div style={ui.statsRow}>
                  {ESTADOS.map((e) => {
                    const selected = fEstado === e.key;
                    const n = estadoCounts?.[e.key] ?? 0;
                    const Icon = e.icon;
                    return (
                      <button
                        key={e.key}
                        type="button"
                        onClick={() => setFEstado(e.key)}
                        style={{ ...ui.statTile, ...(selected ? ui.statTileOn : {}) }}
                      >
                        <span style={{ ...ui.statIcon, ...(selected ? ui.statIconOn : {}) }}>
                          <Icon size={16} strokeWidth={2.4} />
                        </span>
                        <span style={ui.statText}>
                          <span style={{ ...ui.statValue, ...(selected ? ui.statValueOn : {}) }}>
                            {n}
                          </span>
                          <span style={{ ...ui.statLabel, ...(selected ? ui.statLabelOn : {}) }}>
                            {e.label}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Toolbar (search + filtros) */}
                <div style={ui.toolbar}>
                  <div style={ui.searchWrap}>
                    <SearchInput
                      value={qText}
                      onChange={setQText}
                      placeholder="Buscar proveedor, andén o apertura…"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setFiltersOpen(true)}
                    style={{ ...ui.filterBtn, ...(advancedActive > 0 ? ui.filterBtnOn : {}) }}
                    title="Filtros avanzados"
                  >
                    <SlidersHorizontal size={16} strokeWidth={2.4} />
                    <span style={ui.filterBtnTxt}>Filtros</span>
                    {advancedActive > 0 ? (
                      <span style={ui.filterBadge}>{advancedActive}</span>
                    ) : null}
                  </button>
                </div>

                {/* Filtros activos */}
                {activeChips.length === 0 && fEstado === "Todos" && !qText ? null : (
                  <div style={ui.activeRow}>
                    <span style={ui.resultCount}>
                      {filteredItems.length}{" "}
                      {filteredItems.length === 1 ? "resultado" : "resultados"}
                    </span>
                    {activeChips.map((c) => (
                      <button key={c.key} type="button" style={ui.activeChip} onClick={c.clear}>
                        <span style={ui.activeChipTxt}>{c.label}</span>
                        <X size={13} strokeWidth={2.6} />
                      </button>
                    ))}
                    {hasActiveFilters ? (
                      <button type="button" style={ui.clearAllBtn} onClick={clearAll}>
                        Limpiar todo
                      </button>
                    ) : null}
                  </div>
                )}
              </div>

              {filteredItems.length === 0 ? (
                <EmptyState
                  center
                  icon={Inbox}
                  title="No hay acciones"
                  description="Probá quitando filtros o revisá más tarde."
                  action={
                    hasActiveFilters ? (
                      <SecondaryButton onClick={clearAll}>Limpiar filtros</SecondaryButton>
                    ) : null
                  }
                />
              ) : (
                <div style={ui.list}>
                  {filteredItems.map((it) => (
                    <RowCard
                      key={it.id}
                      item={it}
                      hovered={hovered}
                      onHover={setHovered}
                      onOpen={onCardOpen}
                      selectable={selectionMode}
                      selected={selectedIds.has(it.id)}
                      onToggleSelect={toggleSelect}
                    />
                  ))}
                </div>
              )}

              <div style={ui.listBottomHint}>
                Mostrando {filteredItems.length} de {items.length}
              </div>
            </div>
          )}
        </Container>
      </Main>

      {/* ===== Sheet filtros ===== */}
      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filtros avanzados">
        <Sheet.Body>
          <Field label="Proveedor">
            <Field.Input
              value={fProveedor}
              onChange={(e) => setFProveedor(e.target.value)}
              placeholder="Ej: Rimax"
            />
          </Field>

          <Field label="Andén">
            <Field.Input
              value={fAnden}
              onChange={(e) => setFAnden(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="Ej: 3"
              inputMode="numeric"
            />
          </Field>

          <div style={ui.dateRow}>
            <Field label="Desde">
              <Field.Input type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} />
            </Field>
            <Field label="Hasta">
              <Field.Input type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} />
            </Field>
          </div>

          <Sheet.Hint>
            Mostrando {filteredItems.length} de {items.length}
          </Sheet.Hint>
        </Sheet.Body>

        <Sheet.Actions>
          <SecondaryButton onClick={clearAll}>Limpiar</SecondaryButton>
          <PrimaryButton onClick={() => setFiltersOpen(false)}>Aplicar</PrimaryButton>
        </Sheet.Actions>
      </Sheet>

      {/* ===== Sheet opciones DEV (limpieza de datos) ===== */}
      {isDev ? (
        <Sheet
          open={devSheetOpen}
          onClose={() => setDevSheetOpen(false)}
          title="Opciones de desarrollo"
        >
          <Sheet.Body>
            <div style={ui.devWarn}>
              <ShieldAlert size={18} strokeWidth={2.3} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={ui.devWarnTitle}>Función exclusiva para usuarios dev</div>
                <div style={ui.devWarnTxt}>
                  Estas herramientas eliminan acciones de descarga de forma permanente. Antes de
                  borrar se pedirá tu contraseña para confirmar.
                </div>
              </div>
            </div>

            {/* Opción 1: modo selección */}
            <div style={ui.devOption}>
              <div style={ui.devOptionHead}>
                <CheckSquare size={16} strokeWidth={2.3} color={ACCENT} />
                <span style={ui.devOptionTitle}>Eliminar marcando acciones</span>
              </div>
              <div style={ui.devOptionTxt}>
                Activá el modo selección para marcar acciones con casillas y usar “Seleccionar todo”.
                Podés combinarlo con los filtros y la búsqueda para acotar el listado.
              </div>
              <SecondaryButton icon={CheckSquare} onClick={enterSelectionMode}>
                {selectionMode ? "Modo selección activo" : "Activar modo selección"}
              </SecondaryButton>
            </div>

            {/* Opción 2: eliminar por rango de fecha */}
            <div style={ui.devOption}>
              <div style={ui.devOptionHead}>
                <Calendar size={16} strokeWidth={2.3} color={ACCENT} />
                <span style={ui.devOptionTitle}>Eliminar por rango de fecha</span>
              </div>
              <div style={ui.devOptionTxt}>
                Se eliminarán las acciones cuya fecha de creación esté dentro del rango.
              </div>
              <div style={ui.dateRow}>
                <Field label="Desde">
                  <Field.Input type="date" value={devDesde} onChange={(e) => setDevDesde(e.target.value)} />
                </Field>
                <Field label="Hasta">
                  <Field.Input type="date" value={devHasta} onChange={(e) => setDevHasta(e.target.value)} />
                </Field>
              </div>
              <div style={ui.devMatchHint}>
                {devDesde || devHasta
                  ? `${dateRangeMatches.length} acción(es) coinciden con el rango.`
                  : "Seleccioná al menos una fecha."}
              </div>
              <button
                type="button"
                style={{
                  ...ui.devDeleteBtn,
                  ...(dateRangeMatches.length === 0 ? ui.devDeleteBtnOff : {}),
                }}
                disabled={dateRangeMatches.length === 0}
                onClick={() =>
                  requestDelete(
                    dateRangeMatches.map((it) => it.id),
                    `${dateRangeMatches.length} acción(es) en el rango ${devDesde || "…"} → ${devHasta || "…"}`
                  )
                }
              >
                <Trash2 size={16} strokeWidth={2.4} />
                Eliminar {dateRangeMatches.length} acción(es)
              </button>
            </div>
          </Sheet.Body>
        </Sheet>
      ) : null}

      {/* ===== Modal confirmación con contraseña (DEV) ===== */}
      {isDev ? (
        <Sheet
          open={!!pendingDelete}
          onClose={cancelDelete}
          placement="center"
          maxWidth={460}
          title="Confirmar eliminación"
        >
          <Sheet.Body>
            <div style={ui.dangerBanner}>
              <AlertTriangle size={18} strokeWidth={2.4} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={ui.devWarnTitle}>Acción exclusiva para usuarios dev</div>
                <div style={ui.devWarnTxt}>
                  Vas a eliminar <strong>{pendingDelete?.label}</strong> de forma permanente. Esta
                  operación no se puede deshacer.
                </div>
              </div>
            </div>

            <Field label="Contraseña de tu usuario" error={pwdError || undefined}>
              <Field.Input
                type="password"
                value={pwd}
                autoComplete="current-password"
                placeholder="Ingresá tu contraseña"
                onChange={(e) => {
                  setPwd(e.target.value);
                  if (pwdError) setPwdError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !deleting) confirmDelete();
                }}
              />
            </Field>
          </Sheet.Body>

          <Sheet.Actions>
            <SecondaryButton onClick={cancelDelete} disabled={deleting}>
              Cancelar
            </SecondaryButton>
            <button
              type="button"
              style={{ ...ui.confirmDeleteBtn, ...(deleting ? ui.devDeleteBtnOff : {}) }}
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting ? (
                <Loader size={16} strokeWidth={2.4} style={{ animation: "spin 0.9s linear infinite" }} />
              ) : (
                <Lock size={16} strokeWidth={2.4} />
              )}
              {deleting ? "Eliminando…" : "Confirmar y eliminar"}
            </button>
          </Sheet.Actions>
        </Sheet>
      ) : null}
    </Shell>
  );
}

/* ===================== Styles (corporativo) ===================== */
const ui = {
  container: { gap: 16 },

  /* Mini hero */
  heroMedia: {
    position: "relative",
    borderRadius: 20,
    overflow: "hidden",
    border: `1px solid ${BORDER}`,
    boxShadow: SHADOW_HERO,
    minHeight: 150,
  },
  heroMediaBg: { position: "absolute", inset: 0, backgroundSize: "cover", backgroundPosition: "center" },
  heroMediaOverlay: {
    position: "absolute",
    inset: 0,
    background: "linear-gradient(180deg, rgba(15,23,42,0.10) 0%, rgba(15,23,42,0.70) 100%)",
  },
  heroMediaText: { position: "relative", padding: 16, display: "grid", gap: 8, color: "#fff" },

  kickerRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  kickerDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: ACCENT,
    boxShadow: `0 0 0 4px ${ACCENT_SOFT}`,
  },
  kicker: { fontSize: 12, fontWeight: 950, letterSpacing: 0.6, textTransform: "uppercase", color: "#E9FFFB" },
  badge: {
    fontSize: 12,
    fontWeight: 950,
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.14)",
    border: "1px solid rgba(255,255,255,0.35)",
    color: "#fff",
    backdropFilter: "blur(6px)",
  },
  titleMini: { fontSize: 22, fontWeight: 980, letterSpacing: -0.2 },
  subtitleMini: { color: "rgba(255,255,255,0.84)", fontWeight: 850, lineHeight: 1.35 },

  center: { minHeight: 320, display: "grid", placeItems: "center", gap: 10 },

  listWrap: { display: "grid", gap: 12 },

  /* Sticky header */
  stickyWrap: {
    position: "sticky",
    top: 0,
    zIndex: 3,
    background: BG,
    paddingBottom: 12,
    display: "grid",
    gap: 12,
  },

  /* Stat tiles (filtro por estado) */
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 10,
  },
  statTile: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 14px",
    borderRadius: 16,
    border: `1px solid ${BORDER}`,
    background: SURFACE,
    boxShadow: SHADOW_SOFT,
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "inherit",
    transition: "border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease",
  },
  statTileOn: {
    borderColor: "rgba(8,159,138,0.45)",
    boxShadow: `0 12px 28px rgba(8,159,138,0.16)`,
    transform: "translateY(-1px)",
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    display: "grid",
    placeItems: "center",
    background: SURFACE_INSET,
    border: `1px solid ${BORDER}`,
    color: SLATE,
    flexShrink: 0,
  },
  statIconOn: {
    background: ACCENT_SOFT,
    borderColor: "rgba(8,159,138,0.30)",
    color: ACCENT,
  },
  statText: { display: "grid", lineHeight: 1.1, minWidth: 0 },
  statValue: { fontSize: 22, fontWeight: 980, color: TEXT },
  statValueOn: { color: ACCENT },
  statLabel: {
    fontSize: 11,
    fontWeight: 900,
    color: SLATE,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  statLabelOn: { color: ACCENT },

  /* Toolbar (search + filtros) */
  toolbar: { display: "flex", alignItems: "stretch", gap: 10 },
  searchWrap: { flex: 1, minWidth: 0 },
  filterBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "0 16px",
    borderRadius: 14,
    border: `1px solid ${BORDER}`,
    background: SURFACE,
    boxShadow: SHADOW_SOFT,
    cursor: "pointer",
    fontFamily: "inherit",
    color: TEXT,
    fontWeight: 950,
    whiteSpace: "nowrap",
  },
  filterBtnOn: { borderColor: "rgba(8,159,138,0.45)", color: ACCENT },
  filterBtnTxt: { fontSize: 13, fontWeight: 950 },
  filterBadge: {
    minWidth: 20,
    height: 20,
    padding: "0 6px",
    borderRadius: 999,
    background: ACCENT,
    color: "#fff",
    fontSize: 11,
    fontWeight: 950,
    display: "grid",
    placeItems: "center",
  },

  /* Active filters */
  activeRow: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 },
  resultCount: { fontSize: 12, fontWeight: 900, color: SLATE, marginRight: 2 },
  activeChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    borderRadius: 999,
    border: `1px solid ${BORDER}`,
    background: SURFACE_INSET,
    color: TEXT,
    fontWeight: 900,
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  activeChipTxt: { maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  clearAllBtn: {
    marginLeft: "auto",
    padding: "6px 10px",
    borderRadius: 999,
    border: "none",
    background: "transparent",
    color: ACCENT,
    fontWeight: 950,
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
  },

  /* Cards list */
  list: { display: "grid", gap: 10 },
  rowCard: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    padding: 14,
    border: `1px solid ${BORDER}`,
    display: "flex",
    alignItems: "center",
    gap: 12,
    minHeight: 92,
    boxShadow: SHADOW_CARD,
    cursor: "pointer",
    userSelect: "none",
    transition: "transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease",
  },
  rowCardHover: {
    transform: "translateY(-2px)",
    boxShadow: SHADOW_CARD_HOVER,
    borderColor: "rgba(8,159,138,0.30)",
  },
  rowAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    background: ACCENT_SOFT,
    border: "1px solid rgba(8,159,138,0.20)",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },

  rowTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
  rowTitle: {
    color: TEXT,
    fontSize: 15,
    fontWeight: 980,
    flex: 1,
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  },

  rowMetaGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px 14px",
    marginTop: 8,
  },
  metaItem: { display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0 },
  metaTxt: {
    color: SLATE,
    fontSize: 12,
    fontWeight: 850,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: 220,
  },

  listBottomHint: { color: MUTED, fontWeight: 850, fontSize: 12, paddingTop: 4, paddingBottom: 10, textAlign: "center" },

  /* Sheet */
  dateRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },

  /* Selección (dev) */
  rowCheck: {
    width: 44,
    height: 44,
    borderRadius: 14,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  rowCardSelected: {
    borderColor: "rgba(8,159,138,0.45)",
    boxShadow: `0 0 0 2px ${ACCENT_SOFT}, ${SHADOW_CARD}`,
  },
  selectionBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 10,
    padding: "12px 14px",
    borderRadius: 16,
    border: `1px solid ${DANGER_BORDER}`,
    background: DANGER_BG,
    boxShadow: SHADOW_SOFT,
  },
  selectionCount: { fontWeight: 950, fontSize: 13, color: TEXT },
  selectionActions: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 },
  selPlainBtn: {
    padding: "8px 12px",
    borderRadius: 999,
    border: `1px solid ${BORDER}`,
    background: SURFACE,
    color: TEXT,
    fontWeight: 900,
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  selDeleteBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 14px",
    borderRadius: 999,
    border: `1px solid ${DANGER}`,
    background: DANGER,
    color: "#fff",
    fontWeight: 950,
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  selDeleteBtnOff: { opacity: 0.5, cursor: "not-allowed" },
  selExitBtn: {
    padding: "8px 12px",
    borderRadius: 999,
    border: "none",
    background: "transparent",
    color: SLATE,
    fontWeight: 950,
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
  },

  /* Panel dev */
  devWarn: {
    display: "flex",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    border: `1px solid ${DANGER_BORDER}`,
    background: DANGER_BG,
    color: DANGER,
  },
  devWarnTitle: { fontWeight: 950, fontSize: 13, color: DANGER },
  devWarnTxt: { fontWeight: 800, fontSize: 12.5, color: "#7F1D1D", lineHeight: 1.4, marginTop: 2 },

  devOption: {
    display: "grid",
    gap: 10,
    padding: 14,
    borderRadius: 16,
    border: `1px solid ${BORDER}`,
    background: SURFACE_SOFT,
  },
  devOptionHead: { display: "flex", alignItems: "center", gap: 8 },
  devOptionTitle: { fontWeight: 950, fontSize: 14, color: TEXT },
  devOptionTxt: { fontWeight: 800, fontSize: 12.5, color: SLATE, lineHeight: 1.4 },
  devMatchHint: { fontWeight: 900, fontSize: 12, color: SLATE },
  devDeleteBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "12px 14px",
    borderRadius: 14,
    border: `1px solid ${DANGER}`,
    background: DANGER,
    color: "#fff",
    fontWeight: 950,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  devDeleteBtnOff: { opacity: 0.5, cursor: "not-allowed" },

  /* Confirmación con contraseña */
  dangerBanner: {
    display: "flex",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    border: `1px solid ${DANGER_BORDER}`,
    background: DANGER_BG,
    color: DANGER,
  },
  confirmDeleteBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "12px 14px",
    borderRadius: 14,
    border: `1px solid ${DANGER}`,
    background: DANGER,
    color: "#fff",
    fontWeight: 950,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
};
