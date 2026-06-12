import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  doc as docRef,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, storage } from "../../../../firebase";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import LogoPng from "../../../../assets/Logo.png";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getAuth } from "firebase/auth";
import { ArrowLeft, FileText } from "lucide-react";
import { AuthCtx } from "../../../../auth/AuthProvider";
import { filterByUserScope } from "../../../../utils/dataScope";
import {
  Brand,
  GhostButton,
  Topbar,
  useToast,
  useConfirm,
} from "../../../../components/ui";

// Convierte un import de imagen (url) a DataURL para jsPDF
async function loadImageAsDataURL(src) {
  const res = await fetch(src);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function pushRow(rows, label, value) {
  const v = String(value ?? "").trim();
  if (!v) return;
  rows.push([label, v]);
}

function normalizeFamiliares(vis) {
  const raw = String(vis.familiares ?? "").trim();
  if (!raw) return "No";
  const r = raw.toLowerCase();
  if (r === "true") return "Sí";
  if (r === "false") return "No";
  return raw;
}

// 🔎 Resolver firmas desde el doc (por si cambian nombres de campos)
async function resolveFirmasFromVisOrStorage(vis) {
  // 1) Primero intenta leer del documento (por compatibilidad)
  let colabUrl =
    vis?.firmaColaboradorUrl ||
    vis?.firmaColaboradorURL ||
    vis?.firma_colaborador_url ||
    vis?.colabUrl ||
    null;

  let reprUrl =
    vis?.firmaRepresentanteUrl ||
    vis?.firmaRepresentanteURL ||
    vis?.firma_representante_url ||
    vis?.reprUrl ||
    null;

  // 2) Si falta alguna, intentamos buscar en Storage
  //    Usamos vis.visadoUID si existe, si no usamos vis.id
  const uid = vis?.visadoUID || vis?.uid || vis?.id;
  if (!uid) return { colabUrl, reprUrl };

  const basePath = `visados/${uid}/firmas`;

  async function tryGet(path) {
    try {
      return await getDownloadURL(ref(storage, path));
    } catch {
      return null;
    }
  }

  if (!colabUrl) colabUrl = await tryGet(`${basePath}/colaborador.png`);
  if (!reprUrl) reprUrl = await tryGet(`${basePath}/representante.png`);

  return { colabUrl, reprUrl };
}

async function buildVisadoPDF(vis, firmas, opts = {}) {
  // opts.uploadAndSave: default true
  const uploadAndSave = opts.uploadAndSave !== false;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const M = 26;
  const ACC = [8, 159, 138];
  const TEXT = [15, 23, 42];
  const MUTED = [100, 116, 139];
  const SOFT = [243, 251, 249];

  const trim = (v) => String(v ?? "").trim();

  const pushRowLocal = (rows, label, value) => {
    const v = trim(value);
    if (!v) return;
    rows.push([label, v]);
  };

  const normalizeFamiliaresLocal = () => {
    const raw = trim(vis.familiares);
    if (!raw) return "No";
    const r = raw.toLowerCase();
    if (r === "true") return "Sí";
    if (r === "false") return "No";
    return raw;
  };

  const addHeader = async () => {
    const headerH = 70;
    doc.setFillColor(...SOFT);
    doc.rect(0, 0, pageW, headerH, "F");

    const logoW = 92;
    const logoH = 34;
    const logoX = pageW - M - logoW;
    const logoY = 12;

    try {
      const logoDataUrl = await loadImageAsDataURL(LogoPng);
      doc.addImage(logoDataUrl, "PNG", logoX, logoY, logoW, logoH);
    } catch (e) {
      console.warn("No se pudo cargar Logo.png:", e);
    }

    doc.setTextColor(...TEXT);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("VISADO", M, 32);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text("Información general de personal externo", M, 50);

    const createdAt = tsToDate(vis.createdAt);
    const fecha = vis.fechaISO || fmtDate(createdAt);
    const generado = fmtDateTime(new Date());

    const cardW = 220;
    const cardH = 34;
    const cardX = pageW - M - cardW;
    const cardY = logoY + logoH + 6;

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(231, 233, 242);
    doc.roundedRect(cardX, cardY, cardW, cardH, 10, 10, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...TEXT);
    doc.text("Fecha:", cardX + 12, cardY + 14);
    doc.text("Generado:", cardX + 12, cardY + 26);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text(fecha, cardX + 68, cardY + 14);
    doc.text(generado, cardX + 68, cardY + 26);
  };

  const addSectionTitle = (title, y) => {
    doc.setTextColor(...TEXT);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(title, M, y);

    doc.setDrawColor(...ACC);
    doc.setLineWidth(2);
    doc.line(M, y + 6, M + 90, y + 6);

    return y + 14;
  };

  const addFooter = () => {
    const pageCount = doc.internal.getNumberOfPages();
    const pageNumber = doc.internal.getCurrentPageInfo().pageNumber;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);

    doc.text("Salud Ocupacional · OLO", M, pageH - 22);
    doc.text(`Página ${pageNumber} de ${pageCount}`, pageW - M, pageH - 22, { align: "right" });
  };

  // ---------- build content ----------
  await addHeader();

  let cursorY = 86;

  // ===== Datos generales
  cursorY = addSectionTitle("Datos generales", cursorY);

  const generalRows = [];
  pushRowLocal(generalRows, "Nombres y apellidos", vis.nombre);
  pushRowLocal(generalRows, "No. identificación personal (cédula)", vis.cedula);
  pushRowLocal(generalRows, "Número patronal", vis.numeroPatronal);
  pushRowLocal(generalRows, "Empresa proveedora", vis.empresa);
  pushRowLocal(generalRows, "Teléfono empresa", vis.telefonoEmpresa);
  pushRowLocal(generalRows, "Supervisor inmediato", vis.supervisor);
  pushRowLocal(generalRows, "Teléfono supervisor", vis.telefonoSupervisor);

  autoTable(doc, {
    startY: cursorY,
    head: [["Campo", "Valor"]],
    body: generalRows,
    margin: { left: M, right: M },
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 3, textColor: TEXT },
    headStyles: { fillColor: ACC, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: [250, 252, 255] },
    columnStyles: { 0: { cellWidth: 210, fontStyle: "bold" }, 1: { cellWidth: pageW - (M * 2) - 210 } },
    didDrawPage: addFooter,
  });

  cursorY = doc.lastAutoTable.finalY + 10;

  // ===== Trámite y motivo
  cursorY = addSectionTitle("Trámite y motivo", cursorY);

  const tramiteRows = [];
  pushRowLocal(tramiteRows, "Labores en instalaciones OLO (motivo)", vis.motivo);
  pushRowLocal(tramiteRows, "Tipo de trámite", vis.tipoTramite);
  pushRowLocal(tramiteRows, "Detalle (si menor a 3 meses)", vis.tipoTramiteDetalle);

  if (tramiteRows.length) {
    autoTable(doc, {
      startY: cursorY,
      head: [["Campo", "Valor"]],
      body: tramiteRows,
      margin: { left: M, right: M },
      theme: "grid",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 6, textColor: TEXT },
      headStyles: { fillColor: ACC, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 252, 255] },
      columnStyles: { 0: { cellWidth: 210, fontStyle: "bold" }, 1: { cellWidth: pageW - (M * 2) - 210 } },
      didDrawPage: addFooter,
    });
    cursorY = doc.lastAutoTable.finalY + 10;
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text("Sin información registrada.", M, cursorY + 10);
    cursorY += 28;
  }

  // ===== Familiares
  cursorY = addSectionTitle("Familiares", cursorY);

  const fam = normalizeFamiliaresLocal();
  const famRows = [];
  famRows.push(["¿Familiares en OLO/Proveedora?", fam]);

  if (fam.toLowerCase() !== "no") {
    pushRowLocal(famRows, "Familiar: Nombre", vis.familiarNombre);
    pushRowLocal(famRows, "Familiar: Parentesco", vis.familiarParentesco);
    pushRowLocal(famRows, "Familiar: Puesto", vis.familiarPuesto);
  }

  autoTable(doc, {
    startY: cursorY,
    head: [["Campo", "Valor"]],
    body: famRows,
    margin: { left: M, right: M },
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 5, textColor: TEXT },
    headStyles: { fillColor: ACC, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 252, 255] },
    columnStyles: { 0: { cellWidth: 210, fontStyle: "bold" }, 1: { cellWidth: pageW - (M * 2) - 210 } },
    didDrawPage: addFooter,
  });

  cursorY = doc.lastAutoTable.finalY + 18;

  // ===== Capacitaciones / EPP
  cursorY = addSectionTitle("Capacitaciones y EPP", cursorY);

  const capRows = [];
  pushRowLocal(capRows, "Capacitación: Trabajos en altura", vis.capAltura);
  pushRowLocal(capRows, "Capacitación: Espacios confinados", vis.capConfinados);
  pushRowLocal(capRows, "Capacitación: Trabajos eléctricos", vis.capElectricos);
  pushRowLocal(capRows, "Capacitación: Corte y soldadura", vis.capSoldadura);
  pushRowLocal(capRows, "Empresa aporta certificaciones/EPP", vis.empresaAportaCert);

  if (typeof vis.aceptaNormas === "boolean") {
    capRows.push(["Acepta normas", vis.aceptaNormas ? "Sí" : "No"]);
  } else {
    pushRowLocal(capRows, "Acepta normas", vis.aceptaNormas);
  }

  if (capRows.length) {
    autoTable(doc, {
      startY: cursorY,
      head: [["Campo", "Valor"]],
      body: capRows,
      margin: { left: M, right: M },
      theme: "grid",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 6, textColor: TEXT },
      headStyles: { fillColor: ACC, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 252, 255] },
      columnStyles: { 0: { cellWidth: 210, fontStyle: "bold" }, 1: { cellWidth: pageW - (M * 2) - 210 } },
      didDrawPage: addFooter,
    });
    cursorY = doc.lastAutoTable.finalY + 18;
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text("Sin información registrada.", M, cursorY + 10);
    cursorY += 28;
  }

  // ===== Declaración
  cursorY = addSectionTitle("Declaración", cursorY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);

  const decl =
    "He recibido, leído y acepto cumplir con las Normas de Seguridad para Personal Externo, " +
    "que rigen para OLO, durante el tiempo en que me encuentre laborando en sus instalaciones. " +
    "En caso de usar emergencias médicas de OLO y requerir elevar el caso por riesgos del trabajo, " +
    "se usará la póliza de la empresa que nos representa.";

  const boxW = pageW - (M * 2);
  const padX = 10;
  const padY = 8;
  const textMaxW = boxW - (padX * 2);
  const lines = doc.splitTextToSize(decl, textMaxW);
  const lineH = 12;
  const textH = lines.length * lineH;
  const boxH = Math.min(44, textH + (padY * 2));
  const needed = boxH + 14 + 70;

  if (cursorY + needed > pageH - 30) {
    // en vez de addPage, hacemos el cuadro más pequeño
    // (y si aún no cabe, igual se recorta un poco, pero se queda 1 hoja)
  }

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(231, 233, 242);
  doc.roundedRect(M, cursorY, boxW, boxH, 12, 12, "FD");
  doc.text(lines, M + padX, cursorY + padY + 9);
  cursorY += boxH + 8;

  // ===== Firmas (2 columnas) con imágenes
  doc.setTextColor(...TEXT);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  const contentW = pageW - (M * 2);
  const gap = 24;
  const colW = (contentW - gap) / 2;

  const leftX = M;
  const rightX = M + colW + gap;

  const baseY = cursorY + 35;
  doc.text("Firma colaborador:", leftX, baseY);
  doc.text("Firma representante:", rightX, baseY);

  const lineY = baseY + 18;
  doc.setDrawColor(120, 130, 150);
  doc.setLineWidth(1);
  doc.line(leftX, lineY, leftX + colW, lineY);
  doc.line(rightX, lineY, rightX + colW, lineY);

  const imgH = 55;
  const imgY = lineY - imgH - 2;

  async function tryAddSig(url, x) {
    if (!url) return;

    try {
      const dataUrl = await loadImageAsDataURL(url);

      // medir tamaño real para mantener proporción
      const img = new Image();
      const dims = await new Promise((resolve, reject) => {
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = reject;
        img.src = dataUrl;
      });

      const maxW = colW - 12;
      const maxH = 40; // podés subir a 45 si te cabe

      const ratio = dims.w / dims.h;

      let w = maxW;
      let h = w / ratio;

      if (h > maxH) {
        h = maxH;
        w = h * ratio;
      }

      const y = imgY + (maxH - h) / 2;     // centra vertical
      const xx = x + 6 + (maxW - w) / 2;   // centra horizontal

      const isJpg = typeof dataUrl === "string" && dataUrl.startsWith("data:image/jpeg");
      doc.addImage(dataUrl, isJpg ? "JPEG" : "PNG", xx, y, w, h);
    } catch (e) {
      console.warn("No se pudo cargar firma:", e);
    }
  }

  await tryAddSig(firmas?.colabUrl, leftX);
  await tryAddSig(firmas?.reprUrl, rightX);

  cursorY += 70;
  addFooter();

  const fileName = `Visado_${safe(vis.cedula) || "sin-cedula"}_${vis.fechaISO || "fecha"}.pdf`;

  // ✅ Si solo querés descarga local (debug), podés llamar con opts.uploadAndSave=false
  if (!uploadAndSave) {
    doc.save(fileName);
    return { local: true };
  }

  // ✅ Requisito: debe existir vis.id para poder actualizar y subir con ruta ordenada
  if (!vis?.id) {
    doc.save(fileName);
    return { local: true, warning: "vis.id no existe, se descargó local." };
  }

  // ✅ Subir a Storage
  const pdfBlob = doc.output("blob");
  const uid = vis?.visadoUID || vis?.uid || vis?.id;
  const filePath = `visados/${uid}/pdf/${fileName}`;
  const sRef = ref(storage, filePath);

  await uploadBytes(sRef, pdfBlob);
  const pdfUrl = await getDownloadURL(sRef);

  // ✅ Guardar SOLO en "visados"
  await updateDoc(docRef(db, "visados", vis.id), {
    pdfUrl,
    pdfPath: filePath,
    pdfGeneratedAt: serverTimestamp(),
    firmado: true,
    firmadoAt: serverTimestamp(),
  });

  // ✅ Descarga local al finalizar (además de subir a Storage)
  doc.save(fileName);

  return { pdfUrl, pdfPath: filePath };
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDay(dateISO) {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function endOfDay(dateISO) {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}

function onlyDigits(v) {
  return String(v ?? "").replace(/\D/g, "");
}

function isLikelyCedula(q) {
  const raw = String(q ?? "").trim();
  if (!raw) return false;

  const hasLetters = /[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(raw);
  const d = onlyDigits(raw);
  return !hasLetters && d.length > 0;
}

function tsToDate(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return null;
}

function fmtDate(d) {
  if (!d) return "";
  return d.toLocaleDateString("es-CR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function fmtDateTime(d) {
  if (!d) return "";
  return d.toLocaleString("es-CR");
}

function safe(v) {
  return String(v ?? "").trim();
}

export default function AdministrarVisados() {
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const authCtx = useContext(AuthCtx);
  const profile = authCtx?.profile || {};
  const authLoading = authCtx?.loading;

  const [qText, setQText] = useState("");
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState([]);

  useEffect(() => {
    const u = getAuth().currentUser;
    console.log("AUTH uid:", u?.uid, "email:", u?.email);
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.style.background = "#F6F7FB";
    document.body.style.margin = "0";
    return () => (document.body.style.overflow = prev);
  }, []);

  const back = () => nav("/seguridad/visado");

  const canSearch = useMemo(() => {
    if (busy) return false;
    if (!from || !to) return false;
    return true;
  }, [busy, from, to]);

  const onSearch = async (e) => {
    e?.preventDefault?.();
    if (!canSearch) return;
    if (authLoading) return;

    setErr("");
    setBusy(true);

    try {
      const fromDate = startOfDay(from);
      const toDate = endOfDay(to);

      const qBase = query(
        collection(db, "visados"),
        where("createdAt", ">=", fromDate),
        where("createdAt", "<=", toDate),
        orderBy("createdAt", "desc"),
        limit(200)
      );

      const snap = await getDocs(qBase);
      const docs = filterByUserScope(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })),
        profile?.tenantId,
        profile?.company
      );

      const tRaw = String(qText || "").trim().toLowerCase();
      if (!tRaw) {
        setRows(docs);
        return;
      }

      const tDigits = onlyDigits(tRaw);

      if (isLikelyCedula(tRaw)) {
        setRows(
          docs.filter((x) => {
            const docCed = onlyDigits(x.cedula);
            return docCed.includes(tDigits);
          })
        );
      } else {
        setRows(
          docs.filter((x) => {
            const name = String(x.nombreLower || x.nombre || "").toLowerCase();
            return name.includes(tRaw);
          })
        );
      }
    } catch (e2) {
      console.error(e2);
      setErr("No se pudo consultar visados. Revisa permisos/rules o índices.");
    } finally {
      setBusy(false);
    }
  };

  // ✅ Generar PDF firmado: solo si ya hay 2 firmas (y no existe pdfUrl)
  const generarPDF = async (vis) => {
    try {
      setBusy(true);
      setErr("");

      const firmas = await resolveFirmasFromVisOrStorage(vis);

      if (!firmas.colabUrl || !firmas.reprUrl) {
        toast.warning("Faltan firmas: colaborador y/o representante.");
        return null;
      }

      const result = await buildVisadoPDF(vis, firmas, { uploadAndSave: true });

      await onSearch(); // refresca para que ya aparezca pdfUrl
      toast.success("PDF firmado generado y guardado.");

      // Si buildVisadoPDF retornó pdfUrl, lo abrimos
      if (result?.pdfUrl) window.open(result.pdfUrl, "_blank");

      return result?.pdfUrl || null;
    } catch (e) {
      console.error(e);
      toast.error("No se pudo generar el PDF firmado.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={ui.shell}>
      {/* Topbar */}
      <Topbar>
        <Brand
          icon={FileText}
          title="Salud Ocupacional"
          subtitle="Administración · Visados"
          onClick={() => nav("/seguridad/visado")}
        />
        <Topbar.Right>
          <Topbar.UserHint>
            {rows.length} resultado{rows.length !== 1 ? "s" : ""}
          </Topbar.UserHint>
          <GhostButton icon={ArrowLeft} onClick={back} disabled={busy}>
            Volver
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      {/* Content */}
      <div style={ui.main}>
        <div style={ui.container}>
          {/* Header card */}
          <div style={ui.headerCard}>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={ui.kickerRow}>
                <span style={ui.kickerDot} />
                <div style={ui.kicker}>Centro de control</div>
                <span style={ui.badge}>{busy ? "Buscando…" : "Listo"}</span>
              </div>

              <h1 style={ui.title}>Administrar visados</h1>
              <p style={ui.subtitle}>
                Buscá por <b>cédula</b> o <b>nombre</b> y filtrá por fecha. El botón PDF solo se habilita al estar firmado (pdfUrl).
              </p>
            </div>
          </div>

          {/* Filters */}
          <form onSubmit={onSearch} style={ui.filtersCard}>
            <div style={ui.filtersGrid}>
              <div style={ui.field}>
                <div style={ui.labelRow}>
                  <div style={ui.label}>Buscar</div>
                  <div style={ui.hint}>Cédula o nombre</div>
                </div>

                <div style={ui.inputWrap}>
                  <span style={ui.inputIcon} aria-hidden="true">⌁</span>
                  <input
                    value={qText}
                    onChange={(e) => setQText(e.target.value)}
                    placeholder="Ej: 155821777303 o Adonis"
                    style={ui.input}
                    disabled={busy}
                  />
                  {!!qText && !busy && (
                    <button type="button" onClick={() => setQText("")} style={ui.clearBtn} title="Limpiar">
                      ✕
                    </button>
                  )}
                </div>
              </div>

              <div style={ui.field}>
                <div style={ui.labelRow}>
                  <div style={ui.label}>Desde</div>
                </div>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  style={ui.dateInput}
                  disabled={busy}
                />
              </div>

              <div style={ui.field}>
                <div style={ui.labelRow}>
                  <div style={ui.label}>Hasta</div>
                </div>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  style={ui.dateInput}
                  disabled={busy}
                />
              </div>

              <button
                type="submit"
                disabled={!canSearch}
                style={{ ...ui.btnPrimary, ...(canSearch ? {} : ui.btnDisabled) }}
              >
                {busy ? "Buscando…" : "Buscar"}
              </button>
            </div>

            <div style={ui.filtersHelp}>
              Tip: para nombre, usá una parte (ej: “ado”). Para cédula, podés pegar con guiones y lo detecta.
            </div>
          </form>

          {err && <div style={ui.errBox}>{err}</div>}

          {/* Results */}
          <div style={ui.tableCard}>
            <div style={ui.tableHead}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={ui.tableTitle}>Resultados</div>
                <span style={ui.countPill}>{rows.length}</span>
              </div>

              <div style={ui.tableHint}>Orden: más recientes primero · Límite: 200</div>
            </div>

            <div style={ui.list}>
              {rows.map((v) => {
                const d = tsToDate(v.createdAt);
                const tipo = safe(v.tipoTramite);
                const empresa = safe(v.empresa);
                const ced = safe(v.cedula);

                const pdfUrl = v.pdfUrl || null;
                const firmado = v.firmado === true;

                // Estado solo con lo que trae el doc (render-safe)
                const firmasDoc = {
                  colabUrl:
                    v?.firmaColaboradorUrl ||
                    v?.firmaColaboradorURL ||
                    v?.firma_colaborador_url ||
                    v?.colabUrl ||
                    null,
                  reprUrl:
                    v?.firmaRepresentanteUrl ||
                    v?.firmaRepresentanteURL ||
                    v?.firma_representante_url ||
                    v?.reprUrl ||
                    null,
                };

                const tieneAmbasFirmasDoc = !!(firmasDoc.colabUrl && firmasDoc.reprUrl);

                return (
                  <div key={v.id} style={ui.row}>
                    <div style={ui.rowLeft}>
                      <div style={ui.rowTitle}>
                        {safe(v.nombre) || "Sin nombre"}
                        <span style={ui.rowMeta}> · {ced || "sin cédula"}</span>
                      </div>

                      <div style={ui.chips}>
                        {empresa && <span style={ui.chip}>{empresa}</span>}
                        {tipo && <span style={ui.chipSoft}>{tipo}</span>}
                        <span style={ui.chipDate}>{fmtDate(d)}</span>

                        {pdfUrl ? (
                          <span style={ui.chipSoft}>PDF listo</span>
                        ) : tieneAmbasFirmasDoc || firmado ? (
                          <span style={ui.chipSoft}>Firmado</span>
                        ) : (
                          <span style={ui.chip}>Pendiente</span>
                        )}
                      </div>

                      {safe(v.motivo) && <div style={ui.rowMotivo}>{safe(v.motivo)}</div>}
                    </div>

                    <div style={ui.rowActions}>
                      {/* Ver PDF si existe */}
                      <button
                        type="button"
                        onClick={() => pdfUrl && window.open(pdfUrl, "_blank")}
                        disabled={busy || !pdfUrl}
                        style={{
                          ...ui.pdfBtn,
                          opacity: pdfUrl && !busy ? 1 : 0.5,
                          cursor: pdfUrl && !busy ? "pointer" : "not-allowed",
                        }}
                        title={pdfUrl ? "Abrir PDF" : "Aún no hay PDF"}
                      >
                        Ver PDF
                      </button>

                      {/* Generar SIEMPRE disponible */}
                      <button
                        type="button"
                        onClick={async () => {
                          if (busy) return;
                          const ok = await confirm({
                            title: "Generar PDF",
                            message:
                              "Esto reemplazará el enlace guardado (pdfUrl) por uno nuevo. ¿Continuar?",
                            confirmText: "Generar",
                            tone: "warning",
                          });
                          if (!ok) return;
                          await generarPDF(v);
                        }}
                        disabled={busy}
                        style={{
                          ...ui.btnGhost,
                          opacity: busy ? 0.6 : 1,
                          cursor: busy ? "not-allowed" : "pointer",
                        }}
                        title="Generar PDF (sube uno nuevo y actualiza pdfUrl)"
                      >
                        Generar PDF
                      </button>
                    </div>
                  </div>
                );
              })}

              {rows.length === 0 && !busy && <div style={ui.empty}>No hay visados para ese filtro.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== UI: lo dejé igual a tu UI (sin cambios) ===== */
const ACCENT = "#089F8A";
const ui = {
  shell: {
    height: "100vh",
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
    background: "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(246,247,251,0.95) 100%)",
    backdropFilter: "blur(6px)",
  },
  brand: { display: "flex", alignItems: "center", gap: 12, cursor: "pointer", userSelect: "none" },
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
    display: "grid",
    gap: 2,
    padding: "8px 12px",
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#fff",
    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
    minWidth: 140,
  },
  kpiLabel: { fontWeight: 850, fontSize: 12, color: "#64748B" },
  kpiValue: { fontWeight: 950, fontSize: 18, color: "#0F172A", lineHeight: 1.1 },
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
  main: { minHeight: 0, overflow: "auto", padding: 16, display: "grid", placeItems: "start center", WebkitOverflowScrolling: "touch" },
  container: { width: "min(1100px, 100%)", display: "grid", gap: 14 },
  headerCard: {
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 20,
    padding: 16,
    boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
  },
  kickerRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  kickerDot: { width: 10, height: 10, borderRadius: 999, background: ACCENT, boxShadow: "0 0 0 4px rgba(8,159,138,0.14)" },
  kicker: { fontSize: 12, fontWeight: 950, letterSpacing: 0.6, textTransform: "uppercase", color: ACCENT },
  badge: {
    fontSize: 12,
    fontWeight: 950,
    padding: "6px 10px",
    borderRadius: 999,
    background: "#FFFFFF",
    border: "1px solid #E7E9F2",
    color: "#334155",
  },
  title: { margin: 0, fontSize: 24, fontWeight: 980, letterSpacing: -0.3 },
  subtitle: { margin: 0, color: "#64748B", fontWeight: 800, lineHeight: 1.4 },
  filtersCard: {
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 20,
    padding: 14,
    boxShadow: "0 12px 26px rgba(15, 23, 42, 0.06)",
  },
  filtersGrid: { display: "grid", gridTemplateColumns: "2fr 1fr 1fr 170px", gap: 12, alignItems: "end" },
  filtersHelp: { marginTop: 10, color: "#64748B", fontWeight: 800, fontSize: 12 },
  field: { display: "grid", gap: 8 },
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
  input: { border: "none", outline: "none", background: "transparent", fontWeight: 950, fontSize: 14, color: "#0F172A", padding: "10px 0" },
  clearBtn: {
    border: "1px solid #E7E9F2",
    background: "#fff",
    borderRadius: 14,
    width: 38,
    height: 38,
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    fontWeight: 950,
    color: "#64748B",
  },
  dateInput: { width: "100%", borderRadius: 18, border: "1px solid #E7E9F2", background: "#FBFCFF", padding: "12px 12px", fontWeight: 950, color: "#0F172A", outline: "none" },
  btnPrimary: {
    borderRadius: 18,
    border: `1px solid ${ACCENT}`,
    background: ACCENT,
    color: "#fff",
    padding: "14px 14px",
    fontWeight: 980,
    cursor: "pointer",
    boxShadow: "0 18px 32px rgba(8,159,138,0.22)",
    height: 52,
  },
  btnDisabled: { opacity: 0.55, cursor: "not-allowed", boxShadow: "none" },
  errBox: { borderRadius: 18, border: "1px solid rgba(239,68,68,0.35)", background: "#FFF6F6", padding: 12, fontWeight: 900, color: "#0F172A" },
  tableCard: { background: "#fff", border: "1px solid #E7E9F2", borderRadius: 20, overflow: "hidden", boxShadow: "0 16px 40px rgba(15,23,42,0.08)" },
  tableHead: { padding: 14, borderBottom: "1px solid #EEF1F7", background: "linear-gradient(180deg, #FFFFFF 0%, #FBFCFF 100%)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 },
  tableTitle: { fontWeight: 980, color: "#0F172A" },
  tableHint: { color: "#94A3B8", fontWeight: 850, fontSize: 12 },
  countPill: { padding: "6px 10px", borderRadius: 999, border: "1px solid rgba(8,159,138,0.35)", background: "#F3FBF9", color: ACCENT, fontWeight: 980, fontSize: 12 },
  list: { display: "grid" },
  row: { padding: 14, borderBottom: "1px solid #EEF1F7", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  rowLeft: { display: "grid", gap: 8, minWidth: 0 },
  rowTitle: { fontWeight: 980, color: "#0F172A" },
  rowMeta: { fontWeight: 980, color: ACCENT },
  chips: { display: "flex", gap: 8, flexWrap: "wrap" },
  chip: { padding: "6px 10px", borderRadius: 999, border: "1px solid #E7E9F2", background: "#FFFFFF", color: "#334155", fontWeight: 950, fontSize: 12 },
  chipSoft: { padding: "6px 10px", borderRadius: 999, border: "1px solid rgba(8,159,138,0.30)", background: "#F3FBF9", color: ACCENT, fontWeight: 950, fontSize: 12 },
  chipDate: { padding: "6px 10px", borderRadius: 999, border: "1px solid rgba(148,163,184,0.45)", background: "#F8FAFC", color: "#64748B", fontWeight: 950, fontSize: 12 },
  rowMotivo: { fontWeight: 850, color: "#64748B", fontSize: 13, lineHeight: 1.35 },
  rowActions: { display: "flex", alignItems: "center", gap: 10, flexShrink: 0 },
  pdfBtn: { borderRadius: 16, border: `1px solid ${ACCENT}`, background: ACCENT, color: "#fff", padding: "10px 12px", cursor: "pointer", fontWeight: 980, boxShadow: "0 14px 26px rgba(8,159,138,0.18)", whiteSpace: "nowrap" },
  empty: { padding: 14, color: "#64748B", fontWeight: 850, fontSize: 13 },
  footerNote: { borderRadius: 20, border: "1px solid #E7E9F2", background: "#FFFFFF", padding: 14, boxShadow: "0 12px 26px rgba(15, 23, 42, 0.06)" },
  footerTitle: { fontWeight: 980, color: "#0F172A", marginBottom: 6 },
  footerText: { color: "#64748B", fontWeight: 800, fontSize: 13, lineHeight: 1.4 },
};