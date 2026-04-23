const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
require("dotenv").config();
const nodemailer = require("nodemailer");
const QRCode = require("qrcode");

initializeApp();

function safe(v) {
  return String(v ?? "").trim();
}

function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
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

