// EquipoInfoPage.jsx
import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  doc,
  getDoc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";
import { db } from "../../firebase";
import { AuthCtx } from "../../auth/AuthProvider";
import { filterByUserScope, isInUserScope } from "../../utils/dataScope";

import ApiladorPng from "../../assets/equipos/apilador_icon.png";
import CarretillaPng from "../../assets/equipos/carretilla_icon.png";
import MontacargasPng from "../../assets/equipos/montacargas_icon.png";

const ACCENT = "#089F8A";

function safe(v) {
  return String(v ?? "").trim();
}
function val(v) {
  const s = safe(v);
  return s ? s : "—";
}
function getEquipoIcon(familia) {
  const f = safe(familia).toLowerCase();
  if (f.includes("apilador")) return ApiladorPng;
  if (f.includes("montacargas")) return MontacargasPng;
  if (f.includes("carretilla")) return CarretillaPng;
  return CarretillaPng;
}
function toLocale(ts) {
  const d = ts?.toDate?.();
  return d ? d.toLocaleString("es-CR") : "—";
}

function Chip({ text, tone = "neutral" }) {
  const toneStyle =
    tone === "ok"
      ? ui.chipOk
      : tone === "warn"
        ? ui.chipWarn
        : tone === "info"
          ? ui.chipInfo
          : ui.chipNeutral;

  return (
    <span style={{ ...ui.chip, ...toneStyle }} title={text}>
      {text}
    </span>
  );
}

function Row({ label, value }) {
  return (
    <div style={ui.row}>
      <div style={ui.rowLabel}>{label}</div>
      <div style={ui.rowValue}>{val(value)}</div>
    </div>
  );
}

function SectionIconBtn({ title, subtitle, icon, onClick }) {
  return (
    <button type="button" style={ui.sectionBtn} onClick={onClick}>
      <div style={ui.sectionIconCircle}>
        <span style={ui.sectionIconTxt} aria-hidden>
          {icon}
        </span>
      </div>

      <div style={{ flex: 1, textAlign: "left" }}>
        <div style={ui.sectionBtnTitle}>{title}</div>
        {subtitle ? <div style={ui.sectionBtnSub}>{subtitle}</div> : null}
      </div>

      <div style={ui.sectionChevron}>›</div>
    </button>
  );
}

