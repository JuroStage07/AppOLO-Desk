import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { businessElapsedMs } from "../src/utils/workTime.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const functionsRequire = createRequire(
  path.join(rootDir, "functions", "package.json")
);

const OT_STATE_FINALIZADA = "Finalizada";
const HOUR_MS = 60 * 60 * 1000;

function printHelp() {
  console.log(`
Backfill tiempoRespuesta en solicitudesOT.

Uso:
  npm run backfill:tiempo-respuesta
  npm run backfill:tiempo-respuesta -- --write

Opciones:
  --write                    Ejecuta escrituras. Sin esto corre en dry-run.
  --finalized-only           Solo procesa OTs con OTState === "Finalizada".
  --include-open             Alias compatible: procesa todos los estados.
  --limit <n>                Maximo de documentos a actualizar/simular.
  --page-size <n>            Documentos leidos por pagina. Default: 500.
  --batch-size <n>           Escrituras por batch. Default: 400.
  --sample <n>               Cuantos ejemplos imprimir. Default: 10.
  --project-id <id>          Firebase project id. Default desde .firebaserc.
  --service-account <path>   JSON de service account. Alternativa a ADC.
  --help                     Muestra esta ayuda.

Credenciales:
  Usa Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS), o:
  npm run backfill:tiempo-respuesta -- --service-account C:\\ruta\\service-account.json --write

Regla de calculo:
  tiempoRespuesta = createdAt -> updatedAt, excluyendo sabados y domingos,
  con el mismo helper src/utils/workTime.js usado por la app.
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
    write: false,
    finalizedOnly: false,
    limit: 0,
    pageSize: 500,
    batchSize: 400,
    sample: 10,
    projectId: "",
    serviceAccount: process.env.FIREBASE_SERVICE_ACCOUNT || "",
    help: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const [flag] = arg.split("=", 1);

    switch (flag) {
      case "--write":
        opts.write = true;
        break;
      case "--dry-run":
        opts.write = false;
        break;
      case "--finalized-only":
        opts.finalizedOnly = true;
        break;
      case "--include-open":
        opts.finalizedOnly = false;
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

function hasTiempoRespuesta(data) {
  return String(data?.tiempoRespuesta ?? "").trim().length > 0;
}

function isFinalizada(data) {
  return String(data?.OTState ?? "").trim() === OT_STATE_FINALIZADA;
}

function timestampToMillis(value) {
  if (!value) return null;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.toDate === "function") {
    const ms = value.toDate()?.getTime?.();
    return Number.isFinite(ms) ? ms : null;
  }
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function formatTiempoRespuestaMs(ms) {
  const totalHours = Math.max(0, Math.floor((Number(ms) || 0) / HOUR_MS));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (days > 0) return `${days} d ${hours} hrs`;
  return `${totalHours} ${totalHours === 1 ? "hr" : "hrs"}`;
}

function buildTiempoRespuesta(data) {
  const startMs = timestampToMillis(data?.createdAt);
  const endMs = timestampToMillis(data?.updatedAt);

  if (startMs == null || endMs == null) {
    return { value: "", reason: "missing-date" };
  }

  if (endMs < startMs) {
    return { value: "", reason: "updated-before-created" };
  }

  return {
    value: formatTiempoRespuestaMs(businessElapsedMs(startMs, endMs)),
    reason: "",
  };
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

  console.log(
    `${opts.write ? "WRITE" : "DRY-RUN"} solicitudesOT tiempoRespuesta backfill`
  );
  console.log(`Project: ${opts.projectId || "(ADC default)"}`);
  console.log(
    `Scope: ${opts.finalizedOnly ? "solo Finalizada" : "todos los estados"}`
  );

  const { db, FieldPath } = await loadFirebaseAdmin(opts);
  const collectionRef = db.collection("solicitudesOT");

  let scanned = 0;
  let alreadyHadValue = 0;
  let skippedState = 0;
  let skippedDates = 0;
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

      if (hasTiempoRespuesta(data)) {
        alreadyHadValue += 1;
        continue;
      }

      if (opts.finalizedOnly && !isFinalizada(data)) {
        skippedState += 1;
        continue;
      }

      const result = buildTiempoRespuesta(data);
      if (!result.value) {
        skippedDates += 1;
        if (sampled < opts.sample) {
          console.log(
            `SKIP ${docSnap.id}: ${result.reason} createdAt=${Boolean(
              data.createdAt
            )} updatedAt=${Boolean(data.updatedAt)}`
          );
          sampled += 1;
        }
        continue;
      }

      candidates += 1;
      if (sampled < opts.sample) {
        console.log(
          `${opts.write ? "UPDATE" : "WOULD UPDATE"} ${docSnap.id}: ${result.value}`
        );
        sampled += 1;
      }

      if (opts.write) {
        batch.update(docSnap.ref, { tiempoRespuesta: result.value });
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
  console.log(`Scanned: ${scanned}`);
  console.log(`Already had tiempoRespuesta: ${alreadyHadValue}`);
  console.log(`Skipped by state: ${skippedState}`);
  console.log(`Skipped by dates: ${skippedDates}`);
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
   npm run backfill:tiempo-respuesta -- --finalized-only --write

2. Usar un service account JSON:
   npm run backfill:tiempo-respuesta -- --service-account C:\\ruta\\service-account.json --finalized-only --write

3. Usar variable de entorno:
   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\\ruta\\service-account.json"
   npm run backfill:tiempo-respuesta -- --finalized-only --write

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
