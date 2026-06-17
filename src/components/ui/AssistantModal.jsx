import React, { useContext, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Check, Copy, Send, Trash2, X } from "lucide-react";
import { AuthCtx } from "../../auth/AuthProvider";
import { auth } from "../../firebase";
import { OPEN_ASSISTANT_EVENT } from "./assistantBus";
import {
  ACCENT,
  ACCENT_SHADOW,
  accentAlpha,
  BORDER,
  FONT_STACK,
  MUTED,
  SLATE_DEEP,
  SURFACE,
  SURFACE_INSET,
  TEXT,
  BG,
} from "../../styles/theme";
import imgApolo from "../../assets/Apolo.png";

/* ─── Design tokens ─── */
const T = {
  accent: ACCENT,
  accentDark: "#06776A",
  accentSoft: accentAlpha(0.1),
  accentGlow: ACCENT_SHADOW,
  bg: BG,
  surface: SURFACE,
  surfaceAlt: SURFACE_INSET,
  border: BORDER,
  borderSoft: "rgba(226, 232, 240, 0.7)",
  text: TEXT,
  textSecondary: SLATE_DEEP,
  textMuted: MUTED,
  shadow: "0 1px 2px rgba(15,23,42,0.04), 0 6px 16px rgba(15,23,42,0.05)",
  shadowLg: "0 8px 24px rgba(15,23,42,0.08), 0 20px 60px rgba(15,23,42,0.12)",
  font: FONT_STACK,
};

/* ─── Assistant config ─── */
const ASSISTANT_INTRO =
  "Hola, soy el asistente de AppoloDesk. Puedo ayudarte a consultar módulos, procesos y funcionamiento del sistema.";
const ASSISTANT_MOCK_REPLY =
  "Todavía estoy en modo de prueba. En el siguiente paso me conectaremos a n8n para responder con la documentación real de AppoloDesk.";
const ASSISTANT_SUGGESTIONS = [
  "¿Cómo uso las áreas?",
  "¿Qué puedo hacer en mantenimiento?",
  "¿Dónde veo reportes?",
  "Explicame el flujo general",
];
const ASSISTANT_WEBHOOK_URL = import.meta.env.VITE_ASSISTANT_WEBHOOK_URL;
const ASSISTANT_TIMEOUT_MS = 60000;
const ASSISTANT_ERROR_REPLY =
  "No pude conectar con el asistente en este momento. Podés intentar de nuevo en unos segundos.";
const ASSISTANT_TIMEOUT_REPLY =
  "El asistente tardó más de lo esperado en responder. Intentá de nuevo en unos segundos o hacé una pregunta más corta.";

