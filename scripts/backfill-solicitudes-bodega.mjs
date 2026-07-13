import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import {
  getBodegaById,
  getBodegaLabel,
  resolveDefaultBodega,
} from "../src/config/bodegas.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const functionsRequire = createRequire(
  path.join(rootDir, "functions", "package.json")
);

function printHelp() {
  console.log(`
Backfill bodegaId/bodegaNombre en solicitudesOT desde profiles/{createdBy}.

Cada OT hereda la bodega del perfil de quien la creó (profiles/{createdBy}.bodegaId).
Si el creador no tiene bodega y se pasa --fallback-default, se usa la bodega por
defecto del tenant de la OT (primer elemento del catálogo para ese tenant/company).
También completa tenantId/company de la OT desde el perfil si le faltan.

Uso:
  npm run backfill:solicitudes-bodega
  npm run backfill:solicitudes-bodega -- --write

Opciones:
  --write                    Ejecuta escrituras. Sin esto corre en dry-run.
  --missing-only             Solo actualiza OTs sin bodegaId (recomendado). Default: on.
  --overwrite                Reasigna bodega aunque la OT ya tenga una (desactiva missing-only).
  --fallback-default         Si el creador no tiene bodega, usa la default del tenant de la OT.
  --limit <n>                Maximo de documentos a actualizar/simular.
  --page-size <n>            Documentos leidos por pagina. Default: 500.
  --batch-size <n>           Escrituras por batch. Default: 400.
  --sample <n>               Cuantos ejemplos imprimir. Default: 12.
  --project-id <id>          Firebase project id. Default desde .firebaserc.
  --service-account <path>   JSON de service account. Alternativa a ADC.
  --help                     Muestra esta ayuda.
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
    missingOnly: true,
    fallbackDefault: false,
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
      case "--write":
        opts.write = true;
        break;
      case "--dry-run":
        opts.write = false;
        break;
      case "--missing-only":
        opts.missingOnly = true;
        break;
      case "--overwrite":
        opts.missingOnly = false;
        break;
      case "--fallback-default":
        opts.fallbackDefault = true;
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

  return { db: getFirestore(), FieldPath };
}

function cleanText(value) {
  if (value == null) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

async function loadProfiles(db) {
  const snap = await db.collection("profiles").get();
  const out = new Map();
  snap.forEach((docSnap) => {
    const d = docSnap.data() || {};
    out.set(docSnap.id, {
      tenantId: cleanText(d.tenantId),
      company: cleanText(d.company),
      bodegaId: cleanText(d.bodegaId),
      bodegaNombre: cleanText(d.bodegaNombre),
    });
  });
  return out;
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

  console.log(`${opts.write ? "WRITE" : "DRY-RUN"} solicitudesOT bodega backfill`);
  console.log(`Project: ${opts.projectId || "(ADC default)"}`);
  console.log(`Modo: ${opts.missingOnly ? "solo OTs sin bodegaId" : "reasignar (overwrite)"}`);
  console.log(`Fallback default por tenant: ${opts.fallbackDefault ? "si" : "no"}`);

  const { db, FieldPath } = await loadFirebaseAdmin(opts);
  const profiles = await loadProfiles(db);
  console.log(`Profiles leidos: ${profiles.size}`);

  const collectionRef = db.collection("solicitudesOT");

  let scanned = 0;
  let skippedHasBodega = 0;
  let missingCreatedBy = 0;
  let unresolved = 0;
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
      const currentBodega = cleanText(data.bodegaId);

      if (opts.missingOnly && currentBodega) {
        skippedHasBodega += 1;
        continue;
      }

      const createdBy = cleanText(data.createdBy);
      const prof = createdBy ? profiles.get(createdBy) : null;

      // Resolver bodega destino.
      let bodegaId = prof?.bodegaId || "";
      let bodegaNombre = prof?.bodegaNombre || "";

      // tenant/company destino (para el fallback y para completar la OT si faltan).
      const tenantId = cleanText(data.tenantId) || prof?.tenantId || "";
      const company = cleanText(data.company) || prof?.company || "";

      if (!bodegaId && opts.fallbackDefault && tenantId) {
        const def = resolveDefaultBodega(tenantId, company || undefined);
        if (def) {
          bodegaId = def.id;
          bodegaNombre = def.label;
        }
      }

      if (!bodegaId) {
        if (!createdBy) missingCreatedBy += 1;
        unresolved += 1;
        continue;
      }

      // Normaliza el nombre desde el catálogo si el perfil no lo trae.
      if (!bodegaNombre) bodegaNombre = getBodegaLabel(bodegaId);
      // Sanity: si el id no está en el catálogo, igual lo escribimos (respeta el dato existente),
      // pero avisamos.
      if (!getBodegaById(bodegaId)) {
        console.warn(`  aviso: bodegaId "${bodegaId}" no está en el catálogo (OT ${docSnap.id}).`);
      }

      const update = { bodegaId, bodegaNombre };
      if (!cleanText(data.tenantId) && tenantId) update.tenantId = tenantId;
      if (!cleanText(data.company) && company) update.company = company;

      candidates += 1;
      if (sampled < opts.sample) {
        console.log(
          `${opts.write ? "UPDATE" : "WOULD UPDATE"} ${docSnap.id}: createdBy=${createdBy || "(sin)"} -> bodegaId="${bodegaId}" (${bodegaNombre})${update.tenantId ? ` +tenantId=${update.tenantId}` : ""}${update.company ? ` +company=${update.company}` : ""}`
        );
        sampled += 1;
      }

      if (opts.write) {
        batch.update(docSnap.ref, update);
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
  console.log(`Scanned solicitudesOT: ${scanned}`);
  console.log(`Saltados (ya tenían bodegaId): ${skippedHasBodega}`);
  console.log(`Sin resolver bodega (creador sin bodega y sin fallback): ${unresolved}`);
  console.log(`  de ellos sin createdBy: ${missingCreatedBy}`);
  console.log(`${opts.write ? "Written" : "Would write"}: ${opts.write ? written : candidates}`);
  if (!opts.write) {
    console.log("\n(dry-run) Repite con -- --write para aplicar.");
  }
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

1. Application Default Credentials:
   gcloud auth application-default login
   npm run backfill:solicitudes-bodega -- --write

2. Service account JSON:
   npm run backfill:solicitudes-bodega -- --service-account serviceAccountKey.json --write

El service account necesita leer profiles y actualizar solicitudesOT en oloos-bd.
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
