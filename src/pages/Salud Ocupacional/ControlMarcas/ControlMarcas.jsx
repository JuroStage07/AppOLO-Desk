import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  query,
  where,
  getDocs,
  limit,
  doc,
  setDoc,
  addDoc,
  orderBy,
  serverTimestamp,
  getDocsFromServer,
  onSnapshot,
} from "firebase/firestore";
import { ArrowLeft, ScanLine } from "lucide-react";
import { auth, db } from "../../../firebase";
import { AuthCtx } from "../../../auth/AuthProvider";
import { filterByUserScope } from "../../../utils/dataScope";
import {
  Brand,
  GhostButton,
  Topbar,
} from "../../../components/ui";

const ACCENT = "#089F8A";
const DANGER = "#DC2626";

function getTodayId() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function sanitizeCedula(value) {
  return (value || "").replace(/[^\d]/g, "").trim();
}

function formatHora(date = new Date()) {
  return date.toLocaleTimeString("es-CR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function dismissKeyboard() {
  if (typeof document !== "undefined" && document.activeElement) {
    document.activeElement.blur?.();
  }
}

/** Última marca de hoy por usuarioId; si es `entrada`, sigue en sitio (ControlMarcas no toca usuariosTerceros.entrada). */
function marcaCreatedMs(m) {
  const ts = m?.createdAt;
  if (!ts || typeof ts.toMillis !== "function") return 0;
  return ts.toMillis();
}

function buildActivosEnSitioDesdeMarcasDelDia(marcasRows, tenantId, company) {
  const scoped = filterByUserScope(marcasRows, tenantId, company);
  const sorted = [...scoped].sort((a, b) => marcaCreatedMs(b) - marcaCreatedMs(a));
  const ultimaPorUsuario = new Map();
  for (const m of sorted) {
    const uid = m.usuarioId;
    if (!uid || ultimaPorUsuario.has(uid)) continue;
    ultimaPorUsuario.set(uid, m);
  }
  const activos = [];
  for (const [usuarioId, m] of ultimaPorUsuario) {
    if (m.tipo !== "entrada") continue;
    const ts = m.createdAt;
    const entradaAt =
      ts && typeof ts.toDate === "function" ? ts.toDate() : null;
    activos.push({
      id: usuarioId,
      nombre: m.nombre || "Sin nombre",
      empresa: m.empresa || m.company || "Sin empresa",
      cedula: m.cedula || "",
      entradaAt,
    });
  }
  activos.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
  return activos;
}

export default function ControlMarcas() {
  const nav = useNavigate();
  const inputRef = useRef(null);
  const authCtx = useContext(AuthCtx);
  const profile = authCtx?.profile || {};
  const authLoading = authCtx?.loading;

  const [cedula, setCedula] = useState("");
  const [loading, setLoading] = useState(false);
  const [ultimoUsuario, setUltimoUsuario] = useState(null);
  const [ultimasMarcas, setUltimasMarcas] = useState([]);
  const [toast, setToast] = useState(null);

  /** En sitio según última marca del día en controlMarcas (no usuariosTerceros.entrada) */
  const [activosEnSitio, setActivosEnSitio] = useState([]);
  const [diaKeyActivos, setDiaKeyActivos] = useState(() => getTodayId());
  const [activosModalOpen, setActivosModalOpen] = useState(false);
  const [showActivosFilters, setShowActivosFilters] = useState(false);
  const [fNombreActivo, setFNombreActivo] = useState("");
  const [fEmpresaActivo, setFEmpresaActivo] = useState("");

  const cedulaLimpia = useMemo(() => sanitizeCedula(cedula), [cedula]);

  const canSubmit = useMemo(() => {
    return cedulaLimpia.length > 0 && !loading;
  }, [cedulaLimpia, loading]);

  const fmtHoraEntrada = (d) => {
    if (!d || !(d instanceof Date) || isNaN(d.getTime())) return "—";
    return d.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" });
  };

  const activosFiltrados = useMemo(() => {
    const n = fNombreActivo.trim().toLowerCase();
    const e = fEmpresaActivo.trim().toLowerCase();
    return activosEnSitio.filter((u) => {
      const nn = String(u.nombre || "").toLowerCase();
      const ee = String(u.empresa || "").toLowerCase();
      return (!n || nn.includes(n)) && (!e || ee.includes(e));
    });
  }, [activosEnSitio, fNombreActivo, fEmpresaActivo]);

  const activosCount = activosEnSitio.length;

  useEffect(() => {
    const id = setInterval(() => {
      const n = getTodayId();
      setDiaKeyActivos((prev) => (prev !== n ? n : prev));
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    const marcasRef = collection(db, "controlMarcas", diaKeyActivos, "marcas");
    const qMarcas = query(marcasRef, orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      qMarcas,
      (snap) => {
        const marcasRows = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setActivosEnSitio(
          buildActivosEnSitioDesdeMarcasDelDia(
            marcasRows,
            profile?.tenantId,
            profile?.company
          )
        );
      },
      (err) => console.log("ControlMarcas activos (marcas del día):", err)
    );

    return () => unsub();
  }, [authLoading, profile?.tenantId, profile?.company, diaKeyActivos]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (activosModalOpen) {
        setActivosModalOpen(false);
        setShowActivosFilters(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activosModalOpen]);

  const showToast = (kind, msg, ms = 2200) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), ms);
  };

  const focusCedula = () => {
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.select?.();
    });
  };

  const cargarUltimasMarcasDelDia = async () => {
    try {
      const hoyId = getTodayId();
      const marcasRef = collection(db, "controlMarcas", hoyId, "marcas");
      const qMarcas = query(marcasRef, orderBy("createdAt", "desc"));
      const snap = await getDocs(qMarcas);

      const data = snap.docs.slice(0, 20).map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      setUltimasMarcas(data);
    } catch (error) {
      console.log("Error cargando últimas marcas:", error);
    }
  };

  const buscarUsuarioPorCedula = async (numeroCedula) => {
    const usuariosRef = collection(db, "usuariosTerceros");
    const qUsuario = query(
      usuariosRef,
      where("cedula", "==", numeroCedula),
      limit(1)
    );

    let snap;

    try {
      snap = await getDocsFromServer(qUsuario);
    } catch {
      snap = await getDocs(qUsuario);
    }

    if (snap.empty) return null;

    const docSnap = snap.docs[0];
    return {
      id: docSnap.id,
      ...docSnap.data(),
    };
  };

  const obtenerSiguienteTipoMarca = async (hoyId, usuarioDocId) => {
    const marcasRef = collection(db, "controlMarcas", hoyId, "marcas");
    const qUltimaMarca = query(
      marcasRef,
      where("usuarioId", "==", usuarioDocId),
      orderBy("createdAt", "desc"),
      limit(1)
    );

    let snap;

    try {
      snap = await getDocsFromServer(qUltimaMarca);
    } catch {
      snap = await getDocs(qUltimaMarca);
    }

    if (snap.empty) {
      return "entrada";
    }

    const ultimaMarca = snap.docs[0].data();

    return ultimaMarca.tipo === "entrada" ? "salida" : "entrada";
  };

  const registrarMarca = async (e) => {
    e?.preventDefault?.();
    if (!cedulaLimpia) {
      showToast("warn", "Ingresa un número de cédula.");
      return;
    }

    setLoading(true);
    dismissKeyboard();

    let paso = "";
    try {
      paso = "Buscar usuario por cédula (usuariosTerceros)";
      const usuario = await buscarUsuarioPorCedula(cedulaLimpia);

      if (!usuario) {
        window.alert(
          `No encontrado\nNo existe un usuario en usuariosTerceros con la cédula ${cedulaLimpia}.`
        );
        return;
      }

      if (usuario.usuarioBloqueado === true) {
        window.alert(
          "Usuario bloqueado\nEste usuario está bloqueado y no puede marcar."
        );
        return;
      }

      const hoyId = getTodayId();
      const diaRef = doc(db, "controlMarcas", hoyId);

      paso = "Escribir documento del día (controlMarcas/{fecha})";
      await setDoc(
        diaRef,
        {
          fecha: hoyId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      paso = "Consultar última marca del día (controlMarcas/.../marcas)";
      const tipo = await obtenerSiguienteTipoMarca(hoyId, usuario.id);

      const marca = {
        usuarioId: usuario.id,
        cedula: String(usuario.cedula ?? ""),
        nombre: String(usuario.nombre ?? ""),
        empresa: String(usuario.empresa ?? ""),
        company: String(usuario.company ?? ""),
        motivo: String(usuario.motivo ?? ""),
        tenantId: String(usuario.tenantId ?? ""),
        tipo,
        createdAt: serverTimestamp(),
        fecha: hoyId,
        horaTexto: formatHora(),
      };

      paso = "Registrar marca (controlMarcas/.../marcas addDoc)";
      await addDoc(collection(db, "controlMarcas", hoyId, "marcas"), marca);

      paso = "Actualizar updatedAt del día (controlMarcas/{fecha})";
      await setDoc(
        diaRef,
        {
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setUltimoUsuario({
        nombre: usuario.nombre || "",
        cedula: usuario.cedula || "",
        empresa: usuario.empresa || "",
        tipo,
      });

      setCedula("");

      paso = "Recargar lista de marcas del día";
      await cargarUltimasMarcasDelDia();

      showToast(
        "ok",
        `${usuario.nombre} — Marca de ${tipo} registrada.`
      );
    } catch (error) {
      console.error("Error registrando marca:", paso, error);
      const denied = error?.code === "permission-denied";
      window.alert(
        denied
          ? "Permisos insuficientes en Firestore.\n\n" +
              `Paso que falló: ${paso}\n\n` +
              "Si el paso es usuariosTerceros: ampliá get/list con " +
              "sameTenantCompanyData(resource.data) o permiso salud.\n" +
              "Si es controlMarcas: revisá create/update del día y create en marcas."
          : `Error\n${error?.message || "No se pudo registrar la marca."}`
      );
    } finally {
      setLoading(false);
      focusCedula();
    }
  };

  useEffect(() => {
    cargarUltimasMarcasDelDia();
  }, []);

  useEffect(() => {
    const style = document.createElement("style");
    style.setAttribute("data-cm", "control-marcas");
    style.innerHTML = `
      @keyframes cm-spin { to { transform: rotate(360deg); } }
      .cm-input-wrap:focus-within {
        border-color: rgba(8, 159, 138, 0.45) !important;
        box-shadow: 0 0 0 4px rgba(8, 159, 138, 0.12);
      }
      @media (max-width: 960px) {
        .cm-main-grid { grid-template-columns: 1fr !important; }
        .cm-field-row { grid-template-columns: 1fr !important; }
        .cm-info-strip { grid-template-columns: 1fr !important; }
        .cm-info-strip .cm-divider { display: none !important; }
        .cm-list-actions { width: 100%; justify-content: flex-start !important; }
      }
    `;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  useEffect(() => {
    focusCedula();
  }, []);

  return (
    <div style={ui.shell}>
      <Topbar>
        <Brand
          icon={ScanLine}
          title="Control de marcas"
          subtitle="Entrada / Salida · Asistencia"
          onClick={() => nav("/salud")}
        />
        <Topbar.Right>
          <GhostButton icon={ArrowLeft} onClick={() => nav("/salud")}>
            Salud
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <div style={ui.main}>
        <div style={ui.mainWrap}>
          <div className="cm-main-grid" style={ui.mainGrid}>
          <div style={ui.card}>
            <div style={ui.topAccent} />

            <div style={ui.cardHead}>
              <div>
                <div style={ui.cardKicker}>Registro de marcas</div>
                <div style={ui.cardTitle}>Entrada / Salida automática</div>
                <div style={ui.cardDesc}>
                  Ingresá la cédula: el sistema alterna entrada y salida según la
                  última marca del día. Presioná Enter para registrar.
                </div>
              </div>

              <div style={ui.statusBox}>
                <div
                  style={{
                    ...ui.statusDot,
                    background: loading
                      ? "#F59E0B"
                      : ultimoUsuario
                        ? ultimoUsuario.tipo === "entrada"
                          ? ACCENT
                          : "#2563EB"
                        : "#94A3B8",
                    boxShadow: loading
                      ? "0 0 0 5px rgba(245, 158, 11, 0.15)"
                      : ultimoUsuario
                        ? ultimoUsuario.tipo === "entrada"
                          ? "0 0 0 5px rgba(8, 159, 138, 0.15)"
                          : "0 0 0 5px rgba(37, 99, 235, 0.15)"
                        : "0 0 0 5px rgba(148, 163, 184, 0.2)",
                  }}
                />
                <div style={{ display: "grid", gap: 2 }}>
                  <div style={ui.statusTitle}>
                    {loading
                      ? "Procesando…"
                      : ultimoUsuario
                        ? `Última: ${ultimoUsuario.tipo === "entrada" ? "Entrada" : "Salida"}`
                        : "Listo para marcar"}
                  </div>
                  <div style={ui.statusSub}>
                    {loading
                      ? "Guardando en Firestore"
                      : ultimoUsuario
                        ? "Podés seguir registrando más marcas hoy"
                        : "Sin marcas recientes en esta sesión"}
                  </div>
                </div>
              </div>
            </div>

            <form onSubmit={registrarMarca} style={ui.form}>
              <div className="cm-field-row" style={ui.fieldRow}>
                <div style={ui.fieldLeft}>
                  <div style={ui.labelRow}>
                    <div style={ui.label}>Cédula</div>
                    <div style={ui.hint}>Sin puntos ni guiones</div>
                  </div>

                  <div className="cm-input-wrap" style={ui.inputWrap}>
                    <span style={ui.inputIcon} aria-hidden="true">
                      ⌁
                    </span>
                    <input
                      ref={inputRef}
                      id="cedula-control-marcas"
                      value={cedula}
                      onChange={(e) =>
                        setCedula(e.target.value.replace(/\D/g, ""))
                      }
                      autoComplete="off"
                      placeholder="Ej: 1XXXXXXXX"
                      inputMode="numeric"
                      disabled={loading}
                      style={ui.input}
                      onFocus={(e) => e.currentTarget.select?.()}
                    />
                    <span style={ui.enterPill} aria-hidden="true">
                      Enter
                    </span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  style={{
                    ...ui.btnPrimary,
                    ...ui.btnEntrada,
                    ...(canSubmit ? {} : ui.btnDisabled),
                  }}
                >
                  {loading ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <span style={ui.spinner} />
                      Procesando…
                    </span>
                  ) : (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <span style={ui.btnIcon} aria-hidden="true">
                        ✓
                      </span>
                      Registrar marca
                    </span>
                  )}
                </button>
              </div>

              <div className="cm-info-strip" style={ui.infoStrip}>
                <div style={ui.infoItem}>
                  <div style={ui.infoTitle}>Cómo funciona</div>
                  <div style={ui.infoText}>
                    La primera marca del día es <b>entrada</b>. Después se alterna
                    con <b>salida</b> / <b>entrada</b> según la última registrada
                    para esa persona.
                  </div>
                </div>

                <div className="cm-divider" style={ui.divider} />

                <div style={ui.infoItem}>
                  <div style={ui.infoTitle}>Sugerencia</div>
                  <div style={ui.infoText}>
                    Usá lector o escáner para la cédula y presioná{" "}
                    <b>Enter</b> para registrar más rápido.
                  </div>
                </div>
              </div>
            </form>

            {toast && (
              <div
                style={{
                  ...ui.toast,
                  ...(toast.kind === "ok" ? ui.toastOk : {}),
                  ...(toast.kind === "warn" ? ui.toastWarn : {}),
                  ...(toast.kind === "err" ? ui.toastErr : {}),
                }}
              >
                <div style={ui.toastLeft}>
                  <div
                    style={{
                      ...ui.toastDot,
                      ...(toast.kind === "ok" ? { background: ACCENT } : {}),
                      ...(toast.kind === "warn"
                        ? { background: "#F59E0B" }
                        : {}),
                      ...(toast.kind === "err"
                        ? { background: "#EF4444" }
                        : {}),
                    }}
                  />
                  <div style={ui.toastMsg}>{toast.msg}</div>
                </div>
              </div>
            )}
          </div>

          <div style={ui.side}>
            <div style={ui.kpiSide}>
              <div style={ui.kpiTopAccent} />
              <div style={ui.kpiLabel}>Activos en sitio</div>

              <div style={ui.kpiPill}>
                <span style={ui.kpiPillDot} />
                Según marcas de hoy
              </div>

              <div style={ui.kpiValueBig}>{activosCount}</div>

              <button
                type="button"
                onClick={() => {
                  setActivosModalOpen(true);
                  setShowActivosFilters(false);
                  setFNombreActivo("");
                  setFEmpresaActivo("");
                }}
                disabled={loading}
                style={{
                  ...ui.kpiEyeBtn,
                  ...(loading ? ui.kpiEyeBtnDisabled : {}),
                }}
                title="Ver quienes tienen la última marca de entrada hoy"
                aria-label="Ver quienes tienen la última marca de entrada hoy"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>

            <div style={ui.modePanel}>
              <div style={ui.topAccent} />
              <div style={ui.modeTitle}>Alternancia automática</div>
              <div style={ui.modeSub}>
                No hace falta elegir entrada o salida: el sistema asigna el tipo
                según la última marca del mismo usuario en el día.
              </div>
            </div>
          </div>
          </div>

          <div style={ui.listBand}>
            <div style={ui.topAccent} />
            <div style={ui.listSectionHead}>
              <div>
                <div style={ui.listSectionKicker}>Hoy · {getTodayId()}</div>
                <div style={ui.listSectionTitle}>Últimas marcas</div>
              </div>
              <div className="cm-list-actions" style={ui.listActions}>
                <button
                  type="button"
                  onClick={cargarUltimasMarcasDelDia}
                  style={ui.btnGhostSmall}
                  disabled={loading}
                >
                  Recargar
                </button>
                <button
                  type="button"
                  onClick={() => nav("/salud/control-marcas/historial")}
                  style={ui.btnGhostSmall}
                  disabled={loading}
                >
                  Historial
                </button>
              </div>
            </div>

            <div style={ui.listScroll}>
              {ultimasMarcas.length === 0 ? (
                <div style={ui.emptyState}>
                  Aún no hay marcas registradas hoy.
                </div>
              ) : (
                ultimasMarcas.map((item) => {
                  const esEntrada = item.tipo === "entrada";
                  return (
                    <div key={item.id} style={ui.marcaRow}>
                      <div style={ui.marcaRowTop}>
                        <div style={ui.marcaNombre}>
                          {item.nombre || "Sin nombre"}
                        </div>
                        <span
                          style={{
                            ...ui.badge,
                            ...(esEntrada
                              ? ui.badgeEntrada
                              : ui.badgeSalida),
                          }}
                        >
                          {esEntrada ? "ENTRADA" : "SALIDA"}
                        </span>
                      </div>
                      <div style={ui.marcaMeta}>
                        Cédula: {item.cedula || "—"} ·{" "}
                        {item.empresa || item.company || "—"}
                      </div>
                      <div style={ui.marcaMeta}>
                        Hora: {item.horaTexto || "—"}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {activosModalOpen && (
        <div
          style={modal.backdrop}
          onClick={() => {
            setActivosModalOpen(false);
            setShowActivosFilters(false);
          }}
        >
          <div style={modal.sheet} onClick={(e) => e.stopPropagation()}>
            <div style={modal.header}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={modal.iconActivos} aria-hidden="true">
                  👁
                </div>
                <div>
                  <div style={modal.title}>Activos en sitio</div>
                  <div style={modal.sub}>
                    {activosCount} con última marca de <b>entrada</b> hoy (
                    {diaKeyActivos})
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowActivosFilters((v) => !v)}
                  style={{
                    ...ui.filtersToggleBtn,
                    ...(showActivosFilters ? ui.filtersToggleBtnActive : {}),
                  }}
                  aria-label={
                    showActivosFilters ? "Ocultar filtros" : "Mostrar filtros"
                  }
                  title={
                    showActivosFilters ? "Ocultar filtros" : "Mostrar filtros"
                  }
                  disabled={loading}
                >
                  <span style={ui.filtersToggleIcon} aria-hidden="true">
                    🔎
                  </span>
                  Filtros
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActivosModalOpen(false);
                    setShowActivosFilters(false);
                  }}
                  style={modal.close}
                >
                  ✕
                </button>
              </div>
            </div>

            <div style={ui.activosBody}>
              {showActivosFilters && (
                <div style={ui.filtersBox}>
                  <div style={ui.filtersTitleRow}>
                    <div style={ui.filtersTitle}>Filtros</div>
                    <div style={ui.filtersHint}>
                      Mostrando <b>{activosFiltrados.length}</b> de{" "}
                      <b>{activosEnSitio.length}</b>
                    </div>
                  </div>

                  <div style={ui.filtersGrid}>
                    <div style={ui.filterField}>
                      <div style={ui.filterLabel}>Nombre</div>
                      <input
                        value={fNombreActivo}
                        onChange={(e) => setFNombreActivo(e.target.value)}
                        placeholder="Buscar por nombre…"
                        style={ui.filterInput}
                      />
                    </div>

                    <div style={ui.filterField}>
                      <div style={ui.filterLabel}>Empresa</div>
                      <input
                        value={fEmpresaActivo}
                        onChange={(e) => setFEmpresaActivo(e.target.value)}
                        placeholder="Buscar por empresa…"
                        style={ui.filterInput}
                      />
                    </div>
                  </div>

                  <div style={ui.filtersFooter}>
                    <button
                      type="button"
                      onClick={() => {
                        setFNombreActivo("");
                        setFEmpresaActivo("");
                      }}
                      style={ui.clearBtn}
                    >
                      Limpiar
                    </button>
                  </div>
                </div>
              )}
              <div style={ui.activosScroll}>
                {activosFiltrados.length === 0 ? (
                  <div style={ui.emptyStateModal}>
                    {activosEnSitio.length === 0
                      ? "Nadie tiene como última marca de hoy una entrada (en tu ámbito)."
                      : "No hay resultados con esos filtros."}
                  </div>
                ) : (
                  <div style={ui.activosList}>
                    {activosFiltrados.map((u) => (
                      <div key={u.id} style={ui.activoRow}>
                        <div style={ui.activoMain}>
                          <div style={ui.activoNombre}>{u.nombre}</div>

                          <div style={ui.activoMetaLine}>
                            <span style={ui.badgeSoft}>Empresa</span>
                            <span style={ui.activoEmpresa}>{u.empresa}</span>
                          </div>

                          <div style={ui.activoMetaLine}>
                            <span style={ui.badgeSoft}>Cédula</span>
                            <span style={ui.activoMetaValue}>
                              {u.cedula || "—"}
                            </span>
                          </div>

                          <div style={ui.activoMetaLine}>
                            <span style={ui.badgeSoft}>Entrada</span>
                            <span style={ui.activoMetaValue}>
                              {fmtHoraEntrada(u.entradaAt)}
                            </span>
                          </div>

                          <div style={ui.uidBlock}>
                            <div style={ui.uidLabel}>UID DOC</div>
                            <div style={ui.uidValue}>{u.id}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={modal.actions}>
              <button
                type="button"
                onClick={() => {
                  setActivosModalOpen(false);
                  setShowActivosFilters(false);
                }}
                style={modal.primary}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const ui = {
  shell: {
    minHeight: "100vh",
    height: "100dvh",
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    background: "#F6F7FB",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    color: "#0F172A",
    overflow: "hidden",
    display: "grid",
    gridTemplateRows: "auto 1fr",
  },

  topAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    height: 4,
    width: "100%",
    background: `linear-gradient(90deg, ${ACCENT} 0%, rgba(8,159,138,0.25) 60%, rgba(8,159,138,0) 100%)`,
  },

  btnGhost: {
    border: "1px solid #E7E9F2",
    background: "#fff",
    borderRadius: 14,
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 950,
    color: "#0F172A",
    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
    whiteSpace: "nowrap",
  },

  btnGhostSmall: {
    border: "1px solid #E7E9F2",
    background: "#fff",
    borderRadius: 14,
    padding: "8px 12px",
    cursor: "pointer",
    fontWeight: 950,
    fontSize: 13,
    color: "#0F172A",
  },

  main: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: 16,
    paddingBottom: 24,
    overflowY: "auto",
    overflowX: "hidden",
    WebkitOverflowScrolling: "touch",
  },

  mainWrap: {
    width: "100%",
    maxWidth: 1200,
    display: "flex",
    flexDirection: "column",
    gap: 16,
    boxSizing: "border-box",
  },

  mainGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 320px",
    gap: 16,
    alignItems: "start",
    width: "100%",
    boxSizing: "border-box",
  },

  side: {
    display: "grid",
    gridTemplateRows: "1fr 1fr",
    gap: 16,
    alignSelf: "stretch",
    minHeight: 0,
  },

  card: {
    width: "100%",
    maxWidth: 820,
    background: "#fff",
    borderRadius: 20,
    border: "1px solid #E7E9F2",
    boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
    overflow: "hidden",
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignSelf: "start",
  },

  cardHead: {
    padding: 16,
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    flexWrap: "wrap",
    borderBottom: "1px solid #EEF1F7",
    background: "linear-gradient(180deg, #FFFFFF 0%, #FBFCFF 100%)",
  },
  cardKicker: {
    fontSize: 12,
    fontWeight: 950,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: ACCENT,
    marginBottom: 6,
  },
  cardTitle: { fontSize: 18, fontWeight: 980, margin: 0 },
  cardDesc: { marginTop: 6, color: "#64748B", fontWeight: 800, fontSize: 13 },

  statusBox: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 16,
    border: "1px solid #E7E9F2",
    background: "#fff",
    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
    minWidth: 200,
    maxWidth: "100%",
    flex: "0 1 280px",
  },
  statusDot: { width: 10, height: 10, borderRadius: 999 },
  statusTitle: { fontWeight: 980, color: "#0F172A" },
  statusSub: { fontWeight: 800, fontSize: 12, color: "#64748B" },

  form: { padding: 16, display: "grid", gap: 14, minHeight: 0 },

  fieldRow: {
    display: "grid",
    gridTemplateColumns: "1fr 240px",
    gap: 12,
    alignItems: "end",
  },
  fieldLeft: { display: "grid", gap: 10 },

  labelRow: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
  },
  label: { fontWeight: 980, fontSize: 13, color: "#0F172A" },
  hint: { fontWeight: 850, fontSize: 12, color: "#94A3B8" },

  inputWrap: {
    display: "grid",
    gridTemplateColumns: "42px 1fr auto",
    alignItems: "center",
    gap: 10,
    borderRadius: 18,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    padding: "10px 10px",
  },
  inputIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    background: "rgba(15,23,42,0.06)",
    display: "grid",
    placeItems: "center",
    fontWeight: 950,
    color: "#0F172A",
  },
  input: {
    border: "none",
    outline: "none",
    background: "transparent",
    fontWeight: 980,
    fontSize: 20,
    color: "#0F172A",
    padding: "10px 0",
  },
  enterPill: {
    borderRadius: 999,
    border: "1px solid #E7E9F2",
    background: "#fff",
    padding: "8px 10px",
    fontWeight: 950,
    fontSize: 12,
    color: "#64748B",
  },

  btnPrimary: {
    borderRadius: 18,
    border: "1px solid transparent",
    padding: "14px 14px",
    fontWeight: 980,
    cursor: "pointer",
    color: "#fff",
    display: "grid",
    placeItems: "center",
    height: 62,
  },
  btnEntrada: {
    background: ACCENT,
    borderColor: ACCENT,
    boxShadow: "0 18px 32px rgba(8,159,138,0.22)",
  },
  btnDisabled: { opacity: 0.55, cursor: "not-allowed", boxShadow: "none" },
  btnIcon: {
    width: 30,
    height: 30,
    borderRadius: 12,
    display: "grid",
    placeItems: "center",
    background: "rgba(255,255,255,0.18)",
  },

  spinner: {
    width: 16,
    height: 16,
    borderRadius: 999,
    border: "2px solid rgba(255,255,255,0.55)",
    borderTopColor: "#fff",
    animation: "cm-spin 900ms linear infinite",
  },

  infoStrip: {
    borderRadius: 18,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    padding: 14,
    display: "grid",
    gridTemplateColumns: "1fr 1px 1fr",
    gap: 14,
    alignItems: "center",
  },
  divider: { width: 1, height: "100%", background: "#E7E9F2" },
  infoItem: { display: "grid", gap: 6 },
  infoTitle: {
    fontWeight: 980,
    fontSize: 12,
    color: "#0F172A",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  infoText: { fontWeight: 850, color: "#64748B", fontSize: 13, lineHeight: 1.35 },

  toast: {
    margin: "0 16px 16px",
    borderRadius: 18,
    border: "1px solid #E7E9F2",
    background: "#fff",
    padding: 14,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexShrink: 0,
  },
  toastLeft: { display: "flex", alignItems: "center", gap: 10 },
  toastDot: { width: 10, height: 10, borderRadius: 999, background: "#64748B" },
  toastMsg: { fontWeight: 950, color: "#0F172A" },
  toastOk: { background: "#F3FBF9", borderColor: "rgba(8,159,138,0.35)" },
  toastWarn: { background: "#FFFBF2", borderColor: "rgba(245,158,11,0.35)" },
  toastErr: { background: "#FFF6F6", borderColor: "rgba(239,68,68,0.35)" },

  listBand: {
    width: "100%",
    background: "#fff",
    borderRadius: 20,
    border: "1px solid #E7E9F2",
    boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    maxHeight: "min(42vh, 420px)",
    minHeight: 200,
    position: "relative",
  },
  listSectionHead: {
    padding: "12px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    background: "#FBFCFF",
    borderBottom: "1px solid #EEF1F7",
    flexShrink: 0,
    flexWrap: "wrap",
  },
  listActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    flexWrap: "wrap",
  },
  listSectionKicker: {
    fontSize: 11,
    fontWeight: 950,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: "#64748B",
  },
  listSectionTitle: { fontWeight: 980, fontSize: 15, color: "#0F172A" },
  listScroll: {
    overflowY: "auto",
    overflowX: "hidden",
    padding: "12px 16px 16px",
    flex: 1,
    minHeight: 0,
    WebkitOverflowScrolling: "touch",
  },

  emptyState: {
    padding: 16,
    borderRadius: 16,
    border: "1px dashed #E7E9F2",
    background: "#FBFCFF",
    color: "#64748B",
    fontWeight: 850,
    textAlign: "center",
  },

  marcaRow: {
    border: "1px solid #E7E9F2",
    borderRadius: 16,
    padding: 12,
    background: "#fff",
    marginBottom: 10,
    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
  },
  marcaRowTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    alignItems: "flex-start",
    marginBottom: 8,
  },
  marcaNombre: {
    flex: 1,
    fontWeight: 980,
    fontSize: 15,
    color: "#0F172A",
  },
  marcaMeta: { fontSize: 13, fontWeight: 850, color: "#64748B", marginBottom: 2 },
  badge: {
    fontSize: 11,
    fontWeight: 950,
    padding: "6px 10px",
    borderRadius: 999,
    whiteSpace: "nowrap",
  },
  badgeEntrada: {
    backgroundColor: "rgba(8,159,138,0.12)",
    color: ACCENT,
  },
  badgeSalida: {
    backgroundColor: "rgba(220,38,38,0.12)",
    color: DANGER,
  },

  kpiSide: {
    position: "relative",
    borderRadius: 22,
    border: "1px solid rgba(15,23,42,0.08)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.96) 100%)",
    boxShadow: "0 18px 44px rgba(15,23,42,0.10)",
    padding: 18,
    paddingRight: 90,
    minHeight: 0,
    overflow: "hidden",
    height: "100%",
    display: "grid",
    alignContent: "center",
    gap: 10,
  },
  kpiTopAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    height: 4,
    width: "100%",
    background: `linear-gradient(90deg, ${ACCENT} 0%, rgba(8,159,138,0.25) 60%, rgba(8,159,138,0) 100%)`,
  },
  kpiLabel: {
    fontWeight: 900,
    fontSize: 12,
    color: "#64748B",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  kpiPill: {
    marginTop: 4,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 10px",
    borderRadius: 999,
    border: "1px solid rgba(15,23,42,0.08)",
    background: "rgba(255,255,255,0.75)",
    color: "#0F172A",
    fontWeight: 900,
    fontSize: 12,
    width: "fit-content",
  },
  kpiPillDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    background: ACCENT,
    boxShadow: "0 0 0 5px rgba(8,159,138,0.12)",
  },
  kpiValueBig: {
    marginTop: 6,
    fontWeight: 980,
    fontSize: 44,
    lineHeight: 1.0,
    letterSpacing: -1.2,
    background: "linear-gradient(180deg, #0F172A 0%, rgba(15,23,42,0.70) 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  kpiEyeBtn: {
    position: "absolute",
    right: 14,
    top: "50%",
    transform: "translateY(-50%)",
    width: 52,
    height: 52,
    borderRadius: 18,
    border: "1px solid rgba(15,23,42,0.10)",
    background: "rgba(255,255,255,0.90)",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    color: "#0F172A",
    boxShadow: "0 14px 28px rgba(15,23,42,0.12)",
    backdropFilter: "blur(6px)",
  },
  kpiEyeBtnDisabled: {
    opacity: 0.55,
    cursor: "not-allowed",
    boxShadow: "none",
  },

  modePanel: {
    borderRadius: 22,
    border: "1px solid rgba(15,23,42,0.08)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.96) 100%)",
    boxShadow: "0 18px 44px rgba(15,23,42,0.10)",
    padding: 18,
    height: "100%",
    minHeight: 0,
    position: "relative",
    overflow: "hidden",
  },
  modeTitle: {
    fontWeight: 950,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#64748B",
  },
  modeSub: {
    marginTop: 10,
    fontWeight: 850,
    fontSize: 13,
    color: "#64748B",
    lineHeight: 1.45,
  },

  filtersToggleBtn: {
    borderRadius: 14,
    border: "1px solid rgba(15,23,42,0.10)",
    background: "rgba(255,255,255,0.9)",
    padding: "9px 12px",
    cursor: "pointer",
    fontWeight: 950,
    color: "#0F172A",
    boxShadow: "0 10px 24px rgba(15,23,42,0.06)",
    whiteSpace: "nowrap",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  },

  filtersToggleIcon: {
    width: 26,
    height: 26,
    borderRadius: 10,
    display: "grid",
    placeItems: "center",
    background: "rgba(15,23,42,0.06)",
    fontSize: 14,
  },

  filtersToggleBtnActive: {
    borderColor: "rgba(8,159,138,0.35)",
    boxShadow: "0 12px 28px rgba(8,159,138,0.18)",
  },

  filtersBox: {
    borderRadius: 16,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    padding: 12,
    marginBottom: 10,
  },

  filtersTitleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  filtersTitle: {
    fontWeight: 980,
    fontSize: 11,
    color: "#0F172A",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  filtersGrid: {
    marginTop: 8,
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },

  filterLabel: {
    fontWeight: 900,
    fontSize: 11,
    color: "#64748B",
  },

  filterInput: {
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#fff",
    padding: "9px 10px",
    outline: "none",
    fontWeight: 850,
    color: "#0F172A",
    height: 40,
  },

  filterField: { display: "grid", gap: 6 },

  filtersFooter: {
    marginTop: 10,
    display: "flex",
    justifyContent: "flex-end",
  },

  filtersHint: {
    fontWeight: 850,
    color: "#64748B",
    fontSize: 12,
  },

  clearBtn: {
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#fff",
    padding: "8px 12px",
    cursor: "pointer",
    fontWeight: 950,
    color: "#0F172A",
  },

  activosBody: {
    padding: 14,
    background: "#fff",
    display: "grid",
    gridTemplateRows: "auto 1fr",
    gap: 12,
    height: "60vh",
    minHeight: 0,
  },

  activosScroll: {
    overflow: "auto",
    paddingRight: 6,
    minHeight: 0,
  },

  activosList: {
    display: "grid",
    gap: 10,
  },

  activoRow: {
    border: "1px solid #E7E9F2",
    borderRadius: 18,
    padding: 14,
    background: "#fff",
    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
  },

  activoMain: { display: "grid", gap: 8 },

  activoNombre: { fontWeight: 980, color: "#0F172A", fontSize: 18 },

  activoEmpresa: { fontWeight: 900, color: "#0F172A" },

  activoMetaLine: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },

  badgeSoft: {
    borderRadius: 999,
    padding: "6px 10px",
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    fontWeight: 950,
    fontSize: 12,
    color: "#64748B",
  },

  activoMetaValue: { fontWeight: 900, color: "#0F172A" },

  uidBlock: {
    marginTop: 6,
    borderRadius: 16,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    padding: 12,
  },

  uidLabel: {
    fontWeight: 950,
    fontSize: 11,
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },

  uidValue: {
    marginTop: 6,
    fontWeight: 950,
    fontSize: 12,
    color: "#0F172A",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    wordBreak: "break-all",
  },

  emptyStateModal: {
    padding: 18,
    fontWeight: 850,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 1.45,
  },
};

const modal = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.45)",
    display: "grid",
    placeItems: "center",
    padding: 16,
    zIndex: 9999,
  },
  sheet: {
    width: "min(560px, 100%)",
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 20,
    overflow: "hidden",
    boxShadow: "0 18px 46px rgba(15,23,42,0.22)",
  },
  header: {
    padding: 14,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    borderBottom: "1px solid #EEF1F7",
    background: "#FBFCFF",
  },
  iconActivos: {
    width: 44,
    height: 44,
    borderRadius: 16,
    background: ACCENT,
    border: `1px solid ${ACCENT}`,
    display: "grid",
    placeItems: "center",
    fontSize: 18,
    color: "#fff",
  },
  title: { fontWeight: 980, color: "#0F172A" },
  sub: { marginTop: 2, fontWeight: 850, color: "#64748B", fontSize: 12 },
  close: {
    border: "1px solid #E7E9F2",
    background: "#fff",
    borderRadius: 14,
    width: 36,
    height: 36,
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    fontWeight: 950,
    color: "#0F172A",
  },
  actions: { padding: 14, display: "flex", gap: 10 },
  primary: {
    flex: 1,
    borderRadius: 16,
    border: `1px solid ${ACCENT}`,
    background: ACCENT,
    color: "#fff",
    padding: "12px 12px",
    fontWeight: 980,
    cursor: "pointer",
  },
};
