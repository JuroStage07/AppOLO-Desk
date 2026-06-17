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
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../../firebase";
import { AuthCtx } from "../../../auth/AuthProvider";
import {
  isEquipoInScope,
  isInUserScope,
  normalizeScopeValue,
} from "../../../utils/dataScope";
import { Brand, Topbar, useToast, useConfirm } from "../../../components/ui";
import {
  AlertTriangle,
  ArrowLeft,
  ClipboardCheck,
  FileText,
  Fingerprint,
  History,
  Pencil,
  QrCode,
} from "lucide-react";

import ApiladorPng from "../../../assets/equipos/apilador_icon.png";
import CarretillaPng from "../../../assets/equipos/carretilla_icon.png";
import MontacargasPng from "../../../assets/equipos/montacargas_icon.png";

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

function SectionIconBtn({ title, subtitle, children, onClick }) {
  return (
    <button
      type="button"
      className="equipo-section-btn"
      style={ui.sectionBtn}
      onClick={onClick}
    >
      <div style={ui.sectionIconCircle}>{children}</div>

      <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
        <div style={ui.sectionBtnTitle}>{title}</div>
        {subtitle ? <div style={ui.sectionBtnSub}>{subtitle}</div> : null}
      </div>

      <div style={ui.sectionChevron} aria-hidden>
        ›
      </div>
    </button>
  );
}

