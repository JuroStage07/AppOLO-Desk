import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import ExcelJS from "exceljs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const functionsRequire = createRequire(
  path.join(rootDir, "functions", "package.json")
);

const CONNECTOR_WORDS = new Set(["de", "del", "la", "las", "los", "y", "e", "en"]);
const ACRONYMS = new Set(["TMS", "MC", "EPA", "CEDI", "CCTV"]);

function printHelp() {
  console.log(`
Backfill areaTrabajo en profiles desde un Excel ficha -> area.

Uso:
  npm run backfill:profiles-area -- --xlsx C:\\ruta\\fichas_areas.xlsx
  npm run backfill:profiles-area -- --xlsx C:\\ruta\\fichas_areas.xlsx --write

Opciones:
  --xlsx <path>             Archivo Excel con columnas ficha y Area.
  --sheet <name>            Hoja a leer. Default: primera hoja.
  --write                   Ejecuta escrituras. Sin esto corre en dry-run.
  --missing-only            Solo actualiza profiles sin areaTrabajo.
  --limit <n>               Maximo de documentos a actualizar/simular.
  --page-size <n>           Documentos leidos por pagina. Default: 500.
  --batch-size <n>          Escrituras por batch. Default: 400.
  --sample <n>              Cuantos ejemplos imprimir. Default: 12.
  --project-id <id>         Firebase project id. Default desde .firebaserc.
  --service-account <path>  JSON de service account. Alternativa a ADC.
  --help                    Muestra esta ayuda.

Ejemplo con el service account del proyecto:
  npm run backfill:profiles-area -- --xlsx "C:\\Users\\jcampos\\Desktop\\Proyectos\\AppOLO\\inyectarUsuarios\\fichas_areas.xlsx" --service-account serviceAccountKey.json

Reglas:
  - Busca profiles por numeroFicha.
  - Normaliza ficha para empatar numeros y textos como "PS 452" / "PS452".
  - Guarda areaTrabajo con mayusculas/minusculas: "SERVICIOS GENERALES" -> "Servicios Generales".
  - Filas con area vacia o "n/a" no se usan.
`);
}

function readArgValue(args, index, name) {
  const current = args[index];
  const eq = current.indexOf("=");
  if (eq !== -1) return current.slice(eq + 1);

  const next = args[index + 1];
  if (!next || next.startsWith("--")) {
    throw new Error(`Falta valor para ${name}.`);
  }
  return next;
}

