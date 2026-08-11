#!/usr/bin/env node
/**
 * Importa a MRP Tarimas los movimientos históricos de tarimas que vienen en los
 * reportes del WMS (carpeta `saldos/`, archivos "ReporteMovimientos <art> ...").
 *
 * Cada fila del reporte es una salida de tarimas de almacén hacia una tienda:
 *   - `Artículo`        → código del artículo MRP (30000390 / 30000391).
 *   - `Cantidad`        → viene NEGATIVA en el reporte; se toma el valor absoluto.
 *   - `Fecha Atención`  → fecha real del movimiento (se preserva en el Historial).
 *   - `Ref.2`           → tienda destino: "TIENDA 6-20260728073301" → Tienda 6 → T6.
 *                         También se acepta el prefijo "CARRETA N" (mismo destino).
 *   - `Id Movimiento`   → external_event_id: hace la carga IDEMPOTENTE.
 *
 * Se carga vía la RPC `mrp_consume_tarimas_external`, que es el punto de entrada
 * oficial para consumos externos: no toca inventario a mano, mueve stock con
 * `mrp_articulo_transfer` (almacen → tienda), deja el movimiento en el Historial
 * (`pallet_movimientos_articulo`) con la tienda sellada en metadata, y evita
 * duplicados por `external_event_id`.
 *
 * Requiere la migración `supabase/migrations/20260736_mrp_consume_tarimas_external_created_at.sql`
 * (añade `p_created_at`); sin ella los movimientos quedarían fechados hoy.
 *
 * Uso:
 *   node scripts/import-mrp-movimientos-tarimas.mjs                 # dry-run (no escribe)
 *   node scripts/import-mrp-movimientos-tarimas.mjs --apply         # carga de verdad
 *   node scripts/import-mrp-movimientos-tarimas.mjs --apply --limit=5
 *
 * Flags:
 *   --apply                Ejecuta las escrituras. Sin este flag es dry-run.
 *   --dir=saldos           Carpeta con los .xlsx.
 *   --bodega=CR-OLO-CLIRO  Bodega (y por ende almacén) de la que sale el stock.
 *   --tz=-06:00            Offset de `Fecha Atención` (Costa Rica, sin horario de verano).
 *   --user-id=...          Autor sellado en los movimientos.
 *   --user-email=...       Correo del autor (opcional).
 *   --limit=N              Procesa solo las primeras N filas (prueba).
 *   --fix-tiendas          Rellena `external_code` (T2, T3, …) en las tiendas que no lo tengan.
 *   --log=ruta.json        Guarda el detalle fila por fila.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import JSZip from "jszip";
import { createClient } from "@supabase/supabase-js";

/* ─── CLI ────────────────────────────────────────────────────────────────── */
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback = null) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const APPLY = flag("apply");
const DIR = path.resolve(opt("dir", "saldos"));
const BODEGA_ID = opt("bodega", "CR-OLO-CLIRO");
const TZ_OFFSET = opt("tz", "-06:00");
const USER_ID = opt("user-id", "import-saldos-wms");
const USER_EMAIL = opt("user-email", null);
const LIMIT = Number(opt("limit", "0")) || 0;
const FIX_TIENDAS = flag("fix-tiendas");
const LOG_PATH = opt("log", null);

const TENANT_ID = "CR";
const COMPANY = "OLO";

/* ─── Columnas esperadas (se resuelven por NOMBRE, no por posición) ──────── */
const COL = {
  idMovimiento: "Id Movimiento",
  articulo: "Artículo",
  descripcion: "DESCRIPCIONLARGA",
  cantidad: "Cantidad",
  fechaAtencion: "Fecha Atención",
  ref2: "Ref.2",
  ref3: "Ref.3",
};

/* ─── Lectura de los .xlsx ───────────────────────────────────────────────── */
// Los reportes del WMS traen el XML con prefijo de namespace `x:`, sin
// sharedStrings y con celdas SIN atributo `r` (la posición es implícita por
// orden). ExcelJS no los abre, así que se parsea la hoja directamente.
function decodeEntities(s) {
  return String(s)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, "&");
}

