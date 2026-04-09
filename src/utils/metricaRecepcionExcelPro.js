/**
 * Exportación Excel “pro” para Métrica Recepción: estilos, tablas y gráficos como imagen (canvas).
 * Usa exceljs (dinámico) para no inflar el bundle inicial.
 */

const ACCENT = "#089F8A";
const ACCENT_DARK = "#067A6A";
const SLATE = "#64748B";
const PAGE_BG = "#F8FAFC";
const CHART_W = 920;
const CHART_H = 320;

const DOUGHNUT_COLORS = [
  "#089F8A",
  "#14B8A6",
  "#0D9488",
  "#0F766E",
  "#64748B",
  "#94A3B8",
  "#CBD5E1",
];

function formatDayKeyForLocale(dayKey) {
  const s = String(dayKey || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || "—";
  try {
    const d = new Date(`${s}T12:00:00`);
    return d.toLocaleDateString("es-CR", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return s;
  }
}

function fmtMinutesFromMs(ms) {
  const n = Number(ms || 0);
  if (!n) return "0 min";
  const totalMin = Math.round(n / 60000);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

function canvasToBase64Png(canvas) {
  return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
}

function setupHiDpiCanvas(width, height) {
  const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 2 : 2);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { canvas, ctx, w: width, h: height };
}

function drawBarChartPng(labels, values, title, subtitle) {
  const { canvas, ctx, w, h } = setupHiDpiCanvas(CHART_W, CHART_H);
  ctx.fillStyle = PAGE_BG;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#0F172A";
  ctx.font = "600 17px system-ui, 'Segoe UI', sans-serif";
  ctx.fillText(title || "Descargas completadas por período", 28, 30);
  if (subtitle) {
    ctx.fillStyle = SLATE;
    ctx.font = "12px system-ui, 'Segoe UI', sans-serif";
    ctx.fillText(subtitle.slice(0, 95), 28, 52);
  }

  const padL = 56;
  const padR = 40;
  const padT = subtitle ? 72 : 58;
  const padB = 72;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  const nums = (values || []).map((v) => Number(v) || 0);
  const maxV = Math.max(1, ...nums);
  const n = Math.max(1, labels?.length || 0);

  if (!labels?.length) {
    ctx.fillStyle = SLATE;
    ctx.font = "14px system-ui, 'Segoe UI', sans-serif";
    ctx.fillText("Sin datos para este período.", padL, padT + chartH / 2);
    return canvas;
  }

  const gap = 10;
  const barW = Math.max(8, (chartW - gap * (n - 1)) / n);

  ctx.strokeStyle = "#E2E8F0";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (chartH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + chartW, y);
    ctx.stroke();
  }

  ctx.fillStyle = SLATE;
  ctx.font = "11px system-ui, 'Segoe UI', sans-serif";
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const val = Math.round((maxV * (4 - i)) / 4);
    const y = padT + (chartH * i) / 4 + 4;
    ctx.fillText(String(val), padL - 10, y);
  }
  ctx.textAlign = "center";

  labels.forEach((lbl, i) => {
    const v = nums[i] || 0;
    const bh = (v / maxV) * chartH;
    const x = padL + i * (barW + gap);
    const y = padT + chartH - bh;

    const g = ctx.createLinearGradient(x, y, x, y + bh);
    g.addColorStop(0, ACCENT);
    g.addColorStop(1, ACCENT_DARK);
    ctx.fillStyle = g;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, barW, bh, [6, 6, 0, 0]);
    } else {
      ctx.rect(x, y, barW, bh);
    }
    ctx.fill();

    ctx.fillStyle = "#0F172A";
    ctx.font = "600 12px system-ui, 'Segoe UI', sans-serif";
    ctx.fillText(String(v), x + barW / 2, y - 8);

    ctx.fillStyle = SLATE;
    ctx.font = n > 12 ? "10px system-ui, 'Segoe UI', sans-serif" : "11px system-ui, 'Segoe UI', sans-serif";
    const short = String(lbl).slice(0, n > 12 ? 8 : 12);
    ctx.save();
    if (n > 14) {
      ctx.translate(x + barW / 2, padT + chartH + 20);
      ctx.rotate(-0.35);
      ctx.textAlign = "right";
      ctx.fillText(short, 0, 0);
    } else {
      ctx.textAlign = "center";
      ctx.fillText(short, x + barW / 2, padT + chartH + 22);
    }
    ctx.restore();
  });

  return canvas;
}

