const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
require("dotenv").config();
const nodemailer = require("nodemailer");
const QRCode = require("qrcode");
const sql = require("mssql");
const {
  runScheduledMaintenanceCycle,
} = require("./scheduledMaintenance");
const {
  CatalogInputError,
  buildCatalogOperation,
  describeSupabaseError,
} = require("./orgCatalogCore");
const {
  parseDespachoEventId,
  validateDespachoConsumption,
} = require("./mrpDespachoConsumption");
const {
  UserInputError,
  generateTempPassword,
  normalizeCreateUserInput,
} = require("./userCreateCore");

initializeApp();

let sqlPool;
async function getSqlPool() {
  if (sqlPool?.connected) return sqlPool;
  sqlPool = await sql.connect({
    server: process.env.SQL_SERVER,
    database: process.env.SQL_DATABASE,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    port: Number(process.env.SQL_PORT || 1433),
    options: {
      encrypt: false,
      trustServerCertificate: true,
    },
  });
  return sqlPool;
}

function safe(v) {
  return String(v ?? "").trim();
}

/**
 * Normaliza la fecha de un movimiento enviada por una app externa a ISO 8601.
 * Devuelve `null` si viene vacía o no es una fecha válida, para que la RPC caiga
 * en su comportamiento por defecto (`now()`).
 *
 * @param {string|number|Date|null|undefined} v
 * @returns {string|null}
 */