function parseSheetXml(xml) {
  const open = xml.indexOf("<x:sheetData>");
  const close = xml.indexOf("</x:sheetData>");
  if (open < 0 || close < 0) throw new Error("No se encontró <x:sheetData> en la hoja");
  const body = xml.slice(open + "<x:sheetData>".length, close);

  const rows = [];
  const rowRe = /<x:row(?:\s[^>]*)?>([\s\S]*?)<\/x:row>|<x:row(?:\s[^>]*)?\/>/g;
  let rm;
  while ((rm = rowRe.exec(body)) !== null) {
    const inner = rm[1] || "";
    const cells = [];
    const cellRe = /<x:c(?:\s([^>]*?))?>([\s\S]*?)<\/x:c>|<x:c(?:\s([^>]*?))?\/>/g;
    let cm;
    while ((cm = cellRe.exec(inner)) !== null) {
      if (cm[2] === undefined) {
        cells.push("");
        continue;
      }
      const attrs = cm[1] || "";
      const isInline = /\bt="inlineStr"/.test(attrs);
      const tag = isInline ? "x:t" : "x:v";
      const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`);
      const hit = re.exec(cm[2]);
      cells.push(hit ? decodeEntities(hit[1]) : "");
    }
    rows.push(cells);
  }
  return rows;
}

async function readReport(file) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const entry = zip.file("xl/worksheets/sheet1.xml");
  if (!entry) throw new Error(`${path.basename(file)}: no tiene xl/worksheets/sheet1.xml`);
  const rows = parseSheetXml(await entry.async("string"));
  if (rows.length < 2) throw new Error(`${path.basename(file)}: sin filas de datos`);

  const header = rows[0];
  const index = {};
  for (const [key, title] of Object.entries(COL)) {
    const i = header.indexOf(title);
    if (i < 0) {
      throw new Error(
        `${path.basename(file)}: falta la columna "${title}". ` +
          `Encabezado leído: ${header.slice(0, 20).join(" | ")}…`
      );
    }
    index[key] = i;
  }
  return { header, index, dataRows: rows.slice(1) };
}

/* ─── Normalización de una fila ──────────────────────────────────────────── */
// "TIENDA 6-20260728073301" → 6 ; "CARRETA 4-2026..." → 4
const TIENDA_RE = /^\s*(?:TIENDA|CARRETA)\s+(\d+)\s*-/i;

function parseDestino(ref2) {
  const m = TIENDA_RE.exec(String(ref2 || ""));
  if (!m) return null;
  const num = Number(m[1]);
  return Number.isInteger(num) && num > 0 ? num : null;
}

// "2026-08-03 06:14:22.210" (hora local) → ISO con offset explícito.
// Sin offset, Postgres lo interpretaría en el timezone de la sesión (UTC) y el
// movimiento quedaría corrido 6 horas.
function parseFecha(raw) {
  const s = String(raw || "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(s);
  if (!m) return null;
  const ms = (m[7] || "0").padEnd(3, "0");
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${ms}${TZ_OFFSET}`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : iso;
}

function normalizeRow(cells, index, file) {
  const get = (key) => String(cells[index[key]] ?? "").trim();

  const idMovimiento = get("idMovimiento");
  const articulo = get("articulo");
  const cantidadRaw = get("cantidad");
  const ref2 = get("ref2");
  const ref3 = get("ref3");
  const fechaRaw = get("fechaAtencion");

  const problems = [];
  if (!idMovimiento) problems.push("Id Movimiento vacío");
  if (!articulo) problems.push("Artículo vacío");

  const cantidadNum = Number(cantidadRaw);
  // El reporte trae la cantidad en negativo (es una salida): se ignora el signo.
  const quantity = Number.isFinite(cantidadNum) ? Math.abs(cantidadNum) : NaN;
  if (!Number.isInteger(quantity) || quantity <= 0) {
    problems.push(`Cantidad no utilizable: "${cantidadRaw}"`);
  }

  const fecha = parseFecha(fechaRaw);
  if (!fecha) problems.push(`Fecha Atención no parseable: "${fechaRaw}"`);

  const tiendaNum = parseDestino(ref2);
  if (tiendaNum === null) problems.push(`Ref.2 sin tienda reconocible: "${ref2}"`);

  const esCarreta = /^\s*CARRETA\s/i.test(ref2);
  // Ref.3 suele repetir el número de tienda; cuando discrepa, manda Ref.2.
  const ref3Num = ref3 === "" ? null : Number(ref3);
  const ref3Mismatch =
    tiendaNum !== null && Number.isFinite(ref3Num) && ref3Num !== tiendaNum;

  return {
    file,
    idMovimiento,
    articulo,
    descripcion: get("descripcion"),
    quantity,
    cantidadRaw,
    fecha,
    fechaRaw,
    ref2,
    ref3,
    tiendaNum,
    tiendaExterna: tiendaNum === null ? null : `T${tiendaNum}`,
    esCarreta,
    ref3Mismatch,
    problems,
  };
}

/* ─── Entorno / Supabase ─────────────────────────────────────────────────── */
function loadEnv() {
  const envPath = path.resolve(".env");
  if (!fs.existsSync(envPath)) throw new Error("No se encontró .env en la raíz del proyecto");
  const out = {};
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const url = out.VITE_SUPABASE_URL;
  const key = out.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Falta VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env");
  return { url, key };
}

/* ─── Utilidades de salida ───────────────────────────────────────────────── */
const fmtInt = (n) => new Intl.NumberFormat("es-CR").format(n);
const line = (c = "─") => console.log(c.repeat(72));

function tabla(titulo, mapa, campos = ["filas", "unidades"]) {
  console.log(`\n${titulo}`);
  const keys = [...mapa.keys()].sort((a, b) => String(a).localeCompare(String(b), "es"));
  for (const k of keys) {
    const v = mapa.get(k);
    console.log(
      `   ${String(k).padEnd(22)} ` +
        campos.map((f) => `${f}=${String(fmtInt(v[f])).padStart(6)}`).join("  ")
    );
  }
}

/* ─── Main ───────────────────────────────────────────────────────────────── */
async function main() {
  line("═");
  console.log("MRP Tarimas — importación de movimientos históricos del WMS");
  line("═");
  console.log(`Modo          : ${APPLY ? "APPLY (escribe)" : "DRY-RUN (no escribe)"}`);
  console.log(`Carpeta       : ${DIR}`);
  console.log(`Bodega/almacén: ${BODEGA_ID}`);
  console.log(`Offset fechas : ${TZ_OFFSET}`);
  console.log(`Autor         : ${USER_ID}${USER_EMAIL ? ` <${USER_EMAIL}>` : ""}`);
  if (LIMIT) console.log(`Límite        : primeras ${LIMIT} filas`);

  /* 1) Leer y normalizar los reportes ------------------------------------- */
  if (!fs.existsSync(DIR)) throw new Error(`No existe la carpeta ${DIR}`);
  const files = fs
    .readdirSync(DIR)
    .filter((f) => f.toLowerCase().endsWith(".xlsx") && !f.startsWith("~$"))
    .sort();
  if (files.length === 0) throw new Error(`No hay .xlsx en ${DIR}`);

  console.log(`\nArchivos (${files.length}):`);
  let rows = [];
  for (const f of files) {
    const { index, dataRows } = await readReport(path.join(DIR, f));
    const parsed = dataRows
      // Filas totalmente vacías (cola de la hoja) se descartan sin ruido.
      .filter((cells) => cells.some((c) => String(c ?? "").trim() !== ""))
      .map((cells) => normalizeRow(cells, index, f));
    console.log(`   ${f} → ${parsed.length} filas`);
    rows = rows.concat(parsed);
  }

  /* 2) Validaciones -------------------------------------------------------- */
  const invalid = rows.filter((r) => r.problems.length > 0);
  const valid = rows.filter((r) => r.problems.length === 0);

  // Id Movimiento duplicado: el mismo external_event_id dos veces haría que la
  // segunda pasada choque contra la idempotencia (o falle por payload distinto).
  const seen = new Map();
  for (const r of valid) seen.set(r.idMovimiento, (seen.get(r.idMovimiento) || 0) + 1);
  const duplicados = [...seen.entries()].filter(([, n]) => n > 1);

  console.log(`\nFilas leídas      : ${fmtInt(rows.length)}`);
  console.log(`Filas utilizables : ${fmtInt(valid.length)}`);
  console.log(`Filas con problema: ${fmtInt(invalid.length)}`);
  if (invalid.length) {
    for (const r of invalid.slice(0, 20)) {
      console.log(`   ✗ ${r.idMovimiento || "(sin id)"} — ${r.problems.join("; ")}`);
    }
    if (invalid.length > 20) console.log(`   … y ${invalid.length - 20} más`);
  }
  if (duplicados.length) {
    console.log(`\n⚠ Id Movimiento duplicados: ${duplicados.length}`);
    for (const [id, n] of duplicados.slice(0, 10)) console.log(`   ${id} ×${n}`);
    throw new Error("Hay Id Movimiento repetidos; revisá los archivos antes de cargar.");
  }

  const carretas = valid.filter((r) => r.esCarreta);
  if (carretas.length) {
    console.log(
      `\nℹ ${carretas.length} filas con Ref.2 "CARRETA N" se tratan como Tienda N ` +
        `(${fmtInt(carretas.reduce((a, r) => a + r.quantity, 0))} unidades).`
    );
  }
  const mismatches = valid.filter((r) => r.ref3Mismatch);
  if (mismatches.length) {
    console.log(`\n⚠ ${mismatches.length} filas donde Ref.3 no coincide con Ref.2 (manda Ref.2):`);
    for (const r of mismatches) {
      console.log(`   ${r.idMovimiento}: Ref.2="${r.ref2}" → T${r.tiendaNum}, Ref.3="${r.ref3}"`);
    }
  }

  /* 3) Resumen del plan ---------------------------------------------------- */
  const porArticulo = new Map();
  const porTienda = new Map();
  for (const r of valid) {
    const a = porArticulo.get(`${r.articulo} ${r.descripcion}`) || { filas: 0, unidades: 0 };
    a.filas += 1;
    a.unidades += r.quantity;
    porArticulo.set(`${r.articulo} ${r.descripcion}`, a);

    const t = porTienda.get(r.tiendaExterna) || { filas: 0, unidades: 0 };
    t.filas += 1;
    t.unidades += r.quantity;
    porTienda.set(r.tiendaExterna, t);
  }
  tabla("Por artículo:", porArticulo);
  tabla("Por tienda destino:", porTienda);

  const fechas = valid.map((r) => r.fecha).sort();
  console.log(
    `\nRango de fechas: ${fechas[0]} → ${fechas[fechas.length - 1]}` +
      `\nTotal a mover  : ${fmtInt(valid.reduce((a, r) => a + r.quantity, 0))} unidades`
  );

  /* 4) Preflight contra la base ------------------------------------------- */
  const { url, key } = loadEnv();
  const sb = createClient(url, key, { auth: { persistSession: false } });
  line();
  console.log("Verificando prerrequisitos en Supabase…");

  const { data: warehouses, error: whErr } = await sb
    .from("pallet_warehouses")
    .select("id,code,name,bodega_id,active")
    .eq("tenant_id", TENANT_ID)
    .eq("company", COMPANY)
    .eq("bodega_id", BODEGA_ID)
    .eq("active", true);
  if (whErr) throw new Error(`Leyendo pallet_warehouses: ${whErr.message}`);
  if (!warehouses?.length) {
    throw new Error(`No hay almacén MRP activo ligado a la bodega ${BODEGA_ID}`);
  }
  console.log(`   ✓ Almacén: ${warehouses[0].name} (${warehouses[0].code})`);

  const codigos = [...new Set(valid.map((r) => r.articulo))];
  const { data: articulos, error: artErr } = await sb
    .from("pallet_articulos")
    .select("id,codigo,nombre,stock,active")
    .eq("tenant_id", TENANT_ID)
    .eq("company", COMPANY)
    .in("codigo", codigos);
  if (artErr) throw new Error(`Leyendo pallet_articulos: ${artErr.message}`);
  const artByCodigo = new Map((articulos || []).map((a) => [String(a.codigo), a]));
  const faltantes = codigos.filter((c) => !artByCodigo.get(c)?.active);
  if (faltantes.length) {
    throw new Error(
      `Artículos inexistentes o inactivos en el MRP: ${faltantes.join(", ")}. ` +
        `Creálos en Catálogos › Artículos con ese código antes de importar.`
    );
  }
  for (const c of codigos) {
    const a = artByCodigo.get(c);
    console.log(`   ✓ Artículo ${c} — ${a.nombre} (stock total ${fmtInt(a.stock)})`);
  }

  // ¿Ya hay algo importado? Se resuelve antes del chequeo de stock para no
  // exigir inventario por movimientos que ya se aplicaron en una corrida previa.
  const idsTodos = valid.map((r) => r.idMovimiento);
  const yaImportados = new Set();
  for (let i = 0; i < idsTodos.length; i += 200) {
    const chunk = idsTodos.slice(i, i + 200);
    const { data, error } = await sb
      .from("pallet_external_consumptions")
      .select("external_event_id")
      .eq("tenant_id", TENANT_ID)
      .eq("company", COMPANY)
      .in("external_event_id", chunk);
    if (error) throw new Error(`Leyendo pallet_external_consumptions: ${error.message}`);
    for (const r of data || []) yaImportados.add(String(r.external_event_id));
  }
  console.log(
    `   Ya importados: ${fmtInt(yaImportados.size)} de ${fmtInt(valid.length)} ` +
      `(se omiten por idempotencia)`
  );

  // Stock en la ubicación `almacen` del almacén de esta bodega: es de donde la
  // RPC descuenta, y `mrp_apply_articulo_stock_delta` impide inventario negativo.
  // Sin este chequeo la corrida podría morir a mitad de camino, dejando parte
  // de los movimientos aplicados.
  const { data: invAlmacen, error: invErr } = await sb
    .from("pallet_inventory_articulo")
    .select("articulo_id,quantity")
    .eq("tenant_id", TENANT_ID)
    .eq("company", COMPANY)
    .eq("warehouse_id", warehouses[0].id)
    .eq("location", "almacen");
  if (invErr) throw new Error(`Leyendo pallet_inventory_articulo: ${invErr.message}`);

  const disponible = new Map();
  for (const r of invAlmacen || []) {
    disponible.set(r.articulo_id, (disponible.get(r.articulo_id) || 0) + Number(r.quantity || 0));
  }
  const requerido = new Map();
  for (const r of valid) {
    if (yaImportados.has(r.idMovimiento)) continue;
    requerido.set(r.articulo, (requerido.get(r.articulo) || 0) + r.quantity);
  }
  const insuficientes = [];
  for (const [codigo, need] of requerido) {
    const art = artByCodigo.get(codigo);
    const have = disponible.get(art.id) || 0;
    const marca = have >= need ? "✓" : "✗";
    console.log(
      `   ${marca} ${codigo} en «almacen» de ${warehouses[0].name}: ` +
        `${fmtInt(have)} disponible / ${fmtInt(need)} a mover`
    );
    if (have < need) insuficientes.push({ codigo, have, need });
  }
  if (insuficientes.length) {
    throw new Error(
      "Stock insuficiente en la ubicación «almacen» para " +
        insuficientes
          .map((x) => `${x.codigo} (faltan ${fmtInt(x.need - x.have)})`)
          .join(", ") +
        ". Ajustá el inventario o revisá la bodega antes de importar."
    );
  }

  // Tiendas: la RPC resuelve el destino por `external_code` (T2, T3, …).
  const { data: tiendas, error: tErr } = await sb
    .from("pallet_tiendas")
    .select("id,codigo,nombre,external_code,active")
    .eq("tenant_id", TENANT_ID)
    .eq("company", COMPANY);
  if (tErr) throw new Error(`Leyendo pallet_tiendas: ${tErr.message}`);

  const needed = [...new Set(valid.map((r) => r.tiendaExterna))];
  const byExternal = new Map(
    (tiendas || [])
      .filter((t) => t.active && String(t.external_code || "").trim())
      .map((t) => [String(t.external_code).trim().toUpperCase(), t])
  );
  // Candidata por nombre: "Tienda 6" ↔ T6.
  const byNombreNum = new Map(
    (tiendas || [])
      .filter((t) => t.active)
      .map((t) => {
        const m = /^\s*tienda\s+(\d+)\s*$/i.exec(String(t.nombre || ""));
        return m ? [`T${Number(m[1])}`, t] : null;
      })
      .filter(Boolean)
  );

  const sinExternal = needed.filter((code) => !byExternal.has(code));
  if (sinExternal.length) {
    console.log(`\n   ⚠ Tiendas sin external_code: ${sinExternal.join(", ")}`);
    const resolubles = sinExternal.filter((c) => byNombreNum.has(c));
    const irresolubles = sinExternal.filter((c) => !byNombreNum.has(c));
    if (irresolubles.length) {
      throw new Error(
        `No hay cliente MRP que corresponda a ${irresolubles.join(", ")}. ` +
          `Creálos en Catálogos › Clientes (nombre "Tienda N") o asignales el código externo.`
      );
    }
    console.log(
      `     Se pueden derivar del nombre: ` +
        resolubles.map((c) => `${c}→${byNombreNum.get(c).nombre}`).join(", ")
    );
    if (!FIX_TIENDAS) {
      throw new Error(
        `Faltan external_code. Corré con --fix-tiendas para asignarlos automáticamente, ` +
          `o hacelo en Dev › Configurar MRP Tarimas › Relación de entidades.`
      );
    }
    if (!APPLY) {
      console.log("     (dry-run: no se escriben los external_code)");
    } else {
      for (const code of resolubles) {
        const t = byNombreNum.get(code);
        const { error } = await sb
          .from("pallet_tiendas")
          .update({ external_code: code })
          .eq("id", t.id);
        if (error) throw new Error(`Asignando external_code ${code} a ${t.nombre}: ${error.message}`);
        byExternal.set(code, { ...t, external_code: code });
        console.log(`     ✓ ${t.nombre} (${t.codigo}) ← external_code ${code}`);
      }
    }
  }
  for (const code of needed) {
    const t = byExternal.get(code) || byNombreNum.get(code);
    console.log(`   ${byExternal.has(code) ? "✓" : "·"} ${code} → ${t ? t.nombre : "?"}`);
  }

  /* 5) Ejecutar ------------------------------------------------------------ */
  const pendientes = valid.filter((r) => !yaImportados.has(r.idMovimiento));
  const objetivo = LIMIT ? pendientes.slice(0, LIMIT) : pendientes;

  line();
  if (!APPLY) {
    console.log(
      `DRY-RUN: se cargarían ${fmtInt(objetivo.length)} movimientos ` +
        `(${fmtInt(objetivo.reduce((a, r) => a + r.quantity, 0))} unidades).`
    );
    console.log("Volvé a correr con --apply para escribir.");
    if (objetivo.length) {
      console.log("\nPrimeras 5 llamadas que se harían:");
      for (const r of objetivo.slice(0, 5)) {
        console.log(
          `   ${r.idMovimiento} | ${r.articulo} | ${r.quantity} u | ${r.tiendaExterna} | ${r.fecha}`
        );
      }
    }
    return;
  }

  console.log(`APPLY: cargando ${fmtInt(objetivo.length)} movimientos…`);
  const results = [];
  let ok = 0;
  let idem = 0;
  let fail = 0;

  // Secuencial a propósito: la RPC genera `movement_code` correlativo y el
  // inventario se toca por artículo/ubicación; en paralelo se contendería.
  for (let i = 0; i < objetivo.length; i++) {
    const r = objetivo[i];
    const payload = {
      p_tenant_id: TENANT_ID,
      p_company: COMPANY,
      p_external_event_id: r.idMovimiento,
      p_bodega_id: BODEGA_ID,
      p_articulo_codigo: r.articulo,
      p_quantity: r.quantity,
      p_reason: `Importación WMS ${r.idMovimiento} · ${r.ref2}`,
      p_user_id: USER_ID,
      p_user_email: USER_EMAIL,
      p_tienda_externa: r.tiendaExterna,
      p_created_at: r.fecha,
    };

    const { data, error } = await sb.rpc("mrp_consume_tarimas_external", payload);
    if (error) {
      fail += 1;
      results.push({ ...r, status: "error", error: error.message });
      console.log(`   ✗ ${r.idMovimiento} — ${error.message}`);
      // Si falla la primera por firma/permiso, no tiene sentido seguir 154 veces.
      if (i === 0) {
        throw new Error(
          `La primera llamada falló. Si dice que la función no existe o que ` +
            `p_created_at es desconocido, ejecutá primero ` +
            `supabase/migrations/20260736_mrp_consume_tarimas_external_created_at.sql`
        );
      }
      continue;
    }
    if (data?.idempotent) {
      idem += 1;
      results.push({ ...r, status: "idempotent", movement_code: data?.movement_code || null });
    } else {
      ok += 1;
      results.push({ ...r, status: "ok", movement_code: data?.movement_code || null });
    }
    if ((i + 1) % 25 === 0 || i + 1 === objetivo.length) {
      console.log(`   … ${i + 1}/${objetivo.length}`);
    }
  }

  line("═");
  console.log(`Cargados     : ${fmtInt(ok)}`);
  console.log(`Idempotentes : ${fmtInt(idem)}`);
  console.log(`Errores      : ${fmtInt(fail)}`);
  const unidadesOk = results
    .filter((r) => r.status === "ok")
    .reduce((a, r) => a + r.quantity, 0);
  console.log(`Unidades movidas a tienda: ${fmtInt(unidadesOk)}`);

  if (LOG_PATH) {
    fs.writeFileSync(LOG_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
    console.log(`Detalle escrito en ${LOG_PATH}`);
  }
  if (fail > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error("\n✗ " + (e?.message || e));
  process.exitCode = 1;
});