function drawLineChartPng(labels, values, title, subtitle) {
  const { canvas, ctx, w, h } = setupHiDpiCanvas(CHART_W, CHART_H);
  ctx.fillStyle = PAGE_BG;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#0F172A";
  ctx.font = "600 17px system-ui, 'Segoe UI', sans-serif";
  ctx.fillText(title || "Cumplimiento operativo (%)", 28, 30);
  if (subtitle) {
    ctx.fillStyle = SLATE;
    ctx.font = "12px system-ui, 'Segoe UI', sans-serif";
    ctx.fillText(subtitle.slice(0, 95), 28, 52);
  }

  const padL = 56;
  const padR = 40;
  const padT = subtitle ? 72 : 58;
  const padB = 72;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  const nums = (values || []).map((v) => Number(v) || 0);
  const n = Math.max(1, labels?.length || 0);

  if (!labels?.length) {
    ctx.fillStyle = SLATE;
    ctx.font = "14px system-ui, 'Segoe UI', sans-serif";
    ctx.fillText("Sin datos para este período.", padL, padT + chartH / 2);
    return canvas;
  }

  const maxY = 100;
  const minY = 0;

  ctx.strokeStyle = "#E2E8F0";
  for (let i = 0; i <= 4; i++) {
    const y = padT + (chartH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + chartW, y);
    ctx.stroke();
  }

  const y85 = padT + (1 - 85 / (maxY - minY)) * chartH;
  ctx.save();
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = "#94A3B8";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padL, y85);
  ctx.lineTo(padL + chartW, y85);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#64748B";
  ctx.font = "10px system-ui, 'Segoe UI', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Objetivo 85%", padL + chartW - 78, y85 - 6);
  ctx.restore();

  ctx.fillStyle = SLATE;
  ctx.font = "11px system-ui, 'Segoe UI', sans-serif";
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const val = Math.round(maxY - (maxY * i) / 4);
    const y = padT + (chartH * i) / 4 + 4;
    ctx.fillText(`${val}%`, padL - 10, y);
  }

  const stepX = n > 1 ? chartW / (n - 1) : 0;
  const points = nums.map((val, i) => ({
    x: padL + (n === 1 ? chartW / 2 : i * stepX),
    y: padT + chartH - ((val - minY) / (maxY - minY)) * chartH,
  }));

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.lineTo(points[points.length - 1].x, padT + chartH);
  ctx.lineTo(points[0].x, padT + chartH);
  ctx.closePath();
  ctx.fillStyle = "rgba(8, 159, 138, 0.12)";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 3;
  ctx.stroke();

  points.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  ctx.textAlign = "center";
  ctx.fillStyle = SLATE;
  ctx.font = "11px system-ui, 'Segoe UI', sans-serif";
  labels.forEach((lbl, i) => {
    const x = points[i].x;
    ctx.fillText(String(lbl).slice(0, 12), x, padT + chartH + 22);
  });

  return canvas;
}

function drawDoughnutChartPng(items, title) {
  const { canvas, ctx, w, h } = setupHiDpiCanvas(CHART_W, CHART_H);
  ctx.fillStyle = PAGE_BG;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#0F172A";
  ctx.font = "600 17px system-ui, 'Segoe UI', sans-serif";
  ctx.fillText(title || "Distribución por tipo de operación", 28, 34);

  const list = Array.isArray(items) ? items.filter((x) => x && (Number(x.value) > 0 || x.label)) : [];
  if (!list.length) {
    ctx.fillStyle = SLATE;
    ctx.font = "14px system-ui, 'Segoe UI', sans-serif";
    ctx.fillText("Sin datos de tipos en el período.", 28, 160);
    return canvas;
  }

  const cx = 260;
  const cy = h / 2 + 10;
  const r = 100;
  const innerR = 58;
  const total = list.reduce((a, x) => a + (Number(x.value) || 0), 0) || 1;

  let ang = -Math.PI / 2;
  list.forEach((item, i) => {
    const val = Number(item.value) || 0;
    const slice = (val / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, ang, ang + slice);
    ctx.closePath();
    ctx.fillStyle = DOUGHNUT_COLORS[i % DOUGHNUT_COLORS.length];
    ctx.fill();
    ang += slice;
  });

  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.fillStyle = PAGE_BG;
  ctx.fill();

  ctx.fillStyle = "#0F172A";
  ctx.font = "700 20px system-ui, 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${Math.round(total)}`, cx, cy - 4);
  ctx.font = "11px system-ui, 'Segoe UI', sans-serif";
  ctx.fillStyle = SLATE;
  ctx.fillText("acciones", cx, cy + 14);

  let ly = 90;
  ctx.textAlign = "left";
  list.slice(0, 8).forEach((item, i) => {
    const val = Number(item.value) || 0;
    const pct = Math.round((val / total) * 100);
    ctx.fillStyle = DOUGHNUT_COLORS[i % DOUGHNUT_COLORS.length];
    ctx.fillRect(440, ly - 8, 12, 12);
    ctx.fillStyle = "#0F172A";
    ctx.font = "13px system-ui, 'Segoe UI', sans-serif";
    const label = String(item.label || "—").slice(0, 28);
    ctx.fillText(`${label}  ·  ${val} (${pct}%)`, 460, ly);
    ly += 26;
  });

  return canvas;
}

