import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { onSnapshot, collection, query, where } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";

import { db, auth } from "../../firebase";
import { AuthCtx } from "../../auth/AuthProvider";
import {
  registrarEntradaPorCedula,
  registrarSalidaPorCedula,
} from "../../services/controlTerceros";
import { filterByUserScope } from "../../utils/dataScope";

const ACCENT = "#089F8A";

export default function ControlTercerosManual() {
  const authCtx = useContext(AuthCtx);
  const profile = authCtx?.profile || {};
  const authLoading = authCtx?.loading;
  const [mode, setMode] = useState("ENTRADA"); // ENTRADA | SALIDA
  const [cedula, setCedula] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null); // { kind, msg }
  const [activosCount, setActivosCount] = useState(0);

  //Filtros
  const [fNombre, setFNombre] = useState("");
  const [fEmpresa, setFEmpresa] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  //Activos en sitio (solo para mostrar en el KPI, no se usa para validaciones)
  const [activos, setActivos] = useState([]); // [{ id, nombre, empresa }]
  const [activosOpen, setActivosOpen] = useState(false);
  const [eyeHover, setEyeHover] = useState(false);

  //volver
  const nav = useNavigate();
  const back = () => nav(-1);

  const isEntrada = mode === "ENTRADA";

  const [blockedOpen, setBlockedOpen] = useState(false);
  const [blockedMsg, setBlockedMsg] = useState("");
  const inputRef = useRef(null);

  const fmtHora = (d) => {
    if (!d || !(d instanceof Date) || isNaN(d.getTime())) return "—";
    return d.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" });
  };

  const activosFiltrados = useMemo(() => {
    const n = fNombre.trim().toLowerCase();
    const e = fEmpresa.trim().toLowerCase();

    return activos.filter((u) => {
      const nn = String(u.nombre || "").toLowerCase();
      const ee = String(u.empresa || "").toLowerCase();
      return (!n || nn.includes(n)) && (!e || ee.includes(e));
    });
  }, [activos, fNombre, fEmpresa]);

  useEffect(() => {
    if (authLoading) return;
    const qActivos = query(
      collection(db, "usuariosTerceros"),
      where("entrada", "==", true)
    );

    const unsub = onSnapshot(
      qActivos,
      (snap) => {
        const scopedRows = filterByUserScope(
          snap.docs.map((d) => ({ id: d.id, ...d.data() })),
          profile?.tenantId,
          profile?.company
        );
        setActivosCount(scopedRows.length);

        const rows = scopedRows.map((data) => {

          const ts =
            data.entradaAt ||
            data.horaEntrada ||
            data.entrada_ts ||
            data.entradaFecha ||
            data.updatedAt ||
            null;

          const entradaAt =
            ts?.toDate?.() ? ts.toDate()
              : typeof ts === "number" ? new Date(ts)
                : typeof ts === "string" ? new Date(ts)
                  : null;

          return {
            id: data.id, // uid doc
            nombre: data.nombre || data.name || data.fullName || "Sin nombre",
            empresa: data.empresa || data.company || "Sin empresa",
            cedula: data.cedula || data.documento || data.doc || data.identificacion || "",
            entradaAt, // Date | null
          };
        });

        // opcional: ordenar por nombre
        rows.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));

        setActivos(rows);
      },
      (err) => console.log("activosCount/list error:", err)
    );

    return () => unsub();
  }, [authLoading, profile?.tenantId, profile?.company]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const closeBlocked = () => {
    setBlockedOpen(false);
    focusCedula();
  };

  const focusCedula = () => {
    // rAF ayuda a que el focus ocurra luego del re-render (por ejemplo después de setCedula / setBusy)
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.select?.();
    });
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;

      if (blockedOpen) closeBlocked();
      if (activosOpen) {
        setActivosOpen(false);
        setShowFilters(false);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [blockedOpen, activosOpen]);

  useEffect(() => {
    const style = document.createElement("style");
    style.setAttribute("data-spin", "1");
    style.innerHTML = "@keyframes spin { to { transform: rotate(360deg); } }";
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  useEffect(() => {
    focusCedula();
  }, [mode]);

  const canSubmit = useMemo(() => {
    const v = String(cedula).trim();
    return v.length > 0 && !busy;
  }, [cedula, busy]);

  const showToast = (kind, msg, ms = 1500) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), ms);
  };

  const onSubmit = async (e) => {
    e?.preventDefault?.();
    const v = String(cedula).trim();
    if (!v) return showToast("warn", "Ingresa una cédula.");

    setBusy(true);
    try {
      const res = isEntrada
        ? await registrarEntradaPorCedula(v, profile?.tenantId, profile?.company)
        : await registrarSalidaPorCedula(v, profile?.tenantId, profile?.company);

      if (res.kind === "blocked") {
        setBlockedMsg(res.msg || "Acceso bloqueado.");
        setBlockedOpen(true);
        setCedula("");
        return;
      }

      showToast(res.kind, res.msg);
      if (res.ok) setCedula("");
    } catch (err) {
      console.error("FIREBASE:", err?.code, err?.message, err);
      showToast("err", `${err?.code || "error"} · ${err?.message || "falló"}`);
    } finally {
      setBusy(false);
      focusCedula();
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.log(e);
      showToast("err", "No se pudo cerrar sesión.");
    }
  };

  const onFocusInput = (e) => {
    e.currentTarget.style.borderColor = ACCENT;
    e.currentTarget.style.boxShadow = "0 0 0 4px rgba(8, 159, 138, 0.12)";
  };

  const onBlurInput = (e) => {
    e.currentTarget.style.borderColor = "#e7e9f2";
    e.currentTarget.style.boxShadow = "none";
  };

  return (
    <div style={ui.shell}>
      {/* Top bar */}
      <div style={ui.topbar}>
        <div style={ui.brand}>
          <div style={{ display: "grid", gap: 2 }}>
            <div style={ui.brandTitle}>AppoloDesk</div>
            <div style={ui.brandSub}>Control de accesos · terceros</div>
          </div>
        </div>

        <div style={ui.topbarRight}>
          <button type="button" onClick={back} style={ui.btnGhost} disabled={busy}>
            ← Volver
          </button>

          <button type="button" onClick={logout} style={ui.btnGhost} disabled={busy}>
            Cerrar sesión
          </button>
        </div>
      </div>

      {/* Main */}
      <div style={ui.main}>
        <div style={ui.mainGrid}>
          {/* Columna izquierda */}
          <div style={ui.card}>
            <div style={ui.topAccent} />
            {/* Card header */}
            <div style={ui.cardHead}>
              <div>
                <div style={ui.cardKicker}>Registro manual</div>
                <div style={ui.cardTitle}>Entrada / Salida por cédula</div>
                <div style={ui.cardDesc}>
                  Pensado para digitación rápida o lector (scanner). Presioná Enter para registrar.
                </div>
              </div>

              <div style={ui.statusBox}>
                <div
                  style={{
                    ...ui.statusDot,
                    background: busy ? "#F59E0B" : isEntrada ? ACCENT : "#2563EB",
                    boxShadow: busy
                      ? "0 0 0 5px rgba(245, 158, 11, 0.15)"
                      : isEntrada
                        ? "0 0 0 5px rgba(8, 159, 138, 0.15)"
                        : "0 0 0 5px rgba(37, 99, 235, 0.15)",
                  }}
                />
                <div style={{ display: "grid", gap: 2 }}>
                  <div style={ui.statusTitle}>
                    {busy ? "Procesando…" : isEntrada ? "Modo Entrada" : "Modo Salida"}
                  </div>
                  <div style={ui.statusSub}>
                    {busy ? "Validando reglas y guardando movimiento" : "Listo para registrar"}
                  </div>
                </div>
              </div>
            </div>

            {/* Mode tabs*/}
            {/*<div style={ui.tabs}>
              <button
                type="button"
                onClick={() => setMode("ENTRADA")}
                disabled={busy}
                style={{ ...ui.tab, ...(mode === "ENTRADA" ? ui.tabActiveEntrada : ui.tabInactive) }}
              >
                <span style={ui.tabIcon} aria-hidden="true">↳</span>
                Entrada
              </button>

              <button
                type="button"
                onClick={() => setMode("SALIDA")}
                disabled={busy}
                style={{ ...ui.tab, ...(mode === "SALIDA" ? ui.tabActiveSalida : ui.tabInactive) }}
              >
                <span style={ui.tabIcon} aria-hidden="true">↰</span>
                Salida
              </button>
            </div>
            */}

            {/* Form */}
            <form onSubmit={onSubmit} style={ui.form}>
              <div style={ui.fieldRow}>
                <div style={ui.fieldLeft}>
                  <div style={ui.labelRow}>
                    <div style={ui.label}>Cédula</div>
                    <div style={ui.hint}>Sin puntos ni guiones</div>
                  </div>

                  <div style={ui.inputWrap}>
                    <span style={ui.inputIcon} aria-hidden="true">⌁</span>
                    <input
                      ref={inputRef}
                      value={cedula}
                      onChange={(e) => setCedula(e.target.value.replace(/\D/g, ""))}
                      autoComplete="off"
                      placeholder="Ej: 1XXXXXXXX"
                      inputMode="numeric"
                      autoFocus
                      disabled={busy}
                      style={ui.input}
                      onBlur={onBlurInput}
                      onFocus={(e) => { onFocusInput(e); e.currentTarget.select?.(); }}
                    />
                    <span style={ui.enterPill} aria-hidden="true">Enter</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  style={{
                    ...ui.btnPrimary,
                    ...(isEntrada ? ui.btnEntrada : ui.btnSalida),
                    ...(canSubmit ? {} : ui.btnDisabled),
                  }}
                >
                  {busy ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                      <span style={ui.spinner} />
                      Procesando…
                    </span>
                  ) : isEntrada ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                      <span style={ui.btnIcon} aria-hidden="true">↳</span>
                      Registrar entrada
                    </span>
                  ) : (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                      <span style={ui.btnIcon} aria-hidden="true">↰</span>
                      Registrar salida
                    </span>
                  )}
                </button>
              </div>

              {/* Info strip */}
              <div style={ui.infoStrip}>
                <div style={ui.infoItem}>
                  <div style={ui.infoTitle}>Validación</div>
                  <div style={ui.infoText}>
                    {isEntrada
                      ? "No permite entrada si ya tiene entrada activa o si ya marcó ENTRADA hoy."
                      : "No permite salida si no tiene entrada activa o si ya marcó SALIDA hoy."}
                  </div>
                </div>

                <div style={ui.divider} />

                <div style={ui.infoItem}>
                  <div style={ui.infoTitle}>Sugerencia</div>
                  <div style={ui.infoText}>
                    Usá lector/escáner para capturar la cédula y presioná <b>Enter</b>.
                  </div>
                </div>
              </div>
            </form>

            {/* Toast */}
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
                      ...(toast.kind === "warn" ? { background: "#F59E0B" } : {}),
                      ...(toast.kind === "err" ? { background: "#EF4444" } : {}),
                    }}
                  />
                  <div style={ui.toastMsg}>{toast.msg}</div>
                </div>
              </div>
            )}
          </div>
          {/* Columna derecha (donde marcaste en rojo) */}
          <div style={ui.side}>
            {/* KPI Activos */}
            <div style={ui.kpiSide}>
              <div style={ui.kpiTopAccent} />
              <div style={ui.kpiLabel}>Activos en sitio</div>

              <div style={ui.kpiPill}>
                <span style={ui.kpiPillDot} />
                En sitio ahora
              </div>

              <div style={ui.kpiValueBig}>{activosCount}</div>

              <button
                type="button"
                onClick={() => {
                  setActivosOpen(true);
                  setShowFilters(false);     // siempre abre oculto
                  setFNombre("");
                  setFEmpresa("");
                }} disabled={busy}
                style={{ ...ui.kpiEyeBtn, ...(busy ? ui.kpiEyeBtnDisabled : {}) }}
                title="Ver lista de activos"
                aria-label="Ver lista de activos"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            {/* Panel corporativo: Modo */}
            <div style={ui.modePanel}>
              <div style={ui.topAccent} />
              <div style={ui.modeTitle}>Modo</div>
              <div style={ui.modeSub}>Seleccioná qué vas a registrar</div>

              <div style={ui.modeTabs}>
                <button
                  type="button"
                  onClick={() => setMode("ENTRADA")}
                  disabled={busy}
                  style={{
                    ...ui.modeTab,
                    ...(mode === "ENTRADA" ? ui.modeTabActiveEntrada : ui.modeTabInactive),
                  }}
                >
                  <span style={ui.modeTabIcon} aria-hidden="true">↳</span>
                  Entrada
                </button>

                <button
                  type="button"
                  onClick={() => setMode("SALIDA")}
                  disabled={busy}
                  style={{
                    ...ui.modeTab,
                    ...(mode === "SALIDA" ? ui.modeTabActiveSalida : ui.modeTabInactive),
                  }}
                >
                  <span style={ui.modeTabIcon} aria-hidden="true">↰</span>
                  Salida
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL BLOQUEADO */}
      {blockedOpen && (
        <div style={modal.backdrop} onClick={closeBlocked}>
          <div style={modal.sheet} onClick={(e) => e.stopPropagation()}>
            <div style={modal.header}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={modal.icon} aria-hidden="true">⛔</div>
                <div>
                  <div style={modal.title}>Acceso bloqueado</div>
                  <div style={modal.sub}>Este usuario no puede registrar movimientos.</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button type="button" onClick={closeBlocked} style={modal.close}>
                    ✕
                  </button>
                </div>
              </div>
            </div>

            <div style={modal.body}>{blockedMsg || "Acceso bloqueado."}</div>

            <div style={modal.actions}>
              <button type="button" onClick={closeBlocked} style={modal.primary}>
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ACTIVOS EN SITIO */}
      {activosOpen && (
        <div
          style={modal.backdrop}
          onClick={() => {
            setActivosOpen(false);
            setShowFilters(false);
          }}
        >          <div style={modal.sheet} onClick={(e) => e.stopPropagation()}>
            <div style={modal.header}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={modal.icon} aria-hidden="true">👁</div>
                <div>
                  <div style={modal.title}>Activos en sitio</div>
                  <div style={modal.sub}>
                    {activos.length} usuario(s) con entrada activa
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowFilters((v) => !v)}
                  style={{
                    ...ui.filtersToggleBtn,
                    ...(showFilters ? ui.filtersToggleBtnActive : {}),
                  }}
                  aria-label={showFilters ? "Ocultar filtros" : "Mostrar filtros"}
                  title={showFilters ? "Ocultar filtros" : "Mostrar filtros"}
                  disabled={busy}
                >
                  <span style={ui.filtersToggleIcon} aria-hidden="true">🔎</span>
                  Filtros
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActivosOpen(false);
                    setShowFilters(false);
                  }}
                  style={modal.close}
                >
                  ✕
                </button>
              </div>
            </div>

            <div style={ui.activosBody}>
              {showFilters && (
                <div style={ui.filtersBox}>
                  <div style={ui.filtersTitleRow}>
                    <div style={ui.filtersTitle}>Filtros</div>
                    <div style={ui.filtersHint}>
                      Mostrando <b>{activosFiltrados.length}</b> de <b>{activos.length}</b>
                    </div>
                  </div>

                  <div style={ui.filtersGrid}>
                    <div style={ui.filterField}>
                      <div style={ui.filterLabel}>Nombre</div>
                      <input
                        value={fNombre}
                        onChange={(e) => setFNombre(e.target.value)}
                        placeholder="Buscar por nombre…"
                        style={ui.filterInput}
                      />
                    </div>

                    <div style={ui.filterField}>
                      <div style={ui.filterLabel}>Empresa</div>
                      <input
                        value={fEmpresa}
                        onChange={(e) => setFEmpresa(e.target.value)}
                        placeholder="Buscar por empresa…"
                        style={ui.filterInput}
                      />
                    </div>
                  </div>

                  <div style={ui.filtersFooter}>
                    <button
                      type="button"
                      onClick={() => { setFNombre(""); setFEmpresa(""); }}
                      style={ui.clearBtn}
                    >
                      Limpiar
                    </button>
                  </div>
                </div>
              )}
              <div style={ui.activosScroll}>
                {activosFiltrados.length === 0 ? (
                  <div style={ui.emptyState}>No hay resultados con esos filtros.</div>
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
                            <span style={ui.activoMetaValue}>{u.cedula || "—"}</span>
                          </div>

                          <div style={ui.activoMetaLine}>
                            <span style={ui.badgeSoft}>Entrada</span>
                            <span style={ui.activoMetaValue}>{fmtHora(u.entradaAt)}</span>
                          </div>

                          {/* UID debajo de empresa (en bloque propio) */}
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
                  setActivosOpen(false);
                  setShowFilters(false);
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
    width: "100vw",
    background: "#F6F7FB",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    color: "#0F172A",
    overflow: "hidden",
    display: "grid",
    gridTemplateRows: "auto 1fr",
  },

  topbar: {
    height: 64,
    padding: "10px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: "1px solid #E7E9F2",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(246,247,251,0.95) 100%)",
    backdropFilter: "blur(6px)",
  },

  topAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    height: 4,
    width: "100%",
    background: `linear-gradient(90deg, ${ACCENT} 0%, rgba(8,159,138,0.25) 60%, rgba(8,159,138,0) 100%)`,
  },

  brand: { display: "flex", alignItems: "center", gap: 12 },

  brandMark: {
    width: 42,
    height: 42,
    borderRadius: 14,
    background: ACCENT,
    color: "#fff",
    display: "grid",
    placeItems: "center",
    fontWeight: 950,
    letterSpacing: 0.4,
    boxShadow: "0 12px 24px rgba(8,159,138,0.20)",
  },
  brandTitle: { fontWeight: 950, fontSize: 14 },
  brandSub: { fontWeight: 800, fontSize: 12, color: "#64748B" },

  topbarRight: { display: "flex", alignItems: "center", gap: 12 },

  kpi: {
    position: "relative",
    display: "grid",
    gap: 2,
    padding: "8px 12px",
    paddingLeft: 52,      // <-- espacio para el ojo
    paddingBottom: 44,    // <-- espacio para el ojo
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#fff",
    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
    minWidth: 180,        // <-- un poco más ancho para que no se apriete
  },

  kpiLabel: { fontWeight: 900, fontSize: 12, color: "#64748B", letterSpacing: 0.6, textTransform: "uppercase" },

  kpiPill: {
    marginTop: 10,
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
  }, kpiValue: { fontWeight: 950, fontSize: 18, color: "#0F172A", lineHeight: 1.1 },

  kpiValueBig: {
    marginTop: 10,
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

  kpiEyeBtnDisabled: {
    opacity: 0.55,
    cursor: "not-allowed",
    boxShadow: "none",
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

  main: {
    display: "grid",
    placeItems: "center",
    padding: 16,
    overflow: "hidden", // 👈 no scroll acá
  },

  mainGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 820px) 320px",
    gap: 16,
    alignItems: "stretch",
    justifyContent: "center",
    width: "100%",
    maxHeight: "calc(100vh - 64px - 32px)", // topbar(64) + padding(16*2)
  },

  side: {
    display: "grid",
    gridTemplateRows: "1fr 1fr", // 👈 ambos paneles mismo alto
    gap: 16,
    height: "100%",             // 👈 ocupa todo el alto de la fila
  },
  kpiSide: {
    position: "relative",
    borderRadius: 22,
    border: "1px solid rgba(15,23,42,0.08)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.96) 100%)",
    boxShadow: "0 18px 44px rgba(15,23,42,0.10)",
    padding: 18,
    paddingRight: 90,   // <-- espacio para el botón ojo
    minHeight: 130,
    overflow: "hidden",
    height: "100%",
    minHeight: 0,
    display: "grid",
    alignContent: "center",
    gap: 10,
    paddingRight: 90,
  },
  kpiTopAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    height: 4,
    width: "100%",
    background: `linear-gradient(90deg, ${ACCENT} 0%, rgba(8,159,138,0.25) 60%, rgba(8,159,138,0) 100%)`,
  },
  card: {
    width: "min(820px, 100%)",
    background: "#fff",
    borderRadius: 20,
    border: "1px solid #E7E9F2",
    boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
    overflow: "hidden",
    height: "100%",
    minHeight: 0,
    position: "relative",
    overflow: "hidden",
  },

  cardHead: {
    padding: 16,
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
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
    minWidth: 260,
  },
  statusDot: { width: 10, height: 10, borderRadius: 999 },
  statusTitle: { fontWeight: 980, color: "#0F172A" },
  statusSub: { fontWeight: 800, fontSize: 12, color: "#64748B" },

  tabs: {
    padding: 12,
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    background: "#FBFCFF",
    borderBottom: "1px solid #EEF1F7",
  },
  tab: {
    borderRadius: 16,
    padding: "12px 12px",
    border: "1px solid transparent",
    cursor: "pointer",
    fontWeight: 980,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  tabIcon: {
    width: 28,
    height: 28,
    borderRadius: 12,
    display: "grid",
    placeItems: "center",
    background: "rgba(15,23,42,0.06)",
  },
  tabInactive: { background: "#fff", borderColor: "#E7E9F2", color: "#0F172A" },
  tabActiveEntrada: {
    background: ACCENT,
    borderColor: ACCENT,
    color: "#fff",
    boxShadow: "0 14px 26px rgba(8,159,138,0.18)",
  },
  tabActiveSalida: {
    background: "#2563EB",
    borderColor: "#2563EB",
    color: "#fff",
    boxShadow: "0 14px 26px rgba(37,99,235,0.18)",
  },

  form: { padding: 16, display: "grid", gap: 14, minHeight: 0 },

  fieldRow: {
    display: "grid",
    gridTemplateColumns: "1fr 240px",
    gap: 12,
    alignItems: "end",
  },
  fieldLeft: { display: "grid", gap: 10 },

  labelRow: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 },
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
  btnSalida: {
    background: "#2563EB",
    borderColor: "#2563EB",
    boxShadow: "0 18px 32px rgba(37,99,235,0.20)",
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
    animation: "spin 900ms linear infinite",
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
  infoTitle: { fontWeight: 980, fontSize: 12, color: "#0F172A", letterSpacing: 0.4, textTransform: "uppercase" },
  infoText: { fontWeight: 850, color: "#64748B", fontSize: 13, lineHeight: 1.35 },

  toast: {
    marginTop: 2,
    borderRadius: 18,
    border: "1px solid #E7E9F2",
    background: "#fff",
    padding: 14,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  toastLeft: { display: "flex", alignItems: "center", gap: 10 },
  toastDot: { width: 10, height: 10, borderRadius: 999, background: "#64748B" },
  toastMsg: { fontWeight: 950, color: "#0F172A" },
  toastOk: { background: "#F3FBF9", borderColor: "rgba(8,159,138,0.35)" },
  toastWarn: { background: "#FFFBF2", borderColor: "rgba(245,158,11,0.35)" },
  toastErr: { background: "#FFF6F6", borderColor: "rgba(239,68,68,0.35)" },
  eyeFab: {
    position: "fixed",
    left: 16,
    bottom: 16,
    width: 56,
    height: 56,
    borderRadius: 18,
    border: "1px solid #E7E9F2",
    background: "#fff",
    boxShadow: "0 18px 40px rgba(15,23,42,0.14)",
    cursor: "pointer",
    fontWeight: 950,
    fontSize: 18,
    display: "grid",
    placeItems: "center",
    zIndex: 9998,
  },

  activosBody: {
    padding: 14,
    maxHeight: "60vh",
    overflow: "auto",
    background: "#fff",
  },

  activosList: {
    display: "grid",
    gap: 10,
  },

  activoRow: {
    border: "1px solid #E7E9F2",
    borderRadius: 16,
    padding: 12,
    background: "#FBFCFF",
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 12,
    alignItems: "center",
  },

  activoMain: { display: "grid", gap: 4 },
  activoNombre: { fontWeight: 980, color: "#0F172A" },
  activoEmpresa: { fontWeight: 850, color: "#64748B", fontSize: 13 },

  activoUidWrap: {
    textAlign: "right",
    display: "grid",
    gap: 4,
    minWidth: 160,
  },
  activoUidLabel: { fontWeight: 850, fontSize: 11, color: "#94A3B8", textTransform: "uppercase" },
  activoUid: {
    fontWeight: 950,
    fontSize: 12,
    color: "#0F172A",
    padding: "6px 8px",
    borderRadius: 12,
    border: "1px solid #E7E9F2",
    background: "#fff",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },

  emptyState: {
    padding: 16,
    borderRadius: 16,
    border: "1px dashed #E7E9F2",
    background: "#FBFCFF",
    color: "#64748B",
    fontWeight: 850,
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
    marginTop: 6,
    fontWeight: 850,
    fontSize: 13,
    color: "#64748B",
  },

  modeTabs: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },

  modeTab: {
    borderRadius: 18,
    padding: "12px 12px",
    border: "1px solid transparent",
    cursor: "pointer",
    fontWeight: 980,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },

  modeTabIcon: {
    width: 30,
    height: 30,
    borderRadius: 14,
    display: "grid",
    placeItems: "center",
    background: "rgba(15,23,42,0.06)",
  },

  modeTabInactive: {
    background: "#fff",
    borderColor: "rgba(15,23,42,0.08)",
    color: "#0F172A",
  },

  modeTabActiveEntrada: {
    background: ACCENT,
    borderColor: ACCENT,
    color: "#fff",
    boxShadow: "0 14px 26px rgba(8,159,138,0.18)",
  },

  modeTabActiveSalida: {
    background: "#2563EB",
    borderColor: "#2563EB",
    color: "#fff",
    boxShadow: "0 14px 26px rgba(37,99,235,0.18)",
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
    padding: 12,        // 👈 menos padding
    marginBottom: 10,   // 👈 menos margen
  },

  filtersTitleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  filtersTitle: {
    fontWeight: 980,
    fontSize: 11,       // 👈 más pequeño
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
    fontSize: 11,       // 👈 más pequeño
    color: "#64748B",
  },

  filterInput: {
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#fff",
    padding: "9px 10px",  // 👈 más compacto
    outline: "none",
    fontWeight: 850,
    color: "#0F172A",
    height: 40,           // 👈 más bajo
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
    padding: "8px 12px",  // 👈 más chico
    cursor: "pointer",
    fontWeight: 950,
    color: "#0F172A",
  },

  // Body del modal ahora es layout "filtros arriba + lista scrolleable"
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

  // nuevo layout dentro del item
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
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    wordBreak: "break-all",
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
  icon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    background: "#FFF6F6",
    border: "1px solid rgba(239,68,68,0.30)",
    display: "grid",
    placeItems: "center",
    fontSize: 18,
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
  body: {
    padding: 14,
    fontWeight: 900,
    color: "#0F172A",
    lineHeight: 1.35,
    background: "#FFF6F6",
    borderTop: "1px solid rgba(239,68,68,0.18)",
    borderBottom: "1px solid rgba(239,68,68,0.18)",
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
  eyeFab: {
    position: "fixed",
    left: 16,
    bottom: 16,
    width: 56,
    height: 56,
    borderRadius: 18,
    border: "1px solid #E7E9F2",
    background: "#fff",
    boxShadow: "0 18px 40px rgba(15,23,42,0.14)",
    cursor: "pointer",
    fontWeight: 950,
    fontSize: 18,
    display: "grid",
    placeItems: "center",
    zIndex: 9998,
  },

  activosBody: {
    padding: 14,
    maxHeight: "60vh",
    overflow: "auto",
    background: "#fff",
  },

  activosList: {
    display: "grid",
    gap: 10,
  },

  activoRow: {
    border: "1px solid #E7E9F2",
    borderRadius: 16,
    padding: 12,
    background: "#FBFCFF",
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 12,
    alignItems: "center",
  },

  activoMain: { display: "grid", gap: 4 },
  activoNombre: { fontWeight: 980, color: "#0F172A" },
  activoEmpresa: { fontWeight: 850, color: "#64748B", fontSize: 13 },

  activoUidWrap: {
    textAlign: "right",
    display: "grid",
    gap: 4,
    minWidth: 160,
  },
  activoUidLabel: { fontWeight: 850, fontSize: 11, color: "#94A3B8", textTransform: "uppercase" },
  activoUid: {
    fontWeight: 950,
    fontSize: 12,
    color: "#0F172A",
    padding: "6px 8px",
    borderRadius: 12,
    border: "1px solid #E7E9F2",
    background: "#fff",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },

  emptyState: {
    padding: 16,
    borderRadius: 16,
    border: "1px dashed #E7E9F2",
    background: "#FBFCFF",
    color: "#64748B",
    fontWeight: 850,
  },
};