export default function EquipoInfoPage() {
  const nav = useNavigate();
  const { id } = useParams(); // ruta: /mantenimiento/equipos/:id
  const authCtx = useContext(AuthCtx);
  const profile = authCtx?.profile || {};
  const authLoading = authCtx?.loading;

  const [equipo, setEquipo] = useState(null);
  const [loading, setLoading] = useState(true);

  // modales
  const [modalOpen, setModalOpen] = useState(false);
  const [modalKey, setModalKey] = useState(null); // general | control | id | historial

  // historial de fallas
  const [historial, setHistorial] = useState([]);
  const [historialLoading, setHistorialLoading] = useState(false);

  // editar
  const [editOpen, setEditOpen] = useState(false);
  const [editNombre, setEditNombre] = useState("");
  const [editResponsable, setEditResponsable] = useState("");
  const [editSuplente, setEditSuplente] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // ✅ traer equipo (onSnapshot para UI “viva”)
  useEffect(() => {
    if (authLoading) return;
    if (!id) return;

    setLoading(true);
    const ref = doc(db, "equipos", id);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setEquipo(null);
          setLoading(false);
          return;
        }
        const row = { id: snap.id, ...snap.data() };
        if (!isInUserScope(row, profile?.tenantId, profile?.company)) {
          setEquipo(null);
          setLoading(false);
          return;
        }
        setEquipo(row);
        setLoading(false);
      },
      async (err) => {
        console.error("EquipoInfoPage onSnapshot error:", err);
        // fallback (por si reglas bloquean snapshot pero permite getDoc)
        try {
          const snap = await getDoc(ref);
          if (!snap.exists()) {
            setEquipo(null);
          } else {
            const row = { id: snap.id, ...snap.data() };
            setEquipo(
              isInUserScope(row, profile?.tenantId, profile?.company) ? row : null
            );
          }
        } catch (e) {
          console.error("EquipoInfoPage getDoc error:", e);
          setEquipo(null);
        } finally {
          setLoading(false);
        }
      }
    );

    return () => unsub();
  }, [id, authLoading, profile?.tenantId, profile?.company]);

  const familia = equipo?.familia || "";
  const estado = equipo?.estado || "";
  const propiedad = equipo?.propiedad || "";

  const estadoTone = useMemo(() => {
    if (!estado) return "neutral";
    const e = safe(estado).toLowerCase();
    if (e === "activo") return "ok";
    if (e.includes("mantenimiento")) return "warn";
    return "warn";
  }, [estado]);

  const propiedadTone = useMemo(() => {
    if (!propiedad) return "neutral";
    const p = safe(propiedad).toLowerCase();
    if (p === "propio") return "info";
    return "warn";
  }, [propiedad]);

  const revisionTone = equipo?.checklistD === false ? "warn" : "ok";
  const revisionTxt = equipo?.checklistD === false ? "Pendiente" : "Al día";

  const openModal = async (key) => {
    setModalKey(key);
    setModalOpen(true);

    if (key === "historial") {
      await loadHistorialFallas();
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalKey(null);
  };

  const modalTitle =
    modalKey === "general"
      ? "Datos generales"
      : modalKey === "control"
        ? "Control"
        : modalKey === "id"
          ? "Identificación"
          : modalKey === "historial"
            ? "Historial de fallas"
            : "";

  const modalRows = useMemo(() => {
    if (!equipo || !modalKey) return [];

    if (modalKey === "general") {
      return [
        ["Marca", equipo.marca],
        ["Familia", equipo.familia],
        ["Propiedad", equipo.propiedad],
        ["Estado", equipo.estado],
        ["Responsable", equipo.responsable],
        ["Suplente", equipo.suplente],
      ];
    }

    if (modalKey === "control") {
      return [
        ["Checklist diaria pendiente", equipo.checklistD === false ? "Sí" : "No"],
        ["Última actualización", toLocale(equipo.updatedAt)],
        ["Creado", toLocale(equipo.createdAt)],
      ];
    }

    // id
    return [
      ["ID", equipo.id],
      ["Código / Placa", equipo.codigo || equipo.placa],
      ["Serie", equipo.serie],
      ["Modelo", equipo.modelo],
    ];
  }, [equipo, modalKey]);

  const setEstadoEquipo = async (nextEstado) => {
    if (!id) return;
    try {
      await updateDoc(doc(db, "equipos", id), {
        estado: nextEstado,
        updatedAt: serverTimestamp(),
      });
      // onSnapshot actualiza UI
    } catch (e) {
      console.error("setEstadoEquipo error:", e);
      alert("No se pudo actualizar el estado. Intentá de nuevo.");
    }
  };

  const toggleFalla = async () => {
    if (!id) return;
    const activa = equipo?.fallaActiva === true;
    const next = !activa;

    const ok = window.confirm(
      `¿Deseás cambiar la falla a ${next ? "Activa" : "Inactiva"}?`
    );
    if (!ok) return;

    try {
      await updateDoc(doc(db, "equipos", id), {
        fallaActiva: next, // ✅ correcto
        fallaUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error("toggleFalla error:", e);
      alert("No se pudo cambiar el estado de la falla.");
    }
  };

  const loadHistorialFallas = async () => {
    if (!id) return;

    setHistorialLoading(true);
    try {
      const qRef = query(
        collection(db, "checklists_diarias"),
        where("equipoId", "==", id),
        where("hasFallas", "==", true),
        orderBy("createdAt", "desc"),
        limit(50)
      );

      const snap = await getDocs(qRef);
      const rows = filterByUserScope(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })),
        profile?.tenantId,
        profile?.company
      );
      setHistorial(rows);
    } catch (e) {
      console.error("loadHistorialFallas error:", e);
      setHistorial([]);
    } finally {
      setHistorialLoading(false);
    }
  };

  const openEdit = () => {
    setEditNombre(equipo?.equipo ?? "");
    setEditResponsable(equipo?.responsable ?? "");
    setEditSuplente(equipo?.suplente ?? "");
    setEditOpen(true);
  };

  const closeEdit = () => setEditOpen(false);

  const saveEdit = async () => {
    if (!id) return;

    const nombre = safe(editNombre);
    const resp = safe(editResponsable);
    const supl = safe(editSuplente);

    if (!nombre) {
      alert("El campo Nombre no puede quedar vacío.");
      return;
    }

    setSavingEdit(true);
    try {
      await updateDoc(doc(db, "equipos", id), {
        equipo: nombre,
        responsable: resp,
        suplente: supl,
        updatedAt: serverTimestamp(),
      });
      setEditOpen(false);
    } catch (e) {
      console.error("saveEdit error:", e);
      alert("No se pudo guardar. Revisá permisos.");
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div style={ui.shell}>
      {/* Topbar */}
      <div style={ui.topbar}>
        <div style={ui.brand} onClick={() => nav("/mantenimiento")}>
          <div style={{ display: "grid", gap: 2 }}>
            <div style={ui.brandTitle}>Mantenimiento</div>
            <div style={ui.brandSub}>Equipo · Información</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button type="button" onClick={() => nav(-1)} style={ui.btnGhost}>
            ← Volver
          </button>
        </div>
      </div>

      <div style={ui.main}>
        <div style={ui.container}>
          {/* States */}
          {loading ? (
            <div style={ui.stateCard}>
              <div style={ui.spinner} />
              <div style={{ fontWeight: 900, color: "#64748B" }}>
                Cargando equipo…
              </div>
            </div>
          ) : !equipo ? (
            <div style={ui.stateCard}>
              <div style={{ fontWeight: 950, color: "#0F172A" }}>
                No se encontró la información del equipo.
              </div>
              <button
                type="button"
                style={{ ...ui.btnGhost, marginTop: 10 }}
                onClick={() => nav(-1)}
              >
                Volver
              </button>
            </div>
          ) : (
            <>
              {/* HERO */}
              <div style={ui.hero}>
                <div style={ui.heroTop}>
                  <div style={ui.iconCircle}>
                    <img
                      src={getEquipoIcon(familia)}
                      alt="equipo"
                      style={ui.iconImg}
                    />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={ui.heroTitle} title={equipo?.equipo || "Equipo"}>
                      {equipo?.equipo || "Equipo"}
                    </div>

                    <div style={ui.chipsRow}>
                      {familia ? <Chip text={familia} /> : null}
                      {estado ? <Chip text={estado} tone={estadoTone} /> : null}
                      {propiedad ? (
                        <Chip text={propiedad} tone={propiedadTone} />
                      ) : null}
                      <Chip text={`Revisión: ${revisionTxt}`} tone={revisionTone} />
                    </div>
                  </div>

                  <button type="button" onClick={openEdit} style={ui.editBtn}>
                    ✎ Editar
                  </button>
                </div>

                <div style={ui.heroBottom}>
                  <div style={ui.heroLine}>
                    <span style={ui.heroLineLabel}>Responsable:</span>{" "}
                    {val(equipo?.responsable)}
                  </div>

                  <div style={ui.heroLine}>
                    <span style={ui.heroLineLabel}>Suplente:</span>{" "}
                    {val(equipo?.suplente)}
                  </div>

                  <div style={ui.heroLine}>
                    <span style={ui.heroLineLabel}>Código:</span>{" "}
                    {val(equipo?.codigo)}
                  </div>

                  {/* Cambiar estado */}
                  <div style={ui.block}>
                    <div style={ui.blockLabel}>Cambiar estado</div>
                    <div style={ui.estadoRow}>
                      {["Activo", "Inactivo", "Mantenimiento"].map((s) => {
                        const active =
                          safe(equipo?.estado).toLowerCase() === s.toLowerCase();
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setEstadoEquipo(s)}
                            style={{
                              ...ui.estadoBtn,
                              ...(active ? ui.estadoBtnActive : {}),
                            }}
                          >
                            <span
                              style={{
                                ...ui.estadoBtnTxt,
                                ...(active ? ui.estadoBtnTxtActive : {}),
                              }}
                            >
                              {s}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Falla */}
                  <div style={ui.block}>
                    <div style={ui.blockLabel}>Falla</div>
                    <div style={ui.fallaRow}>
                      <div
                        style={{
                          ...ui.fallaPill,
                          ...(equipo?.fallaActiva ? ui.fallaPillOn : ui.fallaPillOff),
                        }}
                      >
                        <span
                          style={{
                            ...ui.fallaPillTxt,
                            ...(equipo?.fallaActiva
                              ? ui.fallaPillTxtOn
                              : ui.fallaPillTxtOff),
                          }}
                        >
                          {equipo?.fallaActiva ? "Activa" : "Inactiva"}
                        </span>
                      </div>

                      <button type="button" onClick={toggleFalla} style={ui.fallaBtn}>
                        {equipo?.fallaActiva ? "Marcar Inactiva" : "Marcar Activa"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Secciones */}
              <div style={ui.sectionsWrap}>
                <SectionIconBtn
                  icon="📄"
                  title="Datos generales"
                  subtitle="Marca, familia, estado, responsables"
                  onClick={() => openModal("general")}
                />
                <SectionIconBtn
                  icon="✅"
                  title="Control"
                  subtitle="Checklist, fechas, estado operativo"
                  onClick={() => openModal("control")}
                />
                <SectionIconBtn
                  icon="🆔"
                  title="Identificación"
                  subtitle="ID, código/placa, serie, modelo"
                  onClick={() => openModal("id")}
                />
                <SectionIconBtn
                  icon="⚠️"
                  title="Historial de fallas"
                  subtitle="Todas las fallas registradas"
                  onClick={() => openModal("historial")}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* MODAL (sheet) */}
      {modalOpen && (
        <div style={ui.modalBackdrop} onMouseDown={closeModal}>
          <div
            style={ui.modalCard}
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div style={ui.modalHeader}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={ui.modalTitle}>{modalTitle}</div>
                <div style={ui.modalSub} title={equipo?.equipo || "Equipo"}>
                  {equipo?.equipo || "Equipo"}
                </div>
              </div>

              <button type="button" onClick={closeModal} style={ui.modalCloseBtn}>
                ✕
              </button>
            </div>

            <div style={ui.modalDivider} />

            <div style={ui.modalBody}>
              {modalKey !== "historial" ? (
                modalRows.map(([k, v]) => <Row key={k} label={k} value={v} />)
              ) : historialLoading ? (
                <div style={{ padding: 14, textAlign: "center", color: "#64748B", fontWeight: 900 }}>
                  Cargando historial…
                </div>
              ) : historial.length === 0 ? (
                <div style={{ padding: 14, textAlign: "center", color: "#64748B", fontWeight: 900 }}>
                  No hay fallas registradas para este equipo.
                </div>
              ) : (
                historial.map((h) => {
                  const fecha = toLocale(h.createdAt);
                  const fallas = Array.isArray(h.fallas) ? h.fallas : [];
                  return (
                    <div key={h.id} style={ui.histItem}>
                      <div style={ui.histTitle}>{fecha}</div>
                      {h.creadoPorNombre ? (
                        <div style={ui.histSub}>Por: {h.creadoPorNombre}</div>
                      ) : null}
                      <div style={ui.histBody}>
                        {fallas.length > 0
                          ? fallas.map((f, idx) => (
                            <div key={`${h.id}-${idx}`}>• {f?.label ?? "Falla"}</div>
                          ))
                          : "—"}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <button type="button" onClick={closeModal} style={ui.modalPrimaryBtn}>
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* MODAL EDIT */}
      {editOpen && (
        <div style={ui.modalBackdrop} onMouseDown={closeEdit}>
          <div
            style={ui.modalCard}
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div style={ui.modalHeader}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={ui.modalTitle}>Editar equipo</div>
                <div style={ui.modalSub} title={equipo?.equipo || "Equipo"}>
                  {equipo?.equipo || "Equipo"}
                </div>
              </div>

              <button type="button" onClick={closeEdit} style={ui.modalCloseBtn}>
                ✕
              </button>
            </div>

            <div style={ui.modalDivider} />

            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <div style={ui.inputLabel}>Nombre</div>
                <input
                  value={editNombre}
                  onChange={(e) => setEditNombre(e.target.value)}
                  style={ui.input}
                  placeholder="Ej: Montacargas 01"
                />
              </div>

              <div>
                <div style={ui.inputLabel}>Responsable</div>
                <input
                  value={editResponsable}
                  onChange={(e) => setEditResponsable(e.target.value)}
                  style={ui.input}
                  placeholder="Ej: Juan Pérez"
                />
              </div>

              <div>
                <div style={ui.inputLabel}>Suplente</div>
                <input
                  value={editSuplente}
                  onChange={(e) => setEditSuplente(e.target.value)}
                  style={ui.input}
                  placeholder="Ej: Ana Gómez"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={saveEdit}
              disabled={savingEdit}
              style={{ ...ui.modalPrimaryBtn, opacity: savingEdit ? 0.65 : 1 }}
            >
              {savingEdit ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const ui = {
  shell: {
    width: "98.78vw",
    minHeight: "100vh",
    background: "#F6F7FB",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    color: "#0F172A",
    display: "grid",
    gridTemplateRows: "auto 1fr",
    overflowX: "hidden",
  },

  topbar: {
    minHeight: 64,
    padding: "10px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: "1px solid #E7E9F2",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(246,247,251,0.96) 100%)",
    backdropFilter: "blur(6px)",
    position: "sticky",
    top: 0,
    zIndex: 50,
    gap: 12,
    flexWrap: "wrap",
  },

  brand: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    cursor: "pointer",
    userSelect: "none",
    minWidth: 240,
  },
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
    flexShrink: 0,
  },
  brandTitle: { fontWeight: 950, fontSize: 14, lineHeight: "16px" },
  brandSub: { fontWeight: 800, fontSize: 12, color: "#64748B", lineHeight: "14px" },

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

  main: { width: "100%", padding: 16, display: "block" },
  container: { width: "100%", maxWidth: "1100px", margin: "0 auto", display: "grid", gap: 14 },

  stateCard: {
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 20,
    padding: 16,
    boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
    display: "grid",
    placeItems: "center",
    gap: 10,
  },
  spinner: {
    width: 28,
    height: 28,
    borderRadius: 999,
    border: "3px solid #E7E9F2",
    borderTop: `3px solid ${ACCENT}`,
    animation: "spin 0.9s linear infinite",
  },

  hero: {
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 20,
    padding: 14,
    boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
  },
  heroTop: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" },

  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 18,
    background: "#F2F4FB",
    border: "1px solid #E7E9F2",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  iconImg: { width: 34, height: 34, objectFit: "contain" },

  heroTitle: {
    fontWeight: 980,
    fontSize: 18,
    lineHeight: "22px",
    marginBottom: 6,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  chipsRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  chip: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #E7E9F2",
    background: "#F6F7FB",
    fontWeight: 900,
    fontSize: 12,
    color: "#5A6072",
    maxWidth: 360,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  chipNeutral: { background: "#F6F7FB", border: "1px solid #E7E9F2" },
  chipOk: { background: "#EEFBF1", border: "1px solid #CFEEDD" },
  chipWarn: { background: "#FFF4E5", border: "1px solid #FFE1B8" },
  chipInfo: { background: "#EEF6FF", border: "1px solid #D7E7FF" },

  editBtn: {
    borderRadius: 999,
    border: "1px solid #E7E9F2",
    background: "#F6F7FB",
    padding: "8px 12px",
    cursor: "pointer",
    fontWeight: 950,
    color: "#0F172A",
    whiteSpace: "nowrap",
  },

  heroBottom: { marginTop: 12, display: "grid", gap: 8 },
  heroLine: { fontWeight: 900, color: "#0F172A" },
  heroLineLabel: { color: "#9AA1B3", fontWeight: 950 },

  block: { marginTop: 10, paddingTop: 10, borderTop: "1px solid #EEF0F6" },
  blockLabel: { color: "#9AA1B3", fontWeight: 950, fontSize: 12, marginBottom: 8 },

  estadoRow: { display: "flex", gap: 10, flexWrap: "wrap" },
  estadoBtn: {
    flex: "1 1 180px",
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#F6F7FB",
    cursor: "pointer",
    textAlign: "center",
  },
  estadoBtnActive: { background: "#12131A", border: "1px solid #12131A" },
  estadoBtnTxt: { fontWeight: 950, fontSize: 12, color: "#5A6072" },
  estadoBtnTxtActive: { color: "#fff" },

  fallaRow: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  fallaPill: {
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    minWidth: 120,
    textAlign: "center",
  },
  fallaPillOn: { background: "#FFF4E5", border: "1px solid #FFE1B8" },
  fallaPillOff: { background: "#EEFBF1", border: "1px solid #CFEEDD" },
  fallaPillTxt: { fontWeight: 950, fontSize: 12 },
  fallaPillTxtOn: { color: "#B86B00" },
  fallaPillTxtOff: { color: "#1F7A3E" },

  fallaBtn: {
    flex: "1 1 220px",
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#F6F7FB",
    cursor: "pointer",
    fontWeight: 950,
    color: "#12131A",
  },

  sectionsWrap: { display: "grid", gap: 10 },

  sectionBtn: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    border: "1px solid #E7E9F2",
    background: "#fff",
    cursor: "pointer",
    textAlign: "left",
    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
  },
  sectionIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 16,
    background: "#F2F4FB",
    border: "1px solid #E7E9F2",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  sectionIconTxt: { fontSize: 18 },
  sectionBtnTitle: { fontWeight: 950, fontSize: 14, color: "#12131A" },
  sectionBtnSub: { marginTop: 3, fontWeight: 850, fontSize: 12, color: "#5A6072" },
  sectionChevron: { fontSize: 28, fontWeight: 950, color: "#9AA1B3", marginTop: -2 },

  // Modal sheet
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.35)",
    display: "grid",
    alignItems: "end",
    zIndex: 999,
    padding: 0,
  },
  modalCard: {
    background: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    border: "1px solid #E7E9F2",
    padding: 16,
    maxHeight: "78vh",
    overflow: "auto",
  },
  modalHeader: { display: "flex", alignItems: "center", gap: 12, marginBottom: 10 },
  modalTitle: { fontWeight: 950, fontSize: 16, color: "#12131A" },
  modalSub: {
    marginTop: 4,
    fontWeight: 850,
    color: "#5A6072",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    border: "1px solid #E7E9F2",
    background: "#FBFBFE",
    cursor: "pointer",
    fontWeight: 950,
    color: "#394055",
  },
  modalDivider: { height: 1, background: "#EEF0F6", marginBottom: 6 },
  modalBody: { paddingBottom: 8 },

  row: {
    display: "grid",
    gridTemplateColumns: "160px 1fr",
    gap: 12,
    padding: "10px 0",
    borderBottom: "1px solid #F1F2F7",
    alignItems: "start",
  },
  rowLabel: { color: "#9AA1B3", fontWeight: 950 },
  rowValue: { color: "#12131A", fontWeight: 950, textAlign: "right" },

  histItem: { padding: "12px 0", borderBottom: "1px solid #F1F2F7" },
  histTitle: { fontWeight: 950, color: "#12131A" },
  histSub: { marginTop: 4, fontWeight: 850, color: "#5A6072" },
  histBody: { marginTop: 8, fontWeight: 850, color: "#12131A", lineHeight: "18px" },

  modalPrimaryBtn: {
    marginTop: 14,
    borderRadius: 14,
    padding: "12px 12px",
    width: "100%",
    background: "#12131A",
    color: "#fff",
    fontWeight: 950,
    border: "none",
    cursor: "pointer",
  },

  inputLabel: { color: "#9AA1B3", fontWeight: 950, fontSize: 12, marginBottom: 6 },
  input: {
    width: "100%",
    border: "1px solid #E7E9F2",
    borderRadius: 12,
    padding: "10px 12px",
    background: "#FBFBFE",
    color: "#12131A",
    fontWeight: 850,
    outline: "none",
  },
};

/**
 * Pegá esto en tu CSS global (una vez) para el spinner:
 * @keyframes spin { to { transform: rotate(360deg); } }
 */