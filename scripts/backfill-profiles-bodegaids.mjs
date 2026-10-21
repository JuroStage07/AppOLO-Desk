import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const functionsRequire = createRequire(path.join(rootDir, "functions", "package.json"));

function printHelp() {
  console.log(`
Backfill profiles/{uid}.bodegaIds: agrega el almacén activo (bodegaId) a la lista de
almacenes asignados de cada usuario.

Desde que el selector de almacén muestra solo los asignados, un usuario sin su
almacén activo en bodegaIds no podría volver a elegirlo. Este backfill SOLO AGREGA:
nunca quita almacenes que ya estén en bodegaIds (los puede usar la app móvil).

Uso:
  npm run backfill:profiles-bodegaids
  npm run backfill:profiles-bodegaids -- --write

Opciones:
  --write                    Ejecuta escrituras. Sin esto corre en dry-run.
  --service-account <path>   JSON de service account. Alternativa a ADC.
  --project-id <id>          Firebase project id. Default desde .firebaserc.
  --help                     Muestra esta ayuda.
`);
}

function parseArgs(args) {
  const opts = { write: false, serviceAccount: "", projectId: "" };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const value = () => {
      const eq = a.indexOf("=");
      if (eq !== -1) return a.slice(eq + 1);
      const next = args[++i];
      if (!next || next.startsWith("--")) throw new Error(`Falta valor para ${a}.`);
      return next;
    };
    if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--write") opts.write = true;
    else if (a.startsWith("--service-account")) opts.serviceAccount = value();
    else if (a.startsWith("--project-id")) opts.projectId = value();
    else throw new Error(`Opción desconocida: ${a}`);
  }
  return opts;
}

async function defaultProjectId() {
  try {
    const rc = JSON.parse(await readFile(path.join(rootDir, ".firebaserc"), "utf8"));
    return rc?.projects?.default || "";
  } catch {
    return "";
  }
}

/** bodegaIds ∪ [bodegaId], preservando el orden existente. Devuelve null si no hay cambios. */
export function mergedBodegaIds(profile) {
  const current = Array.isArray(profile?.bodegaIds) ? profile.bodegaIds.filter(Boolean) : [];
  const active = String(profile?.bodegaId || "").trim();
  if (!active || current.includes(active)) return null;
  return [...current, active];
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) return printHelp();

  const admin = functionsRequire("firebase-admin");
  const projectId = opts.projectId || (await defaultProjectId());
  const credential = opts.serviceAccount
    ? admin.credential.cert(JSON.parse(await readFile(path.resolve(opts.serviceAccount), "utf8")))
    : admin.credential.applicationDefault();
  admin.initializeApp({ credential, projectId });
  const db = admin.firestore();

  const snap = await db.collection("profiles").get();
  const changes = [];
  snap.forEach((d) => {
    const next = mergedBodegaIds(d.data());
    if (next) changes.push({ ref: d.ref, email: d.data().email || d.id, before: d.data().bodegaIds || [], next });
  });

  console.log(`${opts.write ? "WRITE" : "DRY-RUN"} · perfiles: ${snap.size} · a actualizar: ${changes.length}`);
  changes.slice(0, 15).forEach((c) => console.log(`  ${c.email}: ${JSON.stringify(c.before)} -> ${JSON.stringify(c.next)}`));
  if (changes.length > 15) console.log(`  … y ${changes.length - 15} más`);

  if (!opts.write) {
    console.log("\nNo se escribió nada. Corré con --write para aplicar.");
    return;
  }
  for (let i = 0; i < changes.length; i += 400) {
    const batch = db.batch();
    changes.slice(i, i + 400).forEach((c) => batch.update(c.ref, { bodegaIds: c.next }));
    await batch.commit();
  }
  console.log(`Listo: ${changes.length} perfiles actualizados.`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    console.error("ERROR:", e.message);
    process.exit(1);
  });
}