function styleHeaderRow(row, cols) {
  row.height = 22;
  for (let c = 1; c <= cols; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF089F8A" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FF089F8A" } },
      left: { style: "thin", color: { argb: "FF089F8A" } },
      bottom: { style: "thin", color: { argb: "FF067A6A" } },
      right: { style: "thin", color: { argb: "FF089F8A" } },
    };
  }
}

function zebraRow(row, cols, odd) {
  row.height = 19;
  const fill = odd ? "FFF8FAFC" : "FFFFFFFF";
  for (let c = 1; c <= cols; c++) {
    const cell = row.getCell(c);
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: fill },
    };
    cell.border = {
      top: { style: "hair", color: { argb: "FFE2E8F0" } },
      left: { style: "hair", color: { argb: "FFE2E8F0" } },
      bottom: { style: "hair", color: { argb: "FFE2E8F0" } },
      right: { style: "hair", color: { argb: "FFE2E8F0" } },
    };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.font = { size: 11, color: { argb: "FF0F172A" } };
  }
}

function writeExecutiveSummaryOnDashboard(dash, data) {
  const ex = data?.executiveSummary || {};
  dash.mergeCells("A3:H3");
  const titleCell = dash.getCell("A3");
  titleCell.value = "Resumen ejecutivo";
  titleCell.font = { bold: true, size: 13, color: { argb: "FF067A6A" } };
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE6F7F3" },
  };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  dash.getRow(3).height = 24;

  dash.mergeCells("A4:H5");
  const head = dash.getCell("A4");
  head.value =
    ex.headline ||
    "Sin síntesis disponible. Vuelva a generar el informe desde el panel con datos cargados.";
  head.font = { bold: true, size: 12, color: { argb: "FF0F172A" } };
  head.alignment = { wrapText: true, vertical: "top" };
  dash.getRow(4).height = 28;
  dash.getRow(5).height = 22;

  const cov = ex.coverage;
  const covLine =
    cov?.expected != null
      ? `Cobertura de cortes: ${cov.withData} de ${cov.expected} días esperados con documento diario.${
          cov.missing ? ` (${cov.missing} día(s) esperados sin registro.)` : ""
        }`
      : "";

  dash.mergeCells("A6:H8");
  const body = dash.getCell("A6");
  const findings = (ex.findings || []).map((f) => `• ${f}`).join("\n");
  body.value = [covLine, findings].filter(Boolean).join("\n\n");
  body.alignment = { wrapText: true, vertical: "top" };
  body.font = { size: 11, color: { argb: "FF334155" } };
  dash.getRow(6).height = 24;
  dash.getRow(7).height = 24;
  dash.getRow(8).height = 24;

  dash.mergeCells("A9:H10");
  const focus = dash.getCell("A9");
  focus.value = `Seguimiento sugerido\n${ex.recommendedFocus || "—"}`;
  focus.font = { size: 11, italic: false, color: { argb: "FF0F766E" }, bold: true };
  focus.alignment = { wrapText: true, vertical: "top" };
  focus.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF1FBF8" },
  };
  dash.getRow(9).height = 30;
  dash.getRow(10).height = 26;
}