export default function EquipoInfoPage() {
  const nav = useNavigate();
  const { id } = useParams(); // ruta: /mantenimiento/equipos/:id
  const authCtx = useContext(AuthCtx);
  const profile = authCtx?.profile || {};
  const authLoading = authCtx?.loading;
  const toast = useToast();
  const confirm = useConfirm();

  const [equipo, setEquipo] = useState(null);
  const [loading, setLoading] = useState(true);

  // modales
  const [modalOpen, setModalOpen] = useState(false);
  const [modalKey, setModalKey] = useState(null); // general | control | id | historial

  // historial de fallas
  const [historial, setHistorial] = useState([]);
  const [historialLoading, setHistorialLoading] = useState(false);
  const [historialError, setHistorialError] = useState("");

  // editar
  const [editOpen, setEditOpen] = useState(false);
  const [editNombre, setEditNombre] = useState("");
  const [editResponsable, setEditResponsable] = useState("");
  const [editSuplente, setEditSuplente] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // QR / envío
  const [qrOpen, setQrOpen] = useState(false);
  const [qrEmail, setQrEmail] = useState("");
  const [qrSending, setQrSending] = useState(false);
  const [qrError, setQrError] = useState("");
  const [qrSent, setQrSent] = useState(false);

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
        if (!isEquipoInScope(row, profile?.tenantId, profile?.company)) {
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
              isEquipoInScope(row, profile?.tenantId, profile?.company) ? row : null
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

  useEffect(() => {
    const style = document.createElement("style");
    style.setAttribute("data-equipo-info-spin", "1");
    style.textContent = `
      @keyframes equipoInfoSpin { to { transform: rotate(360deg); } }
      .equipo-section-btn:hover { transform: translateY(-1px); box-shadow: 0 14px 32px rgba(15,23,42,0.1); border-color: rgba(8,159,138,0.22); }
      .equipo-section-btn:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; }
    `;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

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
    setHistorialError("");
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
      toast.success("Estado actualizado.");
    } catch (e) {
      console.error("setEstadoEquipo error:", e);
      toast.error("No se pudo actualizar el estado. Intentá de nuevo.");
    }
  };

  const toggleFalla = async () => {
    if (!id) return;
    const activa = equipo?.fallaActiva === true;
    const next = !activa;

    const ok = await confirm({
      title: "Cambiar estado de falla",
      message: `¿Deseás cambiar la falla a ${next ? "Activa" : "Inactiva"}?`,
      confirmText: "Cambiar",
      tone: "warning",
    });
    if (!ok) return;

    try {
      await updateDoc(doc(db, "equipos", id), {
        fallaActiva: next,
        fallaUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error("toggleFalla error:", e);
      toast.error("No se pudo cambiar el estado de la falla.");
    }
  };

  const checklistRowInScope = (row) => {
    const tRow = normalizeScopeValue(row?.tenantId);
    const cRow = normalizeScopeValue(row?.company);
    if (!tRow && !cRow) return true;
    return isInUserScope(row, profile?.tenantId, profile?.company);
  };

  const rowTieneFallasRegistradas = (row) => {
    if (row?.hasFallas === true) return true;
    const f = row?.fallas;
    if (Array.isArray(f) && f.length > 0) return true;
    if (Array.isArray(row?.itemsFalla) && row.itemsFalla.length > 0) return true;
    if (Array.isArray(row?.fallasSeleccionadas) && row.fallasSeleccionadas.length > 0) {
      return true;
    }
    return false;
  };

  const sortByCreatedAtDesc = (rows) =>
    [...rows].sort((a, b) => {
      const ta = a?.createdAt?.toDate?.()?.getTime?.() ?? 0;
      const tb = b?.createdAt?.toDate?.()?.getTime?.() ?? 0;
      return tb - ta;
    });

  const loadHistorialFallas = async () => {
    if (!id) return;

    setHistorialLoading(true);
    setHistorialError("");
    try {
      let snap;
      try {
        const qRef = query(
          collection(db, "checklists_diarias"),
          where("equipoId", "==", id),
          orderBy("createdAt", "desc"),
          limit(80)
        );
        snap = await getDocs(qRef);
      } catch (e1) {
        console.warn("Historial (orderBy):", e1);
        const qSimple = query(
          collection(db, "checklists_diarias"),
          where("equipoId", "==", id),
          limit(80)
        );
        snap = await getDocs(qSimple);
      }

      let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      if (rows.length === 0) {
        try {
          const qAlt = query(
            collection(db, "checklists_diarias"),
            where("equipo", "==", id),
            limit(80)
          );
          const snapAlt = await getDocs(qAlt);
          rows = snapAlt.docs.map((d) => ({ id: d.id, ...d.data() }));
        } catch (e2) {
          console.warn("Historial (campo equipo):", e2);
        }
      }

      rows = rows.filter(checklistRowInScope).filter(rowTieneFallasRegistradas);
      rows = sortByCreatedAtDesc(rows).slice(0, 50);
      setHistorial(rows);
    } catch (e) {
      console.error("loadHistorialFallas error:", e);
      setHistorial([]);
      const msg = e?.message || "";
      setHistorialError(
        msg.includes("index")
          ? "Falta un índice en Firestore para esta consulta. Abrí la consola del navegador y usá el enlace que sugiere Firebase."
          : "No se pudo cargar el historial. Revisá conexión y permisos."
      );
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

  const openQr = () => {
    setQrError("");
    setQrSent(false);
    setQrEmail("");
    setQrOpen(true);
  };

  const closeQr = () => {
    if (qrSending) return;
    setQrOpen(false);
  };

  const isValidEmail = (s) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());

  const buildQrEmailHtml = ({ equipoNombre, codigo, qrDataUrl }) => {
    const title = safe(equipoNombre) || "Equipo";
    const code = safe(codigo) || "—";

    const block = `
      <div style="border:1px solid #E7E9F2;border-radius:16px;padding:18px;margin:0 0 18px 0;font-family:Arial,Helvetica,sans-serif;">
        <div style="font-size:18px;font-weight:800;color:#0F172A;margin:0 0 10px 0;">${title}</div>
        <div style="font-size:22px;font-weight:900;letter-spacing:1px;color:#0F172A;margin:0 0 14px 0;">${code}</div>
        <div style="display:flex;justify-content:center;align-items:center;">
          <img alt="QR ${code}" src="${qrDataUrl}" style="width:260px;height:260px;image-rendering:pixelated;border:1px solid #EEF1F7;border-radius:14px;padding:10px;background:#fff;" />
        </div>
      </div>
    `;

    return `
      <div style="background:#FFFFFF;padding:10px;">
        ${block}
        ${block}
      </div>
    `;
  };

  const sendQrEmail = async () => {
    const to = safe(qrEmail);
    if (!isValidEmail(to)) {
      setQrError("Ingresá un correo válido.");
      return;
    }
    const codigo = safe(equipo?.codigo);
    if (!codigo) {
      setQrError("Este equipo no tiene código.");
      return;
    }

    setQrSending(true);
    setQrError("");
    setQrSent(false);
    try {
      const call = httpsCallable(functions, "sendEquipoQrLabel");
      await call({ equipoId: safe(equipo?.id || id), emailTo: to });

      setQrSent(true);
    } catch (e) {
      console.error("sendQrEmail error:", e);
      const msg = e?.message || "";
      setQrError(
        msg.includes("permission")
          ? "No tenés permisos para enviar QR."
          : "No se pudo enviar el QR. Revisá configuración de Functions/correo."
      );
    } finally {
      setQrSending(false);
    }
  };

  const saveEdit = async () => {
    if (!id) return;

    const nombre = safe(editNombre);
    const resp = safe(editResponsable);
    const supl = safe(editSuplente);

    if (!nombre) {
      toast.warning("El campo Nombre no puede quedar vacío.");
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
      toast.success("Equipo actualizado.");
    } catch (e) {
      console.error("saveEdit error:", e);
      toast.error("No se pudo guardar. Revisá permisos.");
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div style={ui.shell}>
      <Topbar>
        <Brand
          icon={FileText}
          title="Mantenimiento"
          subtitle="Equipo · Información"
          onClick={() => nav("/mantenimiento/equipos")}
        />
        <Topbar.Right>
          <button type="button" onClick={() => nav("/mantenimiento/equipos")} style={ui.btnGhost}>
            <ArrowLeft size={17} strokeWidth={2} aria-hidden />
            Equipos
          </button>
        </Topbar.Right>
      </Topbar>

      <div style={ui.main}>
        <div style={ui.container}>
          {/* States */}
          {loading ? (
            <div style={ui.stateCard}>
              <div style={ui.spinner} />
              <div style={ui.stateCardTitle}>Cargando equipo…</div>
              <div style={ui.stateCardHint}>Sincronizando datos con el servidor</div>
            </div>
          ) : !equipo ? (
            <div style={ui.stateCard}>
              <div style={ui.stateEmptyIcon} aria-hidden>
                <AlertTriangle size={28} strokeWidth={2} color="#94A3B8" />
              </div>
              <div style={ui.stateCardTitle}>No se encontró este equipo</div>
              <p style={ui.stateCardHint}>
                Puede no existir, no tener permisos o estar fuera de tu ámbito (empresa /
                tenant).
              </p>
              <button
                type="button"
                style={{ ...ui.btnGhost, marginTop: 6 }}
                onClick={() => nav(-1)}
              >
                <ArrowLeft size={17} strokeWidth={2} aria-hidden />
                Volver al listado
              </button>
            </div>
          ) : (
            <>
              {/* HERO */}
              <div style={ui.hero}>
                <div style={ui.heroAccent} aria-hidden />
                <div style={ui.heroTop}>
                  <div style={ui.iconCircle}>
                    <img
                      src={getEquipoIcon(familia)}
                      alt=""
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

                  <div style={ui.heroActions}>
                    <button
                      type="button"
                      onClick={openQr}
                      style={ui.qrBtn}
                      title="Generar y enviar QR"
                      aria-label="Generar y enviar QR"
                    >
                      <QrCode size={18} strokeWidth={2.2} color="#0F172A" aria-hidden />
                    </button>
                    <button type="button" onClick={openEdit} style={ui.editBtn}>
                      <Pencil size={16} strokeWidth={2.2} aria-hidden />
                      Editar
                    </button>
                  </div>
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
                  title="Datos generales"
                  subtitle="Marca, familia, estado, responsables"
                  onClick={() => openModal("general")}
                >
                  <FileText size={20} strokeWidth={2} color="#0F172A" />
                </SectionIconBtn>
                <SectionIconBtn
                  title="Control"
                  subtitle="Checklist, fechas, estado operativo"
                  onClick={() => openModal("control")}
                >
                  <ClipboardCheck size={20} strokeWidth={2} color="#0F172A" />
                </SectionIconBtn>
                <SectionIconBtn
                  title="Identificación"
                  subtitle="ID, código/placa, serie, modelo"
                  onClick={() => openModal("id")}
                >
                  <Fingerprint size={20} strokeWidth={2} color="#0F172A" />
                </SectionIconBtn>
                <SectionIconBtn
                  title="Historial de fallas"
                  subtitle="Fallas registradas en checklist diaria"
                  onClick={() => openModal("historial")}
                >
                  <History size={20} strokeWidth={2} color="#0F172A" />
                </SectionIconBtn>
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

              <button
                type="button"
                onClick={closeModal}
                style={ui.modalCloseBtn}
                aria-label="Cerrar"
              >
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
              ) : historialError ? (
                <div
                  style={{
                    padding: 14,
                    textAlign: "center",
                    color: "#B91C1C",
                    fontWeight: 800,
                    lineHeight: 1.45,
                  }}
                >
                  {historialError}
                </div>
              ) : historial.length === 0 ? (
                <div style={{ padding: 14, textAlign: "center", color: "#64748B", fontWeight: 900 }}>
                  No hay fallas registradas para este equipo.
                </div>
              ) : (
                historial.map((h) => {
                  const fecha = toLocale(h.createdAt);
                  const fallas = Array.isArray(h.fallas)
                    ? h.fallas
                    : Array.isArray(h.itemsFalla)
                      ? h.itemsFalla
                      : Array.isArray(h.fallasSeleccionadas)
                        ? h.fallasSeleccionadas
                        : [];
                  const labelFalla = (f) => {
                    if (f == null) return "Falla";
                    if (typeof f === "string") return f;
                    return f.label ?? f.titulo ?? f.nombre ?? f.descripcion ?? "Falla";
                  };
                  return (
                    <div key={h.id} style={ui.histItem}>
                      <div style={ui.histTitle}>{fecha}</div>
                      {h.creadoPorNombre ? (
                        <div style={ui.histSub}>Por: {h.creadoPorNombre}</div>
                      ) : null}
                      <div style={ui.histBody}>
                        {fallas.length > 0
                          ? fallas.map((f, idx) => (
                            <div key={`${h.id}-${idx}`}>• {labelFalla(f)}</div>
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

              <button
                type="button"
                onClick={closeEdit}
                style={ui.modalCloseBtn}
                aria-label="Cerrar"
              >
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

      {/* MODAL QR */}
      {qrOpen && (
        <div style={ui.modalBackdrop} onMouseDown={closeQr}>
          <div
            style={ui.modalCard}
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div style={ui.modalHeader}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={ui.modalTitle}>Enviar QR por correo</div>
                <div style={ui.modalSub}>
                  Se enviarán <b>2 copias</b> con: nombre del equipo, código y QR del código.
                </div>
              </div>

              <button
                type="button"
                onClick={closeQr}
                style={ui.modalCloseBtn}
                aria-label="Cerrar"
                disabled={qrSending}
              >
                ✕
              </button>
            </div>

            <div style={ui.modalDivider} />

            <div style={ui.modalBody}>
              {qrError ? <div style={ui.qrMsgErr}>{qrError}</div> : null}
              {qrSent ? <div style={ui.qrMsgOk}>Correo encolado para envío.</div> : null}

              <div>
                <div style={ui.inputLabel}>Correo destino</div>
                <input
                  value={qrEmail}
                  onChange={(e) => setQrEmail(e.target.value)}
                  placeholder="nombre@empresa.com"
                  style={ui.input}
                  autoFocus
                />
              </div>
            </div>

            <div style={ui.modalActions}>
              <button type="button" onClick={closeQr} style={ui.btnGhost} disabled={qrSending}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void sendQrEmail()}
                style={{ ...ui.modalPrimaryBtn, opacity: qrSending ? 0.65 : 1 }}
                disabled={qrSending}
              >
                {qrSending ? "Enviando…" : "Enviar"}
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
    width: "100%",
    maxWidth: "100vw",
    minHeight: "100vh",
    background: "#F6F7FB",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    color: "#0F172A",
    display: "grid",
    gridTemplateRows: "auto 1fr",
    overflowX: "hidden",
    boxSizing: "border-box",
  },

  topbar: {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px 18px",
    minHeight: 64,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: "1px solid #E7E9F2",
    background:
      "linear-gradient(180deg, #fff 0%, rgba(246,247,251,0.97) 100%)",
    backdropFilter: "blur(8px)",
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
    borderRadius: 14,
    padding: "4px 8px 4px 4px",
    margin: "-4px -8px -4px -4px",
    outline: "none",
  },
  topbarActions: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
  },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 14,
    background: ACCENT,
    color: "#fff",
    display: "grid",
    placeItems: "center",
    fontWeight: 950,
    letterSpacing: 0.4,
    boxShadow: "0 12px 28px rgba(8,159,138,0.28)",
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
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    transition: "box-shadow 140ms ease, border-color 140ms ease, transform 140ms ease",
  },

  main: { width: "100%", padding: 16, display: "block" },
  container: { width: "100%", maxWidth: "1100px", margin: "0 auto", display: "grid", gap: 14 },

  stateCard: {
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 20,
    padding: "24px 20px",
    boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
    display: "grid",
    placeItems: "center",
    gap: 10,
    textAlign: "center",
    maxWidth: 420,
    margin: "0 auto",
  },
  stateEmptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    background: "#F1F5F9",
    border: "1px solid #E7E9F2",
    display: "grid",
    placeItems: "center",
    marginBottom: 4,
  },
  stateCardTitle: {
    fontWeight: 950,
    fontSize: 17,
    color: "#0F172A",
    lineHeight: 1.25,
  },
  stateCardHint: {
    fontWeight: 800,
    fontSize: 13,
    color: "#64748B",
    lineHeight: 1.45,
    margin: 0,
    maxWidth: 360,
  },
  spinner: {
    width: 30,
    height: 30,
    borderRadius: 999,
    border: "3px solid #E7E9F2",
    borderTop: `3px solid ${ACCENT}`,
    animation: "equipoInfoSpin 0.85s linear infinite",
  },

  hero: {
    position: "relative",
    overflow: "hidden",
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 20,
    padding: 16,
    paddingTop: 18,
    boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
  },
  heroAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    height: 4,
    width: "100%",
    background: `linear-gradient(90deg, ${ACCENT} 0%, rgba(8,159,138,0.25) 60%, rgba(8,159,138,0) 100%)`,
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
    fontSize: 20,
    lineHeight: 1.25,
    marginBottom: 8,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
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

  heroActions: { display: "flex", gap: 10, alignItems: "center", flexShrink: 0 },
  qrBtn: {
    borderRadius: 999,
    border: "1px solid rgba(15,23,42,0.12)",
    background: "rgba(255,255,255,0.92)",
    width: 44,
    height: 44,
    padding: 0,
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    color: "#0F172A",
    boxShadow: "0 12px 26px rgba(15,23,42,0.10)",
    overflow: "visible",
  },

  editBtn: {
    borderRadius: 999,
    border: `1px solid rgba(8,159,138,0.35)`,
    background: "rgba(8, 159, 138, 0.08)",
    padding: "9px 14px",
    cursor: "pointer",
    fontWeight: 950,
    color: ACCENT,
    whiteSpace: "nowrap",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    transition: "background 140ms ease, box-shadow 140ms ease",
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
    transition: "transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease",
    outline: "none",
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

  // Modal (centrado; cómodo en escritorio y móvil)
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.45)",
    display: "grid",
    placeItems: "center",
    zIndex: 999,
    padding: 16,
    boxSizing: "border-box",
  },
  modalCard: {
    background: "#fff",
    borderRadius: 20,
    border: "1px solid #E7E9F2",
    padding: 18,
    maxHeight: "min(85vh, 720px)",
    width: "100%",
    maxWidth: 520,
    overflow: "auto",
    boxShadow: "0 24px 60px rgba(15,23,42,0.18)",
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
    background: ACCENT,
    color: "#fff",
    fontWeight: 950,
    border: `1px solid ${ACCENT}`,
    cursor: "pointer",
    boxShadow: "0 14px 28px rgba(8,159,138,0.22)",
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

  qrMsgErr: {
    borderRadius: 14,
    border: "1px solid rgba(239,68,68,0.30)",
    background: "rgba(239,68,68,0.08)",
    padding: 12,
    fontWeight: 900,
    color: "#991B1B",
  },
  qrMsgOk: {
    borderRadius: 14,
    border: "1px solid rgba(8,159,138,0.30)",
    background: "rgba(8,159,138,0.10)",
    padding: 12,
    fontWeight: 900,
    color: "#0F172A",
  },
};