function safeMovementDate(v) {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseScheduleRange(scheduleRange) {
  if (!scheduleRange) return null;
  const match = String(scheduleRange).match(/(\d{2}:\d{2}).*(\d{2}:\d{2})/);
  if (!match) return null;
  return {
    inTime: match[1],
    outTime: match[2],
  };
}

function formatMinutesToHHMM(totalMinutes) {
  const minutes = Math.max(0, Number(totalMinutes) || 0);
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(restMinutes).padStart(2, "0")}`;
}

function calculateCompanyOvertime({ startEnroll, endEnroll, scheduleRange }) {
  if (!endEnroll || !scheduleRange) {
    return {
      minutes: 0,
      hhmm: "00:00",
      reason: "missing-data",
    };
  }

  const parsedSchedule = parseScheduleRange(scheduleRange);
  if (!parsedSchedule) {
    return {
      minutes: 0,
      hhmm: "00:00",
      reason: "invalid-schedule",
    };
  }

  const endDate = new Date(endEnroll);
  if (Number.isNaN(endDate.getTime())) {
    return {
      minutes: 0,
      hhmm: "00:00",
      reason: "invalid-end-enroll",
    };
  }

  const [outHour, outMinute] = parsedSchedule.outTime.split(":").map(Number);
  const scheduledOutDate = new Date(endDate);
  scheduledOutDate.setUTCHours(outHour, outMinute, 0, 0);

  if (startEnroll) {
    const startDate = new Date(startEnroll);
    if (!Number.isNaN(startDate.getTime()) && scheduledOutDate < startDate) {
      scheduledOutDate.setDate(scheduledOutDate.getDate() + 1);
    }
  }

  const diffMinutes = Math.floor(
    (endDate.getTime() - scheduledOutDate.getTime()) / 60000
  );

  if (diffMinutes <= 30) {
    return {
      minutes: 0,
      hhmm: "00:00",
      reason: "below-threshold",
    };
  }

  return {
    minutes: diffMinutes,
    hhmm: formatMinutesToHHMM(diffMinutes),
    reason: "calculated",
  };
}

function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
}

const DAY_NAMES_ES = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

/** Nombre del día (en español) calculado en UTC para coincidir con el slice ISO de la fecha. */
function getDayNameES(rawDate) {
  if (!rawDate) return null;
  const d = new Date(rawDate);
  if (Number.isNaN(d.getTime())) return null;
  return DAY_NAMES_ES[d.getUTCDay()];
}

/** true si la fecha cae sábado (6) o domingo (0), en UTC. */
function isWeekendDate(rawDate) {
  if (!rawDate) return false;
  const d = new Date(rawDate);
  if (Number.isNaN(d.getTime())) return false;
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * En fin de semana la empresa normalmente no trabaja, así que TODO el tiempo
 * marcado (desde la entrada más temprana hasta la salida más tardía) cuenta
 * como hora extra.
 */
function calculateWeekendOvertime({ startEnroll, endEnroll }) {
  if (!startEnroll || !endEnroll) {
    return { minutes: 0, hhmm: "00:00", reason: "missing-data" };
  }
  const start = new Date(startEnroll);
  const end = new Date(endEnroll);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { minutes: 0, hhmm: "00:00", reason: "invalid-data" };
  }
  let diff = Math.floor((end.getTime() - start.getTime()) / 60000);
  if (diff < 0) diff = 0;
  return {
    minutes: diff,
    hhmm: formatMinutesToHHMM(diff),
    reason: "weekend-all",
  };
}

/**
 * Construye el objeto de registro de horas extra a partir de una fila de la
 * vista, permitiendo sobrescribir entrada/salida/overtime (para consolidar
 * fines de semana).
 */
function buildOvertimeRecord({ row, approval, startEnroll, endEnroll, overtime, isWeekend }) {
  const hasSystemOvertime = Boolean(
    row.strTotalOverTime && String(row.strTotalOverTime).trim()
  );
  return {
    attendanceId: Number(row.id),
    idEmployee: Number(row.idEmployee),
    fullName: row.fullName,
    codeEmployee: row.codeEmployee,
    nameJobPosition: row.nameJobPosition || null,
    date: row._date ? new Date(row._date).toISOString().slice(0, 10) : null,
    dayName: getDayNameES(row._date),
    isWeekend,
    groupId: row.idGroup ? Number(row.idGroup) : null,
    coordinatorName: row.nameGroup || null,
    groupCode: row.codeGroup || null,
    idSchedule: row.idSchedule,
    codeSchedule: row.codeSchedule,
    scheduleName: row.scheduleName,
    scheduleRange: row.InOutStr,
    authorizeOverTime: row.AuthorizeOverTime,
    startEnroll: startEnroll
      ? new Date(startEnroll).toISOString().slice(11, 16)
      : null,
    endEnroll: endEnroll
      ? new Date(endEnroll).toISOString().slice(11, 16)
      : null,
    strTotal: row.strTotal,
    strRealTotal: row.strRealTotal,
    systemOvertime: row.strTotalOverTime || "00:00",
    companyOvertime: overtime.hhmm,
    companyOvertimeMinutes: overtime.minutes,
    companyOvertimeReason: overtime.reason,
    hasCompanyOvertime: overtime.minutes > 0,
    hasSystemOvertime,
    // compatibilidad temporal
    overtime: overtime.hhmm,
    status: approval?.status || "pending",
    decidedByUid: approval?.decidedByUid || null,
    decidedByEmail: approval?.decidedByEmail || null,
    decidedAt: approval?.decidedAt || null,
    note: approval?.note || "",
  };
}

async function getProfileOrThrow(db, uid) {
  const snap = await db.doc(`profiles/${uid}`).get();
  if (!snap.exists) throw new HttpsError("permission-denied", "Perfil no encontrado.");
  return snap.data() || {};
}

function canGestionEquiposFromProfile(p = {}) {
  const role = safe(p.role);
  if (role === "administrativo" || role === "dev") return true;
  return p?.permisos?.mantenimiento === true;
}

function canConsumeTarimasFromProfile(p = {}) {
  const role = safe(p.role);
  if (role === "administrativo" || role === "dev") return true;
  return p?.permisos?.mrpTarimas === true;
}

function canCrossBodegaFromProfile(p = {}) {
  const role = safe(p.role);
  return role === "administrativo" || role === "dev";
}

function getSupabaseConfigOrThrow() {
  const url = safe(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL).replace(/\/+$/, "");
  const key = safe(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY
  );

  if (!url || !key) {
    throw new HttpsError(
      "failed-precondition",
      "Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en Functions."
    );
  }

  return { url, key };
}

/** SELECT vía PostgREST con la clave de servidor. Devuelve un array de filas. */
async function supabaseSelect(table, query) {
  const { url, key } = getSupabaseConfigOrThrow();
  const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new HttpsError("internal", `No se pudo leer ${table} en Supabase (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function callSupabaseRpc(functionName, payload) {
  const { url, key } = getSupabaseConfigOrThrow();
  const res = await fetch(`${url}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const raw = await res.text();
  let body = null;
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = { message: raw };
    }
  }

  if (!res.ok) {
    const msg =
      body?.message ||
      body?.hint ||
      body?.details ||
      `Supabase RPC ${functionName} fallo con HTTP ${res.status}.`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return body;
}

function buildQrEmailHtml({ equipoNombre, codigo }) {
  const title = safe(equipoNombre) || "Equipo";
  const code = safe(codigo) || "—";

  const block = `
    <div style="border:1px solid #E7E9F2;border-radius:16px;padding:18px;margin:0 0 18px 0;font-family:Arial,Helvetica,sans-serif;">
      <div style="font-size:18px;font-weight:800;color:#0F172A;margin:0 0 10px 0;">${title}</div>
      <div style="font-size:22px;font-weight:900;letter-spacing:1px;color:#0F172A;margin:0 0 14px 0;">${code}</div>
      <div style="display:flex;justify-content:center;align-items:center;">
        <img alt="QR ${code}" src="cid:equipoQr" style="width:260px;height:260px;image-rendering:pixelated;border:1px solid #EEF1F7;border-radius:14px;padding:10px;background:#fff;" />
      </div>
    </div>
  `;

  return `
    <div style="background:#FFFFFF;padding:10px;">
      ${block}
      ${block}
    </div>
  `;
}

function makeTransporter() {
  // Env vars (local: functions/.env con dotenv; prod: variables de entorno del servicio)
  // Usamos SMTP_* para evitar choques con secrets/env existentes.
  const user = safe(process.env.SMTP_USER);
  const pass = safe(process.env.SMTP_PASS);
  if (!user || !pass) {
    throw new Error("Faltan credenciales SMTP_USER/SMTP_PASS.");
  }
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });
}

/**
 * Callable: sendEquipoQrLabel
 * data: { equipoId: string, emailTo: string }
 *
 * Env:
 * - GMAIL_USER
 * - GMAIL_PASS  (App Password recomendado)
 */
exports.sendEquipoQrLabel = onCall({ region: "us-central1" }, async (req) => {
  const caller = req.auth;
  if (!caller) throw new HttpsError("unauthenticated", "Debes estar autenticado.");

  const { equipoId, emailTo } = req.data || {};
  const id = safe(equipoId);
  const to = safe(emailTo);

  if (!id) throw new HttpsError("invalid-argument", "Falta equipoId.");
  if (!to || !isValidEmail(to)) {
    throw new HttpsError("invalid-argument", "Correo inválido.");
  }

  const db = getFirestore();
  const me = await getProfileOrThrow(db, caller.uid);
  if (!canGestionEquiposFromProfile(me)) {
    throw new HttpsError("permission-denied", "No tienes permisos de mantenimiento.");
  }

  const tenantId = safe(me.tenantId);
  const company = safe(me.company);
  if (!tenantId || !company) {
    throw new HttpsError(
      "failed-precondition",
      "Tu perfil no tiene tenantId/company."
    );
  }

  const snap = await db.doc(`equipos/${id}`).get();
  if (!snap.exists) throw new HttpsError("not-found", "No existe el equipo.");

  const equipo = snap.data() || {};
  if (safe(equipo.tenantId) !== tenantId || safe(equipo.company) !== company) {
    throw new HttpsError("permission-denied", "Equipo fuera de tu ámbito.");
  }

  const codigo = safe(equipo.codigo);
  if (!codigo) {
    throw new HttpsError("failed-precondition", "El equipo no tiene código.");
  }

  const qrPng = await QRCode.toBuffer(codigo, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 520,
    type: "png",
  });

  const html = buildQrEmailHtml({
    equipoNombre: equipo.equipo,
    codigo,
  });

  const subject = `QR Equipo: ${safe(equipo.equipo) || "Equipo"} (${codigo})`;

  const transporter = makeTransporter();
  await transporter.sendMail({
    from: `"AppOLO" <${safe(process.env.SMTP_USER)}>`,
    to,
    subject,
    html,
    attachments: [
      {
        filename: `qr_${codigo}.png`,
        content: qrPng,
        contentType: "image/png",
        cid: "equipoQr",
      },
    ],
  });

  // (opcional) auditoría simple
  await db.collection("mail_logs").add({
    type: "equipo_qr",
    tenantId,
    company,
    equipoId: id,
    codigo,
    to,
    sentByUid: caller.uid,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { ok: true };
});

/**
 * Callable: consumeTarimasFromExternalApp
 * data: {
 *   externalEventId: string,
 *   bodegaId: string,
 *   articuloCodigo: string,
 *   cantidad: number,
 *   reason?: string,
 *   createdAt?: string   // ISO 8601; fecha REAL del movimiento
 * }
 *
 * Mueve tarimas desde la ubicacion "almacen" hacia "tienda" en el MRP.
 * La idempotencia vive en Supabase por externalEventId.
 *
 * `createdAt` es opcional y existe para que un REINTENTO no fecha el movimiento
 * con la hora del reintento: la app externa manda la hora real en que se hizo el
 * traslado (la del intento que fallo). Si no viene, la RPC usa `now()` como
 * siempre (consumo en vivo).
 */
exports.consumeTarimasFromExternalApp = onCall(
  { region: "us-central1" },
  async (req) => {
    const caller = req.auth;
    if (!caller) {
      throw new HttpsError("unauthenticated", "Debes estar autenticado.");
    }

    const {
      externalEventId,
      bodegaId,
      articuloCodigo,
      cantidad,
      quantity,
      reason,
      tienda,
      tiendaExterna,
      createdAt,
      fechaTraslado,
    } = req.data || {};

    const cleanExternalEventId = safe(externalEventId);
    const cleanBodegaId = safe(bodegaId);
    const cleanArticuloCodigo = safe(articuloCodigo).toUpperCase();
    // Código externo de la tienda destino (p. ej. "T2"). Opcional: si no viene,
    // el consumo queda como "Sin asignar" en el inventario por tienda.
    const cleanTiendaExterna = safe(tiendaExterna ?? tienda) || null;
    // Fecha real del movimiento (ver doc del callable). `null` => la RPC usa now().
    const cleanCreatedAt = safeMovementDate(createdAt ?? fechaTraslado);
    const qty = Number(cantidad ?? quantity);

    if (!cleanExternalEventId) {
      throw new HttpsError("invalid-argument", "Falta externalEventId.");
    }
    if (!cleanBodegaId) {
      throw new HttpsError("invalid-argument", "Falta bodegaId.");
    }
    if (!cleanArticuloCodigo) {
      throw new HttpsError("invalid-argument", "Falta articuloCodigo.");
    }
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new HttpsError(
        "invalid-argument",
        "cantidad debe ser un entero mayor a 0."
      );
    }

    const db = getFirestore();
    const me = await getProfileOrThrow(db, caller.uid);

    const tenantId = safe(me.tenantId);
    const company = safe(me.company);
    if (!tenantId || !company) {
      throw new HttpsError(
        "failed-precondition",
        "Tu perfil no tiene tenantId/company."
      );
    }

    // Lo que finalmente se consume. Con permiso MRP: lo que manda el cliente (como
    // siempre). Sin permiso MRP pero con permiso de Despacho: solo el consumo exacto de
    // un despacho finalizado de su bodega, con cantidades/artículo/tienda tomados del
    // despacho guardado en Supabase (así quien finaliza despachos no necesita acceso
    // al módulo MRP y el consumo queda registrado en el momento).
    let consume = {
      bodegaId: cleanBodegaId,
      articuloCodigo: cleanArticuloCodigo,
      cantidad: qty,
      tiendaExterna: cleanTiendaExterna,
    };
    let viaDespacho = false;

    if (!canConsumeTarimasFromProfile(me)) {
      const parsed = me?.permisos?.despacho === true ? parseDespachoEventId(cleanExternalEventId) : null;
      if (!parsed) {
        throw new HttpsError("permission-denied", "No tienes permisos de MRP Tarimas.");
      }
      const [despacho] = await supabaseSelect(
        "despacho_dev_despachos",
        `id=eq.${parsed.despachoId}&select=id,tenant_id,company,bodega_id,tienda,tarimas_s,tarimas_d,finalized_at,deleted_at`
      );
      const [config] = await supabaseSelect(
        "despacho_dev_mrp_tarimas_config",
        `tenant_id=eq.${encodeURIComponent(tenantId)}&company=eq.${encodeURIComponent(company)}&select=articulo_s,articulo_d`
      );
      const check = validateDespachoConsumption({
        request: { externalEventId: cleanExternalEventId, cantidad: qty },
        profile: me,
        despacho,
        config,
      });
      if (!check.ok) throw new HttpsError(check.code, check.message);
      consume = {
        bodegaId: check.item.bodegaId,
        articuloCodigo: check.item.articuloCodigo,
        cantidad: check.item.cantidad,
        tiendaExterna: check.item.tiendaExterna || cleanTiendaExterna,
      };
      viaDespacho = true;
    } else {
      const profileBodegaId = safe(me.bodegaId);
      if (!canCrossBodegaFromProfile(me) && profileBodegaId !== cleanBodegaId) {
        throw new HttpsError(
          "permission-denied",
          "No puedes consumir tarimas fuera de tu bodega activa."
        );
      }
    }

    const callerEmail = safe(caller.token?.email || me.email);
    const cleanReason =
      safe(reason) || `Consumo app externa: ${cleanExternalEventId}`;

    try {
      const result = await callSupabaseRpc("mrp_consume_tarimas_external", {
        p_tenant_id: tenantId,
        p_company: company,
        p_external_event_id: cleanExternalEventId,
        p_bodega_id: consume.bodegaId,
        p_articulo_codigo: consume.articuloCodigo,
        p_quantity: consume.cantidad,
        p_reason: cleanReason,
        p_user_id: caller.uid,
        p_user_email: callerEmail || null,
        p_tienda_externa: consume.tiendaExterna,
        // Solo se manda cuando hay fecha real: asi el consumo en vivo sigue
        // resolviendo la firma de 10 args aunque la migracion 20260736 (que
        // agrega `p_created_at`) todavia no este aplicada.
        ...(cleanCreatedAt ? { p_created_at: cleanCreatedAt } : {}),
      });

      if (viaDespacho) {
        console.log("consumeTarimasFromExternalApp via despacho", caller.uid, cleanExternalEventId, consume.cantidad);
      }
      return {
        ok: true,
        idempotent: result?.idempotent === true,
        result,
      };
    } catch (error) {
      console.error("consumeTarimasFromExternalApp error:", {
        message: error?.message,
        status: error?.status || null,
        body: error?.body || null,
        externalEventId: cleanExternalEventId,
        bodegaId: cleanBodegaId,
        articuloCodigo: cleanArticuloCodigo,
        createdAt: cleanCreatedAt,
      });

      const msg = error?.message || "No se pudo consumir tarimas.";
      const code =
        /stock insuficiente/i.test(msg) ||
        /no existe/i.test(msg) ||
        /ya fue procesado/i.test(msg)
          ? "failed-precondition"
          : "internal";
      throw new HttpsError(code, msg);
    }
  }
);


exports.testSqlConnection = onCall(async () => {
  try {
    // DEBUG temporal: confirmar que dotenv cargó las vars sin imprimir secretos.
    console.log("[testSqlConnection] env check:", {
      server: process.env.SQL_SERVER,
      database: process.env.SQL_DATABASE,
      user: process.env.SQL_USER,
      passwordLength: (process.env.SQL_PASSWORD || "").length,
      passwordFirst: (process.env.SQL_PASSWORD || "").slice(0, 1),
      passwordLast: (process.env.SQL_PASSWORD || "").slice(-1),
      port: process.env.SQL_PORT,
    });

    const pool = await sql.connect({
      server: process.env.SQL_SERVER,
      database: process.env.SQL_DATABASE,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      port: Number(process.env.SQL_PORT || 1433),
      options: {
        encrypt: false,
        trustServerCertificate: true,
        tdsVersion: "7_4",
      },
    });

    const result = await pool.request().query(`
      USE [Bit2];
      SELECT TOP 20
        id,
        idEmployee,
        fullName,
        codeEmployee,
        nameDepartament,
        nameJobPosition,
        _date,
        startEnroll,
        endEnroll,
        total,
        strTotal,
        realTotalD,
        strRealTotal,
        strTotalOverTime
      FROM dbo.view_calculatedAttendance
      WHERE NULLIF(LTRIM(RTRIM(strTotalOverTime)), '') IS NOT NULL
      ORDER BY _date DESC
    `);

    return {
      ok: true,
      rows: result.recordset,
    };
  } catch (error) {
    console.error("SQL connection error:", error);
    return {
      ok: false,
      message: error.message,
      code: error.code || null,
    };
  }
});

exports.getOvertimeRecords = onCall(async (request) => {
  // TODO: re-enable auth check before deploy
  // if (!request.auth) {
  //   throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  // }

  const db = getFirestore();
  const pool = await getSqlPool();

  // ── Identidad del solicitante (para filtrar por coordinador) ──
  const callerUid = request.auth?.uid || null;
  let callerEmail = safe(request.auth?.token?.email).toLowerCase();
  let callerRole = "";
  if (callerUid) {
    const callerProfileSnap = await db.doc(`profiles/${callerUid}`).get();
    if (callerProfileSnap.exists) {
      const p = callerProfileSnap.data() || {};
      callerRole = safe(p.role).toLowerCase();
      if (!callerEmail) callerEmail = safe(p.email).toLowerCase();
    }
  }
  // Fallback para pruebas locales sin contexto de auth
  if (!callerEmail) callerEmail = safe(request.data?.userEmail).toLowerCase();
  if (!callerRole) callerRole = safe(request.data?.role).toLowerCase();

  // Solo el rol "dev" ve todos los registros sin restricción
  const isUnrestricted = callerRole === "dev";

  const dbCheck = await pool.request().query(`
    SELECT DB_NAME() AS currentDatabase
  `);
  console.log("DATABASE:", dbCheck.recordset[0]);

  const result = await pool.request().query(`
    SELECT TOP 100
      a.id,
      a.idEmployee,
      a.fullName,
      a.codeEmployee,
      a.nameJobPosition,
      a._date,
      a.startEnroll,
      a.endEnroll,
      a.idGroup,
      a.nameGroup,
      a.codeGroup,
      a.idSchedule,
      a.codeSchedule,
      s.name AS scheduleName,
      s.InOutStr,
      s.AuthorizeOverTime,
      a.strTotal,
      a.strRealTotal,
      a.strTotalOverTime
    FROM dbo.view_calculatedAttendance a
    LEFT JOIN dbo.view_schedules s
      ON a.idSchedule = s.id
    WHERE NULLIF(LTRIM(RTRIM(a.strTotalOverTime)), '') IS NOT NULL
       OR (
            ((DATEPART(WEEKDAY, a._date) + @@DATEFIRST) % 7) IN (0, 1)
            AND a.startEnroll IS NOT NULL
            AND a.endEnroll IS NOT NULL
          )
    ORDER BY a._date DESC, a.id DESC
  `);

  const rows = result.recordset;

  // ── Consolidación de marcas ──
  // Entre semana: cada fila es un registro.
  // Fin de semana: puede haber varias marcas en el mismo día para un empleado;
  // se consolidan en un único registro usando la entrada más temprana y la
  // salida más tardía, y todo el tiempo cuenta como hora extra.
  const weekdayRows = [];
  const weekendGroups = new Map(); // key: idEmployee|date -> { rows, minStart, maxEnd }

  for (const row of rows) {
    const dateKey = row._date
      ? new Date(row._date).toISOString().slice(0, 10)
      : "";

    if (!isWeekendDate(row._date)) {
      weekdayRows.push(row);
      continue;
    }

    const key = `${row.idEmployee}|${dateKey}`;
    const start = row.startEnroll ? new Date(row.startEnroll) : null;
    const end = row.endEnroll ? new Date(row.endEnroll) : null;

    if (!weekendGroups.has(key)) {
      weekendGroups.set(key, {
        repRow: row,
        minStart: start,
        maxEnd: end,
        minStartRow: row,
      });
    } else {
      const g = weekendGroups.get(key);
      if (start && (!g.minStart || start < g.minStart)) {
        g.minStart = start;
        g.minStartRow = row;
      }
      if (end && (!g.maxEnd || end > g.maxEnd)) {
        g.maxEnd = end;
      }
    }
  }

  // Fila representativa de cada grupo de fin de semana = la de la entrada más
  // temprana, para que el id de aprobación sea estable.
  const effectiveItems = [
    ...weekdayRows.map((row) => ({
      row,
      isWeekend: false,
      startEnroll: row.startEnroll,
      endEnroll: row.endEnroll,
    })),
    ...Array.from(weekendGroups.values()).map((g) => ({
      row: g.minStartRow,
      isWeekend: true,
      startEnroll: g.minStart ? g.minStart.toISOString() : null,
      endEnroll: g.maxEnd ? g.maxEnd.toISOString() : null,
    })),
  ];

  // ── Mapa coordinador -> email (configurado en OvertimeSettingsHub) ──
  let allowedCoordinatorNames = null; // null = sin restricción
  if (!isUnrestricted) {
    const cfgSnap = await db.doc("appConfig/overtimeCoordinatorEmails").get();
    const stored = cfgSnap.exists ? cfgSnap.data().coordinators || [] : [];
    allowedCoordinatorNames = new Set(
      stored
        .filter((c) => safe(c?.email).toLowerCase() === callerEmail && safe(c?.name))
        .map((c) => safe(c.name))
    );
  }

  const approvalRefs = effectiveItems.map((item) =>
    db.collection("overtimeApprovals").doc(String(item.row.id))
  );

  const approvalsById = {};
  if (approvalRefs.length > 0) {
    const approvalSnaps = await db.getAll(...approvalRefs);
    approvalSnaps.forEach((snap) => {
      if (snap.exists) {
        approvalsById[snap.id] = snap.data();
      }
    });
  }

  const records = effectiveItems.map((item) => {
    const { row, isWeekend, startEnroll, endEnroll } = item;
    const approval = approvalsById[String(row.id)];

    const overtime = isWeekend
      ? calculateWeekendOvertime({ startEnroll, endEnroll })
      : calculateCompanyOvertime({
          startEnroll,
          endEnroll,
          scheduleRange: row.InOutStr,
        });

    return buildOvertimeRecord({
      row,
      approval,
      startEnroll,
      endEnroll,
      overtime,
      isWeekend,
    });
  });

  // ── Restricción por coordinador ──
  // dev ve todo; el resto solo ve los grupos cuyo coordinador tiene su email.
  const visibleRecords = isUnrestricted
    ? records
    : records.filter(
        (r) =>
          r.coordinatorName && allowedCoordinatorNames.has(safe(r.coordinatorName))
      );

  return {
    ok: true,
    records: visibleRecords,
    scope: {
      email: callerEmail || null,
      role: callerRole || null,
      unrestricted: isUnrestricted,
    },
  };
});

exports.decideOvertimeRecord = onCall(async (request) => {
  // Luego reactivamos esto cuando lo probemos desde React con auth
  // if (!request.auth) {
  //   throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  // }

  const {
    attendanceId,
    status,
    note = "",
    record = null,
  } = request.data || {};

  if (!attendanceId) {
    throw new HttpsError("invalid-argument", "attendanceId es requerido.");
  }

  if (!["approved", "rejected"].includes(status)) {
    throw new HttpsError(
      "invalid-argument",
      "status debe ser approved o rejected."
    );
  }

  const db = getFirestore();

  await db
    .collection("overtimeApprovals")
    .doc(String(attendanceId))
    .set(
      {
        attendanceId: Number(attendanceId),
        status,
        note,
        record,
        decidedByUid: request.auth?.uid || "local-test",
        decidedByEmail: request.auth?.token?.email || "local-test",
        decidedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

  return {
    ok: true,
    attendanceId,
    status,
  };
});


/**
 * Callable: getOvertimeCoordinators
 * Lists the distinct coordinators ("nameGroup") found in the Bit2 attendance
 * view, merged with any email already configured in Firestore.
 *
 * Returns: { ok, coordinators: [{ name, email }] }
 */
exports.getOvertimeCoordinators = onCall(async () => {
  const db = getFirestore();
  const pool = await getSqlPool();

  const result = await pool.request().query(`
    SELECT DISTINCT a.nameGroup
    FROM dbo.view_calculatedAttendance a
    WHERE NULLIF(LTRIM(RTRIM(a.nameGroup)), '') IS NOT NULL
    ORDER BY a.nameGroup
  `);

  const names = result.recordset
    .map((r) => safe(r.nameGroup))
    .filter(Boolean);

  const snap = await db.doc("appConfig/overtimeCoordinatorEmails").get();
  const stored = snap.exists ? snap.data().coordinators || [] : [];

  const emailByName = {};
  stored.forEach((c) => {
    if (c && c.name) emailByName[safe(c.name)] = safe(c.email);
  });

  const coordinators = names.map((name) => ({
    name,
    email: emailByName[name] || "",
  }));

  return { ok: true, coordinators };
});

/**
 * Callable: saveCoordinatorEmails
 * Persists the coordinator -> email mapping used later to route/filter
 * overtime approvals.
 *
 * data: { coordinators: [{ name, email }] }
 */
exports.saveCoordinatorEmails = onCall(async (request) => {
  const { coordinators = [] } = request.data || {};
  if (!Array.isArray(coordinators)) {
    throw new HttpsError("invalid-argument", "coordinators debe ser un arreglo.");
  }

  const clean = [];
  for (const c of coordinators) {
    const name = safe(c?.name);
    const email = safe(c?.email);
    if (!name) continue;
    if (email && !isValidEmail(email)) {
      throw new HttpsError(
        "invalid-argument",
        `Correo inválido para ${name}: ${email}`
      );
    }
    clean.push({ name, email });
  }

  const db = getFirestore();
  await db.doc("appConfig/overtimeCoordinatorEmails").set(
    {
      coordinators: clean,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: request.auth?.uid || "local-test",
      updatedByEmail: request.auth?.token?.email || "local-test",
    },
    { merge: true }
  );

  return { ok: true, count: clean.length };
});

/**
 * Mantenimiento programado — ciclo diario.
 *
 * Hace tres cosas, todas idempotentes (ver functions/scheduledMaintenance.js):
 *   1. Activa las OTs programadas cuyo deadline llegó: «Solicitada» → «En proceso».
 *   2. Emite avisos de proximidad al deadline (15, 7 y 1 día).
 *   3. Emite el resumen mensual de mantenimientos programados.
 *
 * Corre en el backend, no en el frontend: las notificaciones y la transición de
 * estado ocurren aunque nadie tenga la app abierta.
 *
 * Requisitos de despliegue: plan Blaze + API de Cloud Scheduler habilitada.
 * La hora es 06:00 en America/Costa_Rica, la misma zona de negocio que usa el
 * cálculo de fechas, para que el "hoy" del job coincida con el del usuario.
 */
exports.scheduledMaintenanceDailyCheck = onSchedule(
  {
    schedule: "0 6 * * *",
    timeZone: "America/Costa_Rica",
    region: "us-central1",
  },
  async () => {
    const summary = await runScheduledMaintenanceCycle();
    console.log("scheduledMaintenanceDailyCheck", JSON.stringify(summary));
    return null;
  }
);

/**
 * Disparo manual del mismo ciclo, para validar sin esperar al cron.
 * Solo admin/dev; recarga el perfil server-side y no confía en el cliente.
 *
 * data: { } (sin parámetros)
 */
exports.runScheduledMaintenanceNow = onCall(
  { region: "us-central1" },
  async (req) => {
    const caller = req.auth;
    if (!caller) throw new HttpsError("unauthenticated", "Debes estar autenticado.");

    const db = getFirestore();
    const profile = await getProfileOrThrow(db, caller.uid);
    const role = safe(profile.role);
    if (role !== "administrativo" && role !== "dev") {
      throw new HttpsError(
        "permission-denied",
        "Solo un usuario administrativo o dev puede ejecutar este proceso."
      );
    }

    const summary = await runScheduledMaintenanceCycle({ db });
    console.log("runScheduledMaintenanceNow", caller.uid, JSON.stringify(summary));
    return { ok: true, ...summary };
  }
);

/**
 * Callable: orgCatalogAdmin
 * data: { entity: "tenant"|"company"|"bodega", action: "create"|"update", data: {...} }
 *
 * Alta/edición del catálogo de países, compañías y almacenes (tablas org_* en
 * Supabase). Solo role = "dev", verificado server-side contra profiles/{uid}.
 * Escribe con la service role: exige SUPABASE_SERVICE_ROLE_KEY (sin caer a la
 * anon key), porque las tablas no tienen políticas de escritura para clientes.
 */
exports.orgCatalogAdmin = onCall({ region: "us-central1" }, async (req) => {
  const caller = req.auth;
  if (!caller) throw new HttpsError("unauthenticated", "Debes estar autenticado.");

  const db = getFirestore();
  const profile = await getProfileOrThrow(db, caller.uid);
  if (safe(profile.role) !== "dev") {
    throw new HttpsError("permission-denied", "Solo un usuario dev puede administrar el catálogo.");
  }

  let op;
  try {
    op = buildCatalogOperation(req.data || {});
  } catch (err) {
    if (err instanceof CatalogInputError) throw new HttpsError("invalid-argument", err.message);
    throw err;
  }

  const url = safe(process.env.SUPABASE_URL).replace(/\/+$/, "");
  const key = safe(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) {
    throw new HttpsError("failed-precondition", "Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Functions.");
  }

  const updatedBy = safe(caller.token?.email || profile.email) || caller.uid;
  const row = { ...op.row, updated_by: updatedBy };
  const endpoint =
    op.action === "create"
      ? `${url}/rest/v1/${op.table}`
      : `${url}/rest/v1/${op.table}?id=eq.${encodeURIComponent(op.id)}`;

  const res = await fetch(endpoint, {
    method: op.action === "create" ? "POST" : "PATCH",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });

  const raw = await res.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = { message: raw };
  }

  if (!res.ok) {
    console.error("orgCatalogAdmin error:", { status: res.status, body, entity: req.data?.entity, id: op.id });
    throw new HttpsError(res.status === 409 ? "already-exists" : "internal", describeSupabaseError(res.status, body));
  }
  if (op.action === "update" && Array.isArray(body) && body.length === 0) {
    throw new HttpsError("not-found", "No existe un registro con ese código.");
  }

  console.log("orgCatalogAdmin", caller.uid, op.table, op.action, op.id);
  return { ok: true, record: Array.isArray(body) ? body[0] : body };
});

/**
 * Callable: adminDeleteUser
 * data: { uid: string, confirmEmail: string }
 *
 * Elimina un USUARIO (no sus registros). Solo role = "dev", verificado server-side.
 *  1. Archiva el perfil completo en profiles_deleted/{uid} (deletedAt/deletedBy) para
 *     poder restaurarlo si fue un error.
 *  2. Borra profiles/{uid} con sus subcolecciones (prefs, pushTokens), los alias de
 *     usernames que apuntan a él y sus pushTokens de la colección raíz.
 *  3. Borra la cuenta de Firebase Authentication: deja de poder entrar a Desk y a la
 *     app móvil (son la misma cuenta).
 * NO toca documentos de negocio (OTs, horas extra, aperturas, marcas…): conservan el
 * nombre y el UID de quien los creó.
 * `confirmEmail` debe coincidir con el correo del usuario, como doble confirmación.
 */
exports.adminDeleteUser = onCall({ region: "us-central1" }, async (req) => {
  const caller = req.auth;
  if (!caller) throw new HttpsError("unauthenticated", "Debes estar autenticado.");

  const db = getFirestore();
  const me = await getProfileOrThrow(db, caller.uid);
  if (safe(me.role) !== "dev") {
    throw new HttpsError("permission-denied", "Solo un usuario dev puede eliminar usuarios.");
  }

  const uid = safe(req.data?.uid);
  if (!uid) throw new HttpsError("invalid-argument", "Falta el usuario a eliminar.");
  if (uid === caller.uid) throw new HttpsError("failed-precondition", "No podés eliminar tu propio usuario.");

  const auth = getAuth();
  const profileRef = db.doc(`profiles/${uid}`);
  const profileSnap = await profileRef.get();
  let authUser = null;
  try {
    authUser = await auth.getUser(uid);
  } catch (e) {
    if (e?.code !== "auth/user-not-found") throw e;
  }
  if (!profileSnap.exists && !authUser) {
    throw new HttpsError("not-found", "Ese usuario no existe.");
  }

  const profile = profileSnap.exists ? profileSnap.data() || {} : {};
  const email = safe(profile.email || authUser?.email).toLowerCase();
  const confirmEmail = safe(req.data?.confirmEmail).toLowerCase();
  if (email && confirmEmail !== email) {
    throw new HttpsError("invalid-argument", "El correo de confirmación no coincide con el del usuario.");
  }
  if (safe(profile.role) === "dev") {
    // Evita dejar la plataforma sin administradores por error.
    const devs = await db.collection("profiles").where("role", "==", "dev").get();
    if (devs.size <= 1) throw new HttpsError("failed-precondition", "No se puede eliminar al último usuario dev.");
  }

  const deletedBy = safe(caller.token?.email || me.email) || caller.uid;

  // 1) Archivo (antes de borrar nada)
  await db.doc(`profiles_deleted/${uid}`).set({
    profile,
    hadProfile: profileSnap.exists,
    auth: authUser
      ? {
          email: authUser.email || null,
          displayName: authUser.displayName || null,
          providers: authUser.providerData.map((p) => p.providerId),
          createdAt: authUser.metadata?.creationTime || null,
          lastSignInAt: authUser.metadata?.lastSignInTime || null,
        }
      : null,
    deletedAt: FieldValue.serverTimestamp(),
    deletedByUid: caller.uid,
    deletedByEmail: deletedBy,
  });

  // 2) Datos de acceso (no de negocio)
  const usernames = await db.collection("usernames").where("uid", "==", uid).get();
  const tokens = await db.collection("pushTokens").where("uid", "==", uid).get().catch(() => null);
  const tokenById = await db.doc(`pushTokens/${uid}`).get();
  const batch = db.batch();
  usernames.forEach((d) => batch.delete(d.ref));
  tokens?.forEach((d) => batch.delete(d.ref));
  if (tokenById.exists) batch.delete(tokenById.ref);
  await batch.commit();
  if (profileSnap.exists) await db.recursiveDelete(profileRef);

  // 3) Cuenta de acceso
  if (authUser) await auth.deleteUser(uid);

  console.log("adminDeleteUser", { by: caller.uid, uid, email, usernames: usernames.size, tokens: tokens?.size || 0 });
  return {
    ok: true,
    uid,
    email: email || null,
    removed: {
      profile: profileSnap.exists,
      authAccount: Boolean(authUser),
      usernames: usernames.size,
      pushTokens: tokens?.size || 0,
    },
  };
});

function buildWelcomeEmailHtml({ displayName, email, link }) {
  const name = safe(displayName) || "Hola";
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#0F172A;max-width:520px;margin:0 auto;">
    <h2 style="margin:0 0 12px 0;">Bienvenido a AppOLO</h2>
    <p style="font-size:14px;line-height:1.5;">${name}, se creó tu usuario <strong>${email}</strong>.</p>
    <p style="font-size:14px;line-height:1.5;">Para empezar, definí tu contraseña con este enlace:</p>
    <p style="margin:20px 0;">
      <a href="${link}" style="background:#089F8A;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:bold;">Crear mi contraseña</a>
    </p>
    <p style="font-size:12px;color:#64748B;line-height:1.5;">Después entrá a https://oloos-bd.web.app con tu correo. Si no esperabas este correo, ignoralo.</p>
  </div>`;
}

/**
 * Callable: adminCreateUser
 * data: { email, displayName, username?, numeroFicha?, role, permisos?, epaAdmin?,
 *         bodegaIds: string[], activeBodegaId?, sendWelcomeEmail? }
 *
 * Alta de un usuario desde Desk. Solo role = "dev", verificado server-side.
 *  - Crea la cuenta de Firebase Authentication con una contraseña temporal (se
 *    devuelve UNA vez para que el dev la comparta).
 *  - Crea profiles/{uid} con rol, permisos, almacenes asignados (bodegaIds) y el
 *    almacén activo; país y compañía se derivan del almacén (catálogo org_bodegas
 *    de Supabase). Crea usernames/{username} para la app móvil.
 *  - Opcional: envía un correo de bienvenida con un enlace para definir contraseña.
 * Si falla la creación del perfil, borra la cuenta recién creada (no queda a medias).
 */
exports.adminCreateUser = onCall({ region: "us-central1" }, async (req) => {
  const caller = req.auth;
  if (!caller) throw new HttpsError("unauthenticated", "Debes estar autenticado.");

  const db = getFirestore();
  const me = await getProfileOrThrow(db, caller.uid);
  if (safe(me.role) !== "dev") {
    throw new HttpsError("permission-denied", "Solo un usuario dev puede crear usuarios.");
  }

  const catalog = await supabaseSelect("org_bodegas", "select=id,tenant_id,company_id,name,active");
  let input;
  try {
    input = normalizeCreateUserInput(req.data || {}, catalog);
  } catch (err) {
    if (err instanceof UserInputError) throw new HttpsError("invalid-argument", err.message);
    throw err;
  }

  const auth = getAuth();
  try {
    await auth.getUserByEmail(input.email);
    throw new HttpsError("already-exists", `Ya existe una cuenta con el correo ${input.email}.`);
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    if (e?.code !== "auth/user-not-found") throw e;
  }
  const usernameRef = db.doc(`usernames/${input.username}`);
  if ((await usernameRef.get()).exists) {
    throw new HttpsError("already-exists", `El usuario "${input.username}" ya está en uso. Elegí otro.`);
  }

  const tempPassword = generateTempPassword();
  const created = await auth.createUser({
    email: input.email,
    password: tempPassword,
    displayName: input.displayName,
    emailVerified: false,
  });
  const createdBy = safe(caller.token?.email || me.email) || caller.uid;

  try {
    const batch = db.batch();
    batch.set(db.doc(`profiles/${created.uid}`), {
      uid: created.uid,
      email: input.email,
      username: input.username,
      displayName: input.displayName,
      nameComplete: input.displayName,
      ...(input.numeroFicha ? { numeroFicha: input.numeroFicha } : {}),
      role: input.role,
      active: true,
      epaAdmin: input.epaAdmin,
      permisos: input.permisos,
      bodegaIds: input.bodegaIds,
      tenantId: input.tenantId,
      company: input.company,
      bodegaId: input.bodegaId,
      bodegaNombre: input.bodegaNombre,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdByUid: caller.uid,
      createdByEmail: createdBy,
      source: "Desk:adminCreateUser",
    });
    batch.set(usernameRef, { uid: created.uid, username: input.username, createdAt: FieldValue.serverTimestamp() });
    await batch.commit();
  } catch (err) {
    console.error("adminCreateUser: fallo el perfil, borro la cuenta", created.uid, err?.message);
    await auth.deleteUser(created.uid).catch(() => {});
    throw new HttpsError("internal", "No se pudo crear el perfil del usuario; no se creó nada.");
  }

  let emailSent = false;
  let emailError = null;
  if (input.sendWelcomeEmail) {
    try {
      const link = await auth.generatePasswordResetLink(input.email);
      await makeTransporter().sendMail({
        from: `"AppOLO" <${safe(process.env.SMTP_USER)}>`,
        to: input.email,
        subject: "Bienvenido a AppOLO: creá tu contraseña",
        html: buildWelcomeEmailHtml({ displayName: input.displayName, email: input.email, link }),
      });
      emailSent = true;
    } catch (err) {
      emailError = err?.message || "No se pudo enviar el correo.";
      console.error("adminCreateUser: correo de bienvenida falló", input.email, emailError);
    }
  }

  console.log("adminCreateUser", { by: caller.uid, uid: created.uid, email: input.email, role: input.role, bodegas: input.bodegaIds });
  return {
    ok: true,
    uid: created.uid,
    email: input.email,
    username: input.username,
    tempPassword,
    bodegaId: input.bodegaId,
    emailSent,
    emailError,
  };
});