function parsePositiveInt(raw, name) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${name} debe ser un entero positivo.`);
  }
  return n;
}

function parseArgs(args) {
  const opts = {
    xlsx: process.env.PROFILES_AREA_XLSX || "",
    sheet: "",
    write: false,
    missingOnly: false,
    limit: 0,
    pageSize: 500,
    batchSize: 400,
    sample: 12,
    projectId: "",
    serviceAccount: process.env.FIREBASE_SERVICE_ACCOUNT || "",
    help: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const [flag] = arg.split("=", 1);

    switch (flag) {
      case "--xlsx":
      case "--excel":
        opts.xlsx = readArgValue(args, i, flag);
        if (!arg.includes("=")) i += 1;
        break;
      case "--sheet":
        opts.sheet = readArgValue(args, i, flag);
        if (!arg.includes("=")) i += 1;
        break;
      case "--write":
        opts.write = true;
        break;
      case "--dry-run":
        opts.write = false;
        break;
      case "--missing-only":
        opts.missingOnly = true;
        break;
      case "--limit":
        opts.limit = parsePositiveInt(readArgValue(args, i, flag), flag);
        if (!arg.includes("=")) i += 1;
        break;
      case "--page-size":
        opts.pageSize = parsePositiveInt(readArgValue(args, i, flag), flag);
        if (!arg.includes("=")) i += 1;
        break;
      case "--batch-size":
        opts.batchSize = parsePositiveInt(readArgValue(args, i, flag), flag);
        if (!arg.includes("=")) i += 1;
        break;
      case "--sample":
        opts.sample = parsePositiveInt(readArgValue(args, i, flag), flag);
        if (!arg.includes("=")) i += 1;
        break;
      case "--project-id":
      case "--project":
        opts.projectId = readArgValue(args, i, flag);
        if (!arg.includes("=")) i += 1;
        break;
      case "--service-account":
        opts.serviceAccount = readArgValue(args, i, flag);
        if (!arg.includes("=")) i += 1;
        break;
      case "--help":
      case "-h":
        opts.help = true;
        break;
      default:
        throw new Error(`Opcion no reconocida: ${arg}`);
    }
  }

  if (opts.batchSize > 500) {
    throw new Error("--batch-size no puede ser mayor que 500.");
  }

  if (!opts.help && !opts.xlsx) {
    throw new Error("Debes indicar --xlsx <path>.");
  }

  return opts;
}

async function readDefaultProjectId() {
  try {
    const raw = await readFile(path.join(rootDir, ".firebaserc"), "utf8");
    return JSON.parse(raw)?.projects?.default || "";
  } catch {
    return "";
  }
}

async function loadFirebaseAdmin(opts) {
  const { initializeApp, applicationDefault, cert, getApps } =
    functionsRequire("firebase-admin/app");
  const { getFirestore, FieldPath } =
    functionsRequire("firebase-admin/firestore");

  if (!getApps().length) {
    const appOptions = {};
    if (opts.projectId) appOptions.projectId = opts.projectId;

    if (opts.serviceAccount) {
      const serviceAccountPath = path.resolve(rootDir, opts.serviceAccount);
      const raw = await readFile(serviceAccountPath, "utf8");
      appOptions.credential = cert(JSON.parse(raw));
    } else {
      appOptions.credential = applicationDefault();
    }

    initializeApp(appOptions);
  }

  return {
    db: getFirestore(),
    FieldPath,
  };
}

function cellValueToString(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value?.richText)) {
    return value.richText.map((part) => part?.text || "").join("").trim();
  }
  if (value?.result != null) return cellValueToString(value.result);
  if (value?.text != null) return cellValueToString(value.text);
  return String(value).trim();
}

function normalizeHeader(value) {
  return cellValueToString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeFichaKey(value) {
  const text = cellValueToString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

  if (!text) return "";
  if (/^\d+(\.0+)?$/.test(text)) return String(Number.parseInt(text, 10));

  return text.replace(/[\s_-]+/g, "");
}

function titleCaseWord(word, index) {
  if (!word) return word;
  const upper = word.toUpperCase();
  const lower = word.toLocaleLowerCase("es-CR");

  if (ACRONYMS.has(upper)) return upper;
  if (index > 0 && CONNECTOR_WORDS.has(lower)) return lower;

  return `${lower.charAt(0).toLocaleUpperCase("es-CR")}${lower.slice(1)}`;
}

function normalizeArea(value) {
  const text = cellValueToString(value)
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "";

  const normalizedCheck = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "");

  if (["n/a", "na", "noaplica", "ninguna"].includes(normalizedCheck)) {
    return "";
  }

  let wordIndex = 0;
  return text
    .toLocaleLowerCase("es-CR")
    .split(/(\s+|-|\/)/)
    .map((part) => {
      if (!part || /^(\s+|-|\/)$/.test(part)) return part;
      const next = titleCaseWord(part, wordIndex);
      wordIndex += 1;
      return next;
    })
    .join("")
    .trim();
}

function findHeaderColumn(headerRow, candidates) {
  const wanted = new Set(candidates.map(normalizeHeader));

  for (let col = 1; col <= headerRow.cellCount; col += 1) {
    if (wanted.has(normalizeHeader(headerRow.getCell(col).value))) return col;
  }

  return 0;
}

async function readFichaAreaMap(opts) {
  const xlsxPath = path.resolve(rootDir, opts.xlsx);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(xlsxPath);

  const worksheet = opts.sheet
    ? workbook.getWorksheet(opts.sheet)
    : workbook.worksheets[0];

  if (!worksheet) {
    throw new Error(`No se encontro la hoja ${opts.sheet || "(primera hoja)"}.`);
  }

  const headerRow = worksheet.getRow(1);
  const fichaCol = findHeaderColumn(headerRow, [
    "ficha",
    "numeroFicha",
    "numero ficha",
    "num ficha",
  ]);
  const areaCol = findHeaderColumn(headerRow, [
    "area",
    "Area",
    "areaTrabajo",
    "area trabajo",
  ]);

  if (!fichaCol || !areaCol) {
    throw new Error(
      `No pude detectar columnas ficha/Area en ${worksheet.name}. Headers: ${headerRow.values
        .slice(1)
        .map(cellValueToString)
        .join(", ")}`
    );
  }

  const byFicha = new Map();
  const duplicates = [];
  let rows = 0;
  let skippedInvalid = 0;

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const fichaKey = normalizeFichaKey(row.getCell(fichaCol).value);
    const area = normalizeArea(row.getCell(areaCol).value);

    if (!fichaKey || !area) {
      skippedInvalid += 1;
      return;
    }

    rows += 1;
    if (byFicha.has(fichaKey) && byFicha.get(fichaKey).area !== area) {
      duplicates.push({
        ficha: fichaKey,
        first: byFicha.get(fichaKey).area,
        next: area,
        rowNumber,
      });
      return;
    }

    byFicha.set(fichaKey, {
      ficha: fichaKey,
      area,
      rowNumber,
    });
  });

  return {
    worksheetName: worksheet.name,
    byFicha,
    rows,
    skippedInvalid,
    duplicates,
  };
}

function hasAreaTrabajo(value) {
  return cellValueToString(value).length > 0;
}

async function commitBatch(batch, count) {
  if (count === 0) return;
  await batch.commit();
}

async function run() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }

  opts.projectId = opts.projectId || (await readDefaultProjectId());

  const excel = await readFichaAreaMap(opts);

  console.log(`${opts.write ? "WRITE" : "DRY-RUN"} profiles areaTrabajo backfill`);
  console.log(`Project: ${opts.projectId || "(ADC default)"}`);
  console.log(`Excel sheet: ${excel.worksheetName}`);
  console.log(`Fichas validas en Excel: ${excel.byFicha.size}`);
  console.log(`Filas invalidas/sin area: ${excel.skippedInvalid}`);
  console.log(`Duplicados con area distinta: ${excel.duplicates.length}`);
  console.log(`Modo: ${opts.missingOnly ? "solo sin areaTrabajo" : "crear o corregir areaTrabajo"}`);

  if (excel.duplicates.length) {
    for (const item of excel.duplicates.slice(0, opts.sample)) {
      console.log(
        `DUP ${item.ficha}: "${item.first}" vs "${item.next}" en fila ${item.rowNumber}; se conserva el primero.`
      );
    }
  }

  const { db, FieldPath } = await loadFirebaseAdmin(opts);
  const collectionRef = db.collection("profiles");

  let scanned = 0;
  let missingFicha = 0;
  let noExcelMatch = 0;
  let alreadySame = 0;
  let skippedExisting = 0;
  let candidates = 0;
  let written = 0;
  let sampled = 0;
  let stop = false;
  let lastDoc = null;
  let batch = db.batch();
  let batchWrites = 0;

  while (!stop) {
    let query = collectionRef.orderBy(FieldPath.documentId()).limit(opts.pageSize);
    if (lastDoc) query = query.startAfter(lastDoc);

    const snap = await query.get();
    if (snap.empty) break;

    for (const docSnap of snap.docs) {
      scanned += 1;
      const data = docSnap.data() || {};
      const fichaKey = normalizeFichaKey(data.numeroFicha);

      if (!fichaKey) {
        missingFicha += 1;
        continue;
      }

      const match = excel.byFicha.get(fichaKey);
      if (!match) {
        noExcelMatch += 1;
        continue;
      }

      const currentArea = cellValueToString(data.areaTrabajo);
      if (opts.missingOnly && hasAreaTrabajo(currentArea)) {
        skippedExisting += 1;
        continue;
      }

      if (currentArea === match.area) {
        alreadySame += 1;
        continue;
      }

      candidates += 1;
      if (sampled < opts.sample) {
        console.log(
          `${opts.write ? "UPDATE" : "WOULD UPDATE"} ${docSnap.id}: ficha=${fichaKey} areaTrabajo="${currentArea || "(vacio)"}" -> "${match.area}"`
        );
        sampled += 1;
      }

      if (opts.write) {
        batch.update(docSnap.ref, { areaTrabajo: match.area });
        batchWrites += 1;

        if (batchWrites >= opts.batchSize) {
          await commitBatch(batch, batchWrites);
          written += batchWrites;
          batch = db.batch();
          batchWrites = 0;
        }
      }

      if (opts.limit > 0 && candidates >= opts.limit) {
        stop = true;
        break;
      }
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < opts.pageSize) break;
  }

  if (opts.write && batchWrites > 0) {
    await commitBatch(batch, batchWrites);
    written += batchWrites;
  }

  console.log("\nResumen");
  console.log(`Scanned profiles: ${scanned}`);
  console.log(`Sin numeroFicha: ${missingFicha}`);
  console.log(`Sin match en Excel: ${noExcelMatch}`);
  console.log(`Ya tenian areaTrabajo igual: ${alreadySame}`);
  console.log(`Saltados por --missing-only: ${skippedExisting}`);
  console.log(`${opts.write ? "Written" : "Would write"}: ${opts.write ? written : candidates}`);
}

function isCredentialError(err) {
  const msg = String(err?.message || err || "");
  return (
    msg.includes("Could not load the default credentials") ||
    msg.includes("Unable to detect a Project Id") ||
    msg.includes("Could not refresh access token")
  );
}

function printCredentialHelp() {
  console.error(`
No se encontraron credenciales para Firebase Admin.

Opciones para correr el backfill:

1. Usar Application Default Credentials:
   gcloud auth application-default login
   npm run backfill:profiles-area -- --xlsx C:\\ruta\\fichas_areas.xlsx --write

2. Usar un service account JSON:
   npm run backfill:profiles-area -- --xlsx C:\\ruta\\fichas_areas.xlsx --service-account serviceAccountKey.json --write

3. Usar variable de entorno:
   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\\ruta\\service-account.json"
   npm run backfill:profiles-area -- --xlsx C:\\ruta\\fichas_areas.xlsx --write

El service account necesita permisos para leer y actualizar Firestore en el proyecto oloos-bd.
`);
}

run().catch((err) => {
  if (isCredentialError(err)) {
    printCredentialHelp();
  } else {
    console.error(err);
  }
  process.exitCode = 1;
});