async function buildWorkbook(data, ctx, ExcelJS) {
  const {
    tenantId,
    company,
    activeFilter,
    selectedDate,
    userEmail,
    userName,
  } = ctx;
  const now = new Date();

  const barLabels = (data?.barData || []).map((r) => r.label);
  const barVals = (data?.barData || []).map((r) => r.value);
  const lineLabels = (data?.lineData || []).map((r) => r.label);
  const lineVals = (data?.lineData || []).map((r) => r.value);
  const mixItems = (data?.typeMix || []).map((r) => ({
    label: r.label,
    value: r.value,
  }));

  const barTotal = barVals.reduce((a, v) => a + (Number(v) || 0), 0);
  const barSubtitle =
    barLabels.length && barTotal > 0
      ? `Total ${barTotal} descargas · Promedio ${Math.round(barTotal / barLabels.length)} por intervalo`
      : "";

  const lineAvg =
    lineVals.length > 0
      ? Math.round(lineVals.reduce((a, v) => a + (Number(v) || 0), 0) / lineVals.length)
      : 0;
  const lineSubtitle = lineVals.length
    ? `Promedio ${lineAvg}% en el período · Línea de referencia al 85%`
    : "";

  const imgBar = canvasToBase64Png(
    drawBarChartPng(barLabels, barVals, "Descargas completadas por período", barSubtitle)
  );
  const imgLine = canvasToBase64Png(
    drawLineChartPng(lineLabels, lineVals, "Cumplimiento operativo (%)", lineSubtitle)
  );
  const imgDonut = canvasToBase64Png(
    drawDoughnutChartPng(mixItems, "Mix por tipo de operación")
  );

  const wb = new ExcelJS.Workbook();
  wb.creator = "AppoloDesk";
  wb.created = now;
  wb.modified = now;
  wb.subject = `Filtro: ${activeFilter || "—"} · ${selectedDate || "—"}`;

  const dash = wb.addWorksheet("Dashboard", {
    properties: { tabColor: { argb: "FF089F8A" } },
    views: [{ showGridLines: false }],
  });

  dash.columns = [{ width: 14 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 10 }];

  dash.mergeCells("A1:H1");
  const title = dash.getCell("A1");
  title.value = "Informe operativo — Recepción";
  title.font = { size: 22, bold: true, color: { argb: "FFFFFFFF" } };
  title.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF089F8A" },
  };
  title.alignment = { vertical: "middle", horizontal: "center" };
  dash.getRow(1).height = 46;

  dash.mergeCells("A2:H2");
  const sub = dash.getCell("A2");
  sub.value = `${data?.label || "Período"}  ·  Generado ${now.toLocaleString("es-CR")}  ·  ${userName || userEmail || "Usuario"}`;
  sub.font = { size: 12, color: { argb: "FF475569" }, italic: true };
  sub.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  dash.getRow(2).height = 28;

  writeExecutiveSummaryOnDashboard(dash, data);

  const KPI_ROW = 11;
  const BAR_ROW = 12;
  const LINE_ROW = 29;
  const DONUT_ROW = 46;
  const CTX_START = 63;

  const kpiRow = dash.getRow(KPI_ROW);
  kpiRow.height = 52;
  const kpis = data?.kpis || [];
  const pick = (i) => (kpis[i] ? `${kpis[i].value}\n${kpis[i].label}` : "—");
  const cells = [pick(2), pick(0), pick(1), pick(3)];
  for (let i = 0; i < 4; i++) {
    const c = i * 2 + 1;
    dash.mergeCells(KPI_ROW, c, KPI_ROW, c + 1);
    const cell = dash.getCell(KPI_ROW, c);
    cell.value = cells[i];
    cell.font = { size: 12, bold: true, color: { argb: "FF0F172A" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: i % 2 === 0 ? "FFF1FBF8" : "FFFFFFFF" },
    };
    cell.border = {
      top: { style: "medium", color: { argb: "FF089F8A" } },
      left: { style: "thin", color: { argb: "FFE2E8F0" } },
      bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
      right: { style: "thin", color: { argb: "FFE2E8F0" } },
    };
  }

  const idBar = wb.addImage({ base64: imgBar, extension: "png" });
  dash.addImage(idBar, {
    tl: { col: 0, row: BAR_ROW },
    ext: { width: 900, height: 300 },
  });

  const idLine = wb.addImage({ base64: imgLine, extension: "png" });
  dash.addImage(idLine, {
    tl: { col: 0, row: LINE_ROW },
    ext: { width: 900, height: 300 },
  });

  const idDonut = wb.addImage({ base64: imgDonut, extension: "png" });
  dash.addImage(idDonut, {
    tl: { col: 0, row: DONUT_ROW },
    ext: { width: 900, height: 300 },
  });

  dash.getRow(BAR_ROW).height = 2;
  dash.getRow(LINE_ROW).height = 2;
  dash.getRow(DONUT_ROW).height = 2;

  let r = CTX_START;
  dash.mergeCells(`A${r}:H${r}`);
  const sec = dash.getCell(`A${r}`);
  sec.value = "Resumen de contexto";
  sec.font = { size: 14, bold: true, color: { argb: "FF089F8A" } };
  r += 1;

  const metaLines = [
    ["Empresa", company || "—"],
    ["Tenant", tenantId || "—"],
    ["Filtro", String(activeFilter || "—")],
    ["Fecha selector", String(selectedDate || "—")],
    ["Cumplimiento global", `${Number(data?.compliance ?? 0)} %`],
    ["Acciones creadas (período)", Number(data?.accionesCreadas ?? 0)],
  ];
  metaLines.forEach(([a, b], idx) => {
    const row = dash.getRow(r + idx);
    row.height = 20;
    row.getCell(1).value = a;
    row.getCell(1).font = { bold: true, color: { argb: "FF64748B" } };
    row.getCell(2).value = b;
    row.getCell(2).alignment = { wrapText: true };
    dash.mergeCells(r + idx, 2, r + idx, 8);
  });

  const addDataSheet = (name, tabColor, buildFn) => {
    const ws = wb.addWorksheet(name, {
      properties: { tabColor: { argb: tabColor } },
    });
    buildFn(ws);
  };

  addDataSheet("Resumen_ejecutivo", "FF14B8A6", (ws) => {
    const ex = data?.executiveSummary || {};
    ws.columns = [{ width: 28 }, { width: 22 }, { width: 42 }];
    let r = 1;
    const titleR = ws.getRow(r);
    titleR.getCell(1).value = "Resumen ejecutivo";
    titleR.getCell(1).font = { bold: true, size: 16, color: { argb: "FF089F8A" } };
    r += 1;
    ws.getRow(r).getCell(1).value = ex.headline || "—";
    ws.getRow(r).getCell(1).font = { bold: true, size: 12, color: { argb: "FF0F172A" } };
    ws.getRow(r).getCell(1).alignment = { wrapText: true };
    r += 2;
    if (ex.coverage?.expected != null) {
      ws.getRow(r).getCell(1).value = "Cobertura de cortes";
      ws.getRow(r).getCell(1).font = { bold: true, color: { argb: "FF64748B" } };
      ws.getRow(r).getCell(2).value = `${ex.coverage.withData} / ${ex.coverage.expected} días con registro`;
      ws.getRow(r).getCell(3).value =
        ex.coverage.missing > 0 ? `${ex.coverage.missing} día(s) esperados sin documento` : "Sin faltantes";
      r += 1;
    }
    r += 1;
    const h1 = ws.getRow(r);
    h1.getCell(1).value = "Pilar";
    h1.getCell(2).value = "Valor";
    h1.getCell(3).value = "Contexto";
    styleHeaderRow(h1, 3);
    r += 1;
    for (const p of ex.pillars || []) {
      const R = ws.getRow(r);
      R.getCell(1).value = p.title || "";
      R.getCell(2).value = p.value || "";
      R.getCell(3).value = p.hint || "";
      zebraRow(R, 3, r % 2 === 0);
      r += 1;
    }
    r += 1;
    ws.mergeCells(r, 1, r, 3);
    const h2 = ws.getRow(r);
    h2.height = 22;
    const h2c = h2.getCell(1);
    h2c.value = "Hallazgos";
    h2c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    h2c.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF089F8A" },
    };
    h2c.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    r += 1;
    for (const f of ex.findings || []) {
      const R = ws.getRow(r);
      R.getCell(1).value = f;
      ws.mergeCells(r, 1, r, 3);
      R.getCell(1).alignment = { wrapText: true, vertical: "top" };
      R.height = Math.min(80, 18 + String(f).split("\n").length * 16);
      zebraRow(R, 3, r % 2 === 0);
      r += 1;
    }
    r += 1;
    ws.getRow(r).getCell(1).value = "Seguimiento sugerido";
    ws.getRow(r).getCell(1).font = { bold: true, color: { argb: "FF089F8A" } };
    r += 1;
    ws.getRow(r).getCell(1).value = ex.recommendedFocus || "—";
    ws.getRow(r).getCell(1).alignment = { wrapText: true };
    ws.mergeCells(r, 1, r, 3);
    r += 2;
    const h3 = ws.getRow(r);
    h3.getCell(1).value = "Métrica";
    h3.getCell(2).value = "Valor";
    styleHeaderRow(h3, 2);
    r += 1;
    for (const s of ex.metricSnapshot || []) {
      const R = ws.getRow(r);
      R.getCell(1).value = s.label || "";
      R.getCell(2).value = s.value || "";
      zebraRow(R, 2, r % 2 === 0);
      r += 1;
    }
  });

  addDataSheet("Cortes_diarios", "FF0D9488", (ws) => {
    ws.columns = [
      { width: 12 },
      { width: 22 },
      { width: 36 },
      { width: 12 },
      { width: 12 },
      { width: 10 },
      { width: 14 },
      { width: 16 },
      { width: 12 },
      { width: 18 },
    ];
    const hdr = [
      "Fecha (ISO)",
      "Fecha",
      "ID documento",
      "Finalizadas",
      "Iniciadas",
      "Creadas",
      "Bultos",
      "Tiempo total (ms)",
      "Tiempo prom. (min)",
      "Tiempo prom. (texto)",
    ];
    const hRow = ws.getRow(1);
    hdr.forEach((text, i) => {
      hRow.getCell(i + 1).value = text;
    });
    styleHeaderRow(hRow, hdr.length);
    let rowIdx = 2;
    for (const row of data?.dailySlice || []) {
      const af = row.accionesFinalizadas;
      const tpMs = af > 0 ? Math.round(row.accionesTiempoTotalMs / af) : 0;
      const tpMin = tpMs > 0 ? Math.round((tpMs / 60000) * 100) / 100 : 0;
      const R = ws.getRow(rowIdx);
      R.getCell(1).value = row.dayKey;
      R.getCell(2).value = formatDayKeyForLocale(row.dayKey);
      R.getCell(3).value = row.docId;
      R.getCell(4).value = row.accionesFinalizadas;
      R.getCell(5).value = row.accionesIniciadas;
      R.getCell(6).value = row.accionesCreadas;
      R.getCell(7).value = row.accionesBultosTotales;
      R.getCell(8).value = row.accionesTiempoTotalMs;
      R.getCell(9).value = tpMin;
      R.getCell(10).value = fmtMinutesFromMs(tpMs);
      zebraRow(R, hdr.length, rowIdx % 2 === 0);
      rowIdx += 1;
    }
    if (rowIdx > 2) {
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: rowIdx - 1, column: hdr.length },
      };
    }
  });

  addDataSheet("KPIs", "FF14B8A6", (ws) => {
    ws.columns = [{ width: 28 }, { width: 16 }, { width: 36 }, { width: 40 }];
    const hdr = ["Indicador", "Valor", "Detalle", "Comparación"];
    const hRow = ws.getRow(1);
    hdr.forEach((text, i) => hRow.getCell(i + 1).value = text);
    styleHeaderRow(hRow, hdr.length);
    let i = 2;
    for (const k of data?.kpis || []) {
      const R = ws.getRow(i);
      R.getCell(1).value = k.label;
      R.getCell(2).value = k.value;
      R.getCell(3).value = k.hint || "";
      R.getCell(4).value = k.comparison || "";
      zebraRow(R, hdr.length, i % 2 === 0);
      i += 1;
    }
    if (i > 2) {
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: i - 1, column: hdr.length } };
    }
  });

  addDataSheet("Datos_graficos", "FF64748B", (ws) => {
    ws.getCell(1, 1).value = "Descargas por período (tabla)";
    ws.getCell(1, 1).font = { bold: true, size: 12, color: { argb: "FF089F8A" } };
    const h1 = ws.getRow(3);
    h1.getCell(1).value = "Etiqueta";
    h1.getCell(2).value = "Valor";
    styleHeaderRow(h1, 2);
    let r = 4;
    for (const row of data?.barData || []) {
      const R = ws.getRow(r);
      R.getCell(1).value = row.label;
      R.getCell(2).value = row.value;
      zebraRow(R, 2, r % 2 === 0);
      r += 1;
    }
    const startLine = r + 2;
    ws.getCell(startLine, 1).value = "Cumplimiento por punto (tabla)";
    ws.getCell(startLine, 1).font = { bold: true, size: 12, color: { argb: "FF089F8A" } };
    const h2 = ws.getRow(startLine + 2);
    h2.getCell(1).value = "Etiqueta";
    h2.getCell(2).value = "Cumplimiento %";
    styleHeaderRow(h2, 2);
    let r2 = startLine + 3;
    for (const row of data?.lineData || []) {
      const R = ws.getRow(r2);
      R.getCell(1).value = row.label;
      R.getCell(2).value = row.value;
      zebraRow(R, 2, r2 % 2 === 0);
      r2 += 1;
    }
    const startMix = r2 + 2;
    ws.getCell(startMix, 1).value = "Mix por tipo";
    ws.getCell(startMix, 1).font = { bold: true, size: 12, color: { argb: "FF089F8A" } };
    const h3 = ws.getRow(startMix + 2);
    h3.getCell(1).value = "Tipo";
    h3.getCell(2).value = "Cantidad";
    h3.getCell(3).value = "%";
    styleHeaderRow(h3, 3);
    let r3 = startMix + 3;
    for (const row of data?.typeMix || []) {
      const R = ws.getRow(r3);
      R.getCell(1).value = row.label;
      R.getCell(2).value = row.value;
      R.getCell(3).value = row.percent ?? "";
      zebraRow(R, 3, r3 % 2 === 0);
      r3 += 1;
    }
  });

  addDataSheet("Andenes", "FF0F766E", (ws) => {
    ws.columns = [{ width: 18 }, { width: 14 }, { width: 14 }];
    const hRow = ws.getRow(1);
    ["Andén", "Acciones", "Finalizadas"].forEach((t, i) => {
      hRow.getCell(i + 1).value = t;
    });
    styleHeaderRow(hRow, 3);
    let i = 2;
    for (const a of data?.andenesData || []) {
      const R = ws.getRow(i);
      R.getCell(1).value = a.label;
      R.getCell(2).value = a.acciones;
      R.getCell(3).value = a.finalizadas;
      zebraRow(R, 3, i % 2 === 0);
      i += 1;
    }
    if (i > 2) {
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: i - 1, column: 3 } };
    }
  });

  addDataSheet("Andenes_detalle", "FF134E4A", (ws) => {
    ws.columns = [{ width: 18 }, { width: 28 }, { width: 12 }, { width: 12 }];
    const hdr = ["Andén", "Usuario", "Iniciadas", "Finalizadas"];
    const hRow = ws.getRow(1);
    hdr.forEach((t, i) => {
      hRow.getCell(i + 1).value = t;
    });
    styleHeaderRow(hRow, hdr.length);
    let i = 2;
    for (const a of data?.andenesData || []) {
      for (const s of a.starters || []) {
        const R = ws.getRow(i);
        R.getCell(1).value = a.label;
        R.getCell(2).value = s.label || s.uid || "—";
        R.getCell(3).value = s.iniciadas ?? "";
        R.getCell(4).value = s.finalizadas ?? "";
        zebraRow(R, hdr.length, i % 2 === 0);
        i += 1;
      }
    }
    if (i > 2) {
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: i - 1, column: hdr.length } };
    }
  });

  addDataSheet("Equipo", "FF115E59", (ws) => {
    ws.columns = [{ width: 26 }, { width: 12 }, { width: 12 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 18 }, { width: 18 }];
    const hdr = [
      "Usuario",
      "Iniciadas",
      "Finalizadas",
      "Bultos",
      "Tiempo prom. (min)",
      "Tiempo total (min)",
      "Tiempo prom.",
      "Tiempo total",
    ];
    const hRow = ws.getRow(1);
    hdr.forEach((t, i) => {
      hRow.getCell(i + 1).value = t;
    });
    styleHeaderRow(hRow, hdr.length);
    let i = 2;
    for (const t of data?.teamProductivity || []) {
      const tpm = t.tiempoPromedioMs || 0;
      const ttm = t.tiempoTotalMs || 0;
      const R = ws.getRow(i);
      R.getCell(1).value = t.label || "—";
      R.getCell(2).value = t.iniciadas ?? "";
      R.getCell(3).value = t.finalizadas ?? "";
      R.getCell(4).value = t.bultos ?? "";
      R.getCell(5).value = tpm > 0 ? Math.round((tpm / 60000) * 100) / 100 : 0;
      R.getCell(6).value = ttm > 0 ? Math.round((ttm / 60000) * 100) / 100 : 0;
      R.getCell(7).value = fmtMinutesFromMs(tpm);
      R.getCell(8).value = fmtMinutesFromMs(ttm);
      zebraRow(R, hdr.length, i % 2 === 0);
      i += 1;
    }
    if (i > 2) {
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: i - 1, column: hdr.length } };
    }
  });

  addDataSheet("Metadatos", "FF94A3B8", (ws) => {
    ws.columns = [{ width: 34 }, { width: 48 }];
    let r = 1;
    const push = (a, b) => {
      const row = ws.getRow(r);
      row.getCell(1).value = a;
      row.getCell(2).value = b;
      row.getCell(1).font = { bold: true, color: { argb: "FF475569" } };
      row.getCell(2).alignment = { wrapText: true };
      r += 1;
    };
    push("Generado (UTC)", now.toISOString());
    push("Correo", userEmail || "—");
    push("Tenant", tenantId || "—");
    push("Empresa", company || "—");
    push("Vista", data?.label || "—");
    r += 1;
    ws.getCell(r, 1).value = "Días esperados (filtro)";
    ws.getCell(r, 1).font = { bold: true, size: 12, color: { argb: "FF089F8A" } };
    r += 1;
    const h1 = ws.getRow(r);
    h1.getCell(1).value = "dayKey";
    h1.getCell(2).value = "Fecha";
    styleHeaderRow(h1, 2);
    r += 1;
    for (const dk of data?.periodDayKeysExpected || []) {
      const R = ws.getRow(r);
      R.getCell(1).value = dk;
      R.getCell(2).value = formatDayKeyForLocale(dk);
      zebraRow(R, 2, r % 2 === 0);
      r += 1;
    }
    r += 1;
    ws.getCell(r, 1).value = "Con documento en Firestore";
    ws.getCell(r, 1).font = { bold: true, size: 12, color: { argb: "FF089F8A" } };
    r += 1;
    const h2 = ws.getRow(r);
    h2.getCell(1).value = "dayKey";
    h2.getCell(2).value = "Fecha";
    styleHeaderRow(h2, 2);
    r += 1;
    for (const dk of data?.dayKeysWithData || []) {
      const R = ws.getRow(r);
      R.getCell(1).value = dk;
      R.getCell(2).value = formatDayKeyForLocale(dk);
      zebraRow(R, 2, r % 2 === 0);
      r += 1;
    }
    if ((data?.dayKeysSinDatos || []).length > 0) {
      r += 1;
      ws.getCell(r, 1).value = "Esperados sin registro diario";
      ws.getCell(r, 1).font = { bold: true, size: 12, color: { argb: "FFDC2626" } };
      r += 1;
      const h3 = ws.getRow(r);
      h3.getCell(1).value = "dayKey";
      h3.getCell(2).value = "Fecha";
      styleHeaderRow(h3, 2);
      r += 1;
      for (const dk of data.dayKeysSinDatos) {
        const R = ws.getRow(r);
        R.getCell(1).value = dk;
        R.getCell(2).value = formatDayKeyForLocale(dk);
        zebraRow(R, 2, r % 2 === 0);
        r += 1;
      }
    }
  });

  addDataSheet("Alertas", "FFF59E0B", (ws) => {
    ws.columns = [{ width: 12 }, { width: 28 }, { width: 70 }];
    const hRow = ws.getRow(1);
    ["Nivel", "Título", "Descripción"].forEach((t, i) => hRow.getCell(i + 1).value = t);
    styleHeaderRow(hRow, 3);
    let i = 2;
    for (const al of data?.alerts || []) {
      const R = ws.getRow(i);
      R.getCell(1).value = al.tone || "";
      R.getCell(2).value = al.title || "";
      R.getCell(3).value = al.description || "";
      zebraRow(R, 3, i % 2 === 0);
      i += 1;
    }
  });

  addDataSheet("Notas", "FFCBD5E1", (ws) => {
    ws.getColumn(1).width = 92;
    let r = 1;
    for (const n of data?.notes || []) {
      const cell = ws.getCell(r, 1);
      cell.value = n;
      cell.alignment = { wrapText: true, vertical: "top" };
      cell.font = { size: 12, color: { argb: "FF334155" } };
      ws.getRow(r).height = Math.min(120, 16 + String(n).split("\n").length * 18);
      r += 1;
    }
  });

  return wb.xlsx.writeBuffer();
}

/**
 * @returns {Promise<ArrayBuffer>}
 */
export async function buildMetricaRecepcionExcelProBuffer(data, ctx) {
  const ExcelJS = (await import("exceljs")).default;
  return buildWorkbook(data, ctx, ExcelJS);
}
