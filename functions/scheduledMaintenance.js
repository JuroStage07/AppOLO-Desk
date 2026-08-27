/**
 * Mantenimiento programado — capa de acceso a datos y orquestación.
 *
 * Toda la lógica de decisión (fechas, ventanas de aviso, destinatarios, IDs
 * determinísticos) vive en `scheduledMaintenanceCore.js`, que es puro y testeado.
 * Acá solo se lee/escribe Firestore.
 *
 * El ciclo hace tres cosas, todas idempotentes:
 *   1. Activación: OT programada en «Solicitada» con deadline vencido → «En proceso».
 *      Desde ahí sigue el flujo normal de OTs (revisión → finalizada).
 *   2. Avisos de proximidad al deadline: 15, 7 y 1 día antes.
 *   3. Resumen mensual de mantenimientos programados.
 *
 * Idempotencia de las notificaciones: el ID del documento es determinístico y se
 * escribe con `create()`, que falla con ALREADY_EXISTS si ya existe. Reejecutar
 * el job no duplica nada.
 */
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const {
  OT_STATE_EN_PROCESO,
  OT_STATE_SOLICITADA,
  buildProfileIndex,
  businessToday,
  safe,
  selectDeadlineAlertTargets,
  selectDueOts,
  selectMonthlySummaryTargets,
} = require("./scheduledMaintenanceCore");

const SOLICITUDES_OT = "solicitudesOT";
const NOTIFICATIONS = "notifications";
const PROFILES = "profiles";

/** Tope de escrituras en paralelo, para no saturar en tenants grandes. */
const WRITE_CONCURRENCY = 20;

/**
 * Todas las OTs programadas. Una sola condición de igualdad: la sirve el índice
 * de campo simple, sin necesidad de índice compuesto. El filtrado por estado y
 * fecha se hace en memoria (el volumen de OTs programadas es bajo).
 */
async function fetchScheduledOts(db) {
  const snap = await db
    .collection(SOLICITUDES_OT)
    .where("scheduledMaintenance", "==", true)
    .get();

  return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
}

/** Carga `profiles` una sola vez por ejecución (no una vez por OT). */
async function loadProfileIndex(db) {
  const snap = await db.collection(PROFILES).get();
  const entries = [];
  snap.forEach((doc) => entries.push({ uid: doc.id, data: doc.data() || {} }));
  return buildProfileIndex(entries);
}

/**
 * Crea la notificación solo si no existe.
 * @returns {Promise<boolean>} true si se creó, false si ya estaba.
 */
async function createNotificationIfAbsent(db, notificationId, data) {
  try {
    await db.collection(NOTIFICATIONS).doc(notificationId).create({
      ...data,
      read: false,
      readAt: null,
      createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (err) {
    // 6 = ALREADY_EXISTS: el aviso ya se emitió en una corrida anterior.
    if (err?.code === 6 || /already exists/i.test(String(err?.message || ""))) {
      return false;
    }
    throw err;
  }
}

/** Ejecuta `worker` sobre `items` en lotes de `WRITE_CONCURRENCY`. */
async function runInChunks(items, worker) {
  let created = 0;
  for (let i = 0; i < items.length; i += WRITE_CONCURRENCY) {
    const slice = items.slice(i, i + WRITE_CONCURRENCY);
    const results = await Promise.all(slice.map(worker));
    created += results.filter(Boolean).length;
  }
  return created;
}

/**
 * Pasa a «En proceso» las OTs programadas cuyo deadline llegó.
 * Transacción para no pisar un cambio de estado hecho a mano en paralelo.
 */
async function activateDueScheduledOts(db, ots, today) {
  const activated = [];

  for (const ot of selectDueOts(ots, today)) {
    const ref = db.collection(SOLICITUDES_OT).doc(ot.id);
    try {
      const changed = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return false;
        const data = snap.data() || {};
        // Alguien pudo moverla a mano entre la lectura inicial y la transacción.
        if (safe(data.OTState) !== OT_STATE_SOLICITADA) return false;
        tx.update(ref, {
          OTState: OT_STATE_EN_PROCESO,
          updatedAt: FieldValue.serverTimestamp(),
          scheduledActivatedAt: FieldValue.serverTimestamp(),
        });
        return true;
      });

      if (changed) {
        // Refleja el nuevo estado en el objeto en memoria para los pasos siguientes.
        ot.OTState = OT_STATE_EN_PROCESO;
        activated.push(ot.id);
      }
    } catch (err) {
      console.error("activateDueScheduledOts", ot.id, err);
    }
  }

  return activated;
}

/**
 * Ciclo completo. Seguro de reejecutar cuantas veces se quiera.
 * @param {{ now?: number, db?: import("firebase-admin/firestore").Firestore }} [options]
 */
async function runScheduledMaintenanceCycle(options = {}) {
  const db = options.db || getFirestore();
  const nowMs = Number(options.now) || Date.now();
  const today = businessToday(nowMs);

  const ots = await fetchScheduledOts(db);
  if (ots.length === 0) {
    return {
      today,
      scheduledOts: 0,
      activated: [],
      deadlineNotifications: 0,
      monthlyNotifications: 0,
    };
  }

  const profiles = await loadProfileIndex(db);

  const activated = await activateDueScheduledOts(db, ots, today);

  const deadlineNotifications = await runInChunks(
    selectDeadlineAlertTargets(ots, profiles, today),
    (target) => createNotificationIfAbsent(db, target.notificationId, target.data)
  );

  const monthlyNotifications = await runInChunks(
    selectMonthlySummaryTargets(ots, profiles, today),
    (target) => createNotificationIfAbsent(db, target.notificationId, target.data)
  );

  return {
    today,
    scheduledOts: ots.length,
    activated,
    deadlineNotifications,
    monthlyNotifications,
  };
}

module.exports = {
  runScheduledMaintenanceCycle,
  // Exportados para pruebas / reutilización puntual.
  activateDueScheduledOts,
  createNotificationIfAbsent,
  fetchScheduledOts,
  loadProfileIndex,
};
