import React, { useContext } from "react";
import { useLocation } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { openAssistantModal } from "./assistantBus";
import { AuthCtx } from "../../auth/AuthProvider";
import { ACCENT, ACCENT_SHADOW } from "../../styles/theme";

/**
 * Floating action button (bottom-right) to open the assistant chatbot.
 * Only shows when the user is logged in and not on /login.
 */
export default function FloatingChatButton() {
  const { user, loading } = useContext(AuthCtx) || {};
  const location = useLocation();

  if (location.pathname === "/login") return null;
  if (!user || loading) return null;

  return (
    <button
      type="button"
      onClick={openAssistantModal}
      style={fab}
      title="Asistente AppoloDesk"
      aria-label="Abrir asistente"
    >
      <MessageCircle size={24} strokeWidth={2.2} />
    </button>
  );
}

const fab = {
  position: "fixed",
  bottom: "max(16px, env(safe-area-inset-bottom))",
  right: 16,
  zIndex: 20000,
  width: 52,
  height: 52,
  borderRadius: "50%",
  border: "none",
  background: `linear-gradient(135deg, ${ACCENT} 0%, #06776A 100%)`,
  color: "#fff",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  boxShadow: `0 6px 20px ${ACCENT_SHADOW}, 0 2px 8px rgba(15,23,42,0.12)`,
  transition: "transform 150ms ease, box-shadow 150ms ease",
};