function newConversationId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* ignore */ }
  return `conv-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/**
 * Global assistant chatbot modal. Self-contained: manages its own messages,
 * typing state, and n8n webhook integration. Opens via the assistantBus event
 * or programmatically. Mount once at the app root (alongside CircleMenu).
 */
export default function AssistantModal() {
  const nav = useNavigate();
  const location = useLocation();
  const { profile, role, permisos, epaAdmin, user: ctxUser } = useContext(AuthCtx) || {};
  const user = ctxUser ?? auth.currentUser;

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{ role: "assistant", text: ASSISTANT_INTRO }]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [convId, setConvId] = useState(() => newConversationId());
  const timers = useRef([]);
  const scrollRef = useRef(null);
  const taRef = useRef(null);
  const [hoveredMsg, setHoveredMsg] = useState(null);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const copyTimer = useRef(null);

  // Listen for the open event
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(OPEN_ASSISTANT_EVENT, handler);
    return () => window.removeEventListener(OPEN_ASSISTANT_EVENT, handler);
  }, []);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  // Focus input on open
  useEffect(() => {
    if (open && !typing && taRef.current) {
      setTimeout(() => taRef.current?.focus(), 50);
    }
  }, [open, typing]);

  // Cleanup timers on unmount
  useEffect(() => () => {
    timers.current.forEach((t) => clearTimeout(t));
    clearTimeout(copyTimer.current);
  }, []);

  if (!open || !user) return null;

  const close = () => setOpen(false);

  const clearChat = () => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
    setTyping(false);
    setInput("");
    setMessages([{ role: "assistant", text: ASSISTANT_INTRO }]);
    setConvId(newConversationId());
  };

  const copyMsg = (i, text) => {
    const value = (text || "").trim();
    if (!value) return;
    try { navigator.clipboard?.writeText(value); } catch { /* */ }
    setCopiedIdx(i);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopiedIdx(null), 1200);
  };

  const canSend = input.trim().length > 0 && !typing;

  const sendMessage = (text) => {
    const clean = (text || "").trim();
    if (!clean) return;

    const userMsg = { role: "user", text: clean };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setTyping(true);

    if (!ASSISTANT_WEBHOOK_URL) {
      const t = setTimeout(() => {
        setTyping(false);
        setMessages((prev) => [...prev, { role: "assistant", text: ASSISTANT_MOCK_REPLY }]);
      }, 900);
      timers.current.push(t);
      return;
    }

    const history = [...messages, userMsg]
      .slice(-12)
      .map((m) => ({ role: m.role, text: m.text }));

    const payload = {
      userMessage: clean,
      userId: user?.uid || null,
      tenantId: profile?.tenantId || null,
      company: profile?.company || null,
      role: role || null,
      permisos: permisos || {},
      epaAdmin: !!epaAdmin,
      currentRoute: location.pathname,
      conversationId: convId,
      history,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ASSISTANT_TIMEOUT_MS);
    timers.current.push(timeoutId);

    fetch(ASSISTANT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((raw) => {
        clearTimeout(timeoutId);
        const data = Array.isArray(raw) ? raw[0] || {} : raw || {};
        const answer =
          typeof data.answer === "string" && data.answer.trim()
            ? data.answer.trim()
            : "Recibí tu mensaje, pero no obtuve una respuesta válida.";
        const suggestedActions = Array.isArray(data.suggestedActions) ? data.suggestedActions : [];
        setTyping(false);
        setMessages((prev) => [...prev, { role: "assistant", text: answer, suggestedActions }]);
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        setTyping(false);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: err?.name === "AbortError" ? ASSISTANT_TIMEOUT_REPLY : ASSISTANT_ERROR_REPLY },
        ]);
      });
  };

  const submit = () => { if (canSend) sendMessage(input.trim()); };
  const onKeyDown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } };
  const showSuggestions = messages.length <= 1;

  return (
    <div style={S.root}>
      <style>{cssAnim}</style>
      <button type="button" aria-label="Cerrar" onClick={close} style={S.backdrop} />

      <div role="dialog" aria-modal="true" aria-label="Asistente AppoloDesk" style={S.chat}>
        {/* Header */}
        <div style={S.chatHeader}>
          <div style={S.chatHeaderLeft}>
            <span style={S.chatHeaderIcon}>
              <img src={imgApolo} alt="" style={{ width: "78%", height: "78%", objectFit: "contain" }} draggable={false} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={S.chatTitle}>Asistente AppoloDesk</div>
              <div style={S.chatSubtitle}>Consultá procesos, módulos y funcionamiento</div>
            </div>
          </div>
          <div style={S.chatHeaderActions}>
            <button
              type="button"
              onClick={clearChat}
              disabled={messages.length <= 1 && !typing}
              aria-label="Limpiar chat"
              title="Limpiar chat"
              style={{ ...S.chatClose, opacity: messages.length <= 1 && !typing ? 0.45 : 1, cursor: messages.length <= 1 && !typing ? "not-allowed" : "pointer" }}
            >
              <Trash2 size={17} strokeWidth={2.2} />
            </button>
            <button type="button" onClick={close} aria-label="Cerrar asistente" style={S.chatClose}>
              <X size={18} strokeWidth={2.4} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} style={S.chatBody}>
          {messages.map((m, i) => {
            const isUser = m.role === "user";
            const actions = !isUser && Array.isArray(m.suggestedActions) ? m.suggestedActions.filter((a) => a && a.path) : [];
            return (
              <div
                key={i}
                onMouseEnter={() => setHoveredMsg(i)}
                onMouseLeave={() => setHoveredMsg((cur) => (cur === i ? null : cur))}
                style={{ ...S.msgRow, justifyContent: isUser ? "flex-end" : "flex-start", animation: "amMsgIn 280ms cubic-bezier(0.22,1,0.36,1) both" }}
              >
                {!isUser && (
                  <span style={S.msgAvatar}>
                    <img src={imgApolo} alt="" style={{ width: "78%", height: "78%", objectFit: "contain" }} draggable={false} />
                  </span>
                )}
                <div style={{ ...S.msgCol, alignItems: isUser ? "flex-end" : "flex-start" }}>
                  <div style={S.bubbleWrap}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => copyMsg(i, m.text)}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && copyMsg(i, m.text)}
                      title="Copiar mensaje"
                      style={{ ...(isUser ? S.bubbleUser : S.bubbleBot), cursor: "pointer" }}
                    >
                      {m.text}
                    </div>
                    <button
                      type="button"
                      onClick={() => copyMsg(i, m.text)}
                      aria-label="Copiar"
                      style={{ ...S.copyBtn, ...(isUser ? S.copyBtnUser : S.copyBtnBot), opacity: hoveredMsg === i ? 1 : 0, pointerEvents: hoveredMsg === i ? "auto" : "none" }}
                    >
                      {copiedIdx === i ? <Check size={13} strokeWidth={2.6} /> : <Copy size={13} strokeWidth={2.2} />}
                    </button>
                  </div>
                  {actions.length > 0 && (
                    <div style={S.msgActions}>
                      {actions.map((a, idx) => (
                        <button key={idx} type="button" onClick={() => { close(); nav(a.path); }} style={S.msgActionChip}>
                          {a.label || a.path}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {typing && (
            <div style={{ ...S.msgRow, justifyContent: "flex-start" }}>
              <span style={S.msgAvatar}>
                <img src={imgApolo} alt="" style={{ width: "80%", height: "80%", objectFit: "contain" }} draggable={false} />
              </span>
              <div style={S.typingBubble}>
                <span style={{ ...S.typingDot, animationDelay: "0ms" }} />
                <span style={{ ...S.typingDot, animationDelay: "150ms" }} />
                <span style={{ ...S.typingDot, animationDelay: "300ms" }} />
              </div>
            </div>
          )}

          {showSuggestions && (
            <div style={S.suggWrap}>
              <div style={S.suggLabel}>Sugerencias</div>
              <div style={S.suggRow}>
                {ASSISTANT_SUGGESTIONS.map((s) => (
                  <button key={s} type="button" className="am-sugg" onClick={() => sendMessage(s)} style={S.suggChip}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div style={S.chatInputBar}>
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Escribí tu consulta…"
            style={S.chatTextarea}
            aria-label="Mensaje para el asistente"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            aria-label="Enviar mensaje"
            style={{ ...S.chatSend, opacity: canSend ? 1 : 0.45, cursor: canSend ? "pointer" : "not-allowed" }}
          >
            <Send size={30} strokeWidth={2.2} style={{ width: 30, height: 30 }} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Animations ─── */
const cssAnim = `
  @keyframes amFadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes amChatIn { from { opacity: 0; transform: translateY(16px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes amMsgIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes amTyping { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-3px); opacity: 1; } }
  .am-sugg:hover { border-color: ${ACCENT} !important; color: ${ACCENT} !important; background: ${accentAlpha(0.08)} !important; }
`;

/* ─── Styles ─── */
const S = {
  root: {
    position: "fixed",
    inset: 0,
    zIndex: 31000,
    display: "grid",
    placeItems: "center",
    fontFamily: T.font,
    animation: "amFadeIn 180ms ease",
  },
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.55)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
    border: "none",
    cursor: "pointer",
  },
  chat: {
    position: "relative",
    width: "min(760px, 96vw)",
    height: "min(700px, calc(100vh - 80px))",
    display: "flex",
    flexDirection: "column",
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: 20,
    boxShadow: T.shadowLg,
    overflow: "hidden",
    animation: "amChatIn 320ms cubic-bezier(0.22,1,0.36,1)",
  },
  chatHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "14px 16px",
    borderBottom: `1px solid ${T.borderSoft}`,
    background: `linear-gradient(135deg, ${T.accentSoft} 0%, #fff 70%)`,
    flexShrink: 0,
  },
  chatHeaderLeft: { display: "flex", alignItems: "center", gap: 11, minWidth: 0 },
  chatHeaderActions: { display: "flex", alignItems: "center", gap: 8, flexShrink: 0 },
  chatHeaderIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    background: `linear-gradient(135deg, ${T.accent} 0%, ${T.accentDark} 100%)`,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    boxShadow: `0 4px 14px ${T.accentGlow}`,
  },
  chatTitle: { fontSize: 15, fontWeight: 800, color: T.text, letterSpacing: -0.3, lineHeight: 1.2 },
  chatSubtitle: { fontSize: 12, fontWeight: 500, color: T.textMuted, lineHeight: 1.25, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  chatClose: {
    width: 36, height: 36, borderRadius: 10, border: `1px solid ${T.border}`,
    background: T.surface, display: "grid", placeItems: "center", cursor: "pointer",
    color: T.textSecondary, flexShrink: 0, padding: 0,
  },
  chatBody: {
    flex: 1, minHeight: 0, overflowY: "auto", padding: "20px 18px",
    display: "flex", flexDirection: "column", gap: 24,
    background: `radial-gradient(900px 320px at 50% -40px, ${T.accentSoft} 0%, transparent 70%), ${T.bg}`,
  },
  msgRow: { display: "flex", alignItems: "flex-start", gap: 9, width: "100%" },
  msgCol: { display: "flex", flexDirection: "column", gap: 6, maxWidth: "84%", minWidth: 0 },
  bubbleWrap: { position: "relative", width: "fit-content", maxWidth: "100%" },
  copyBtn: {
    position: "absolute", top: "calc(100% + 4px)", width: 24, height: 24, borderRadius: 8,
    border: `1px solid ${T.border}`, background: T.surface, color: T.textSecondary,
    display: "grid", placeItems: "center", cursor: "pointer", padding: 0,
    boxShadow: T.shadow, transition: "opacity 150ms ease",
  },
  copyBtnBot: { left: 0 },
  copyBtnUser: { right: 0 },
  msgActions: { display: "flex", flexWrap: "wrap", gap: 6 },
  msgActionChip: {
    padding: "7px 12px", borderRadius: 999, border: `1px solid ${T.accent}`,
    background: T.accentSoft, color: T.accentDark, fontSize: 12, fontWeight: 700,
    cursor: "pointer", fontFamily: "inherit", transition: "filter 150ms ease",
  },
  msgAvatar: {
    width: 32, height: 32, borderRadius: 999,
    background: `linear-gradient(135deg, ${T.accent} 0%, ${T.accentDark} 100%)`,
    display: "grid", placeItems: "center", flexShrink: 0, marginTop: 2,
    border: "2px solid #fff", boxShadow: `0 4px 12px ${T.accentGlow}`,
  },
  bubbleBot: {
    width: "fit-content", maxWidth: "100%", padding: "11px 15px",
    borderRadius: "6px 18px 18px 18px", background: T.surface,
    border: `1px solid ${T.border}`, color: T.text, fontSize: 14, fontWeight: 500,
    lineHeight: 1.55, boxShadow: "0 2px 8px rgba(15,23,42,0.05)",
    whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "anywhere",
  },
  bubbleUser: {
    width: "fit-content", maxWidth: "100%", padding: "11px 15px",
    borderRadius: "18px 6px 18px 18px",
    background: `linear-gradient(135deg, ${T.accent} 0%, ${T.accentDark} 100%)`,
    color: "#fff", fontSize: 14, fontWeight: 500, lineHeight: 1.55,
    boxShadow: `0 6px 16px ${T.accentGlow}`,
    whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "anywhere",
  },
  typingBubble: {
    display: "inline-flex", alignItems: "center", gap: 5, padding: "13px 15px",
    borderRadius: "6px 18px 18px 18px", background: T.surface,
    border: `1px solid ${T.border}`, boxShadow: "0 2px 8px rgba(15,23,42,0.05)",
  },
  typingDot: {
    width: 7, height: 7, borderRadius: 999, background: T.textMuted,
    display: "inline-block", animation: "amTyping 1s ease-in-out infinite",
  },
  suggWrap: { marginTop: 4, display: "grid", gap: 8 },
  suggLabel: { fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.4, paddingLeft: 2 },
  suggRow: { display: "flex", flexWrap: "wrap", gap: 8 },
  suggChip: {
    padding: "8px 14px", borderRadius: 999, border: `1px solid ${T.border}`,
    background: T.surface, color: T.textSecondary, fontSize: 12.5, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit", boxShadow: T.shadow,
    transition: "border-color 150ms ease, color 150ms ease",
  },
  chatInputBar: {
    display: "flex", alignItems: "flex-end", gap: 10, padding: "12px 14px",
    borderTop: `1px solid ${T.borderSoft}`, background: T.surface, flexShrink: 0,
  },
  chatTextarea: {
    flex: 1, minWidth: 0, maxHeight: 120, resize: "none",
    border: `1px solid ${T.border}`, borderRadius: 14, padding: "11px 14px",
    fontSize: 14, fontWeight: 500, fontFamily: "inherit", color: T.text,
    outline: "none", background: T.bg, lineHeight: 1.45,
  },
  chatSend: {
    width: 52, height: 52, borderRadius: 15, border: "none",
    background: `linear-gradient(135deg, ${T.accent} 0%, ${T.accentDark} 100%)`,
    color: "#fff", display: "grid", placeItems: "center", flexShrink: 0,
    fontFamily: "inherit", boxShadow: `0 6px 18px ${T.accentGlow}`,
    transition: "opacity 150ms ease",
  },
};
