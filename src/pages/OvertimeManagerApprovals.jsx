import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Clock, ShieldCheck } from "lucide-react";
import { auth } from "../firebase";
import {
  Badge,
  Brand,
  Container,
  EmptyState,
  GhostButton,
  Hero,
  Main,
  Shell,
  Topbar,
} from "../components/ui";
import {
  ACCENT,
  BORDER,
  SHADOW_CARD,
  SLATE,
  SURFACE,
  TEXT,
} from "../styles/theme";

export default function OvertimeManagerApprovals() {
  const nav = useNavigate();
  const user = auth.currentUser;

  return (
    <Shell>
      <Topbar>
        <Brand
          icon={ShieldCheck}
          title="Horas Extra"
          subtitle="Validación Gerencia"
          onClick={() => nav("/administracion")}
        />
        <Topbar.Right>
          <Topbar.UserHint title={user?.email || ""}>
            {user?.displayName || user?.email || "Sesión activa"}
          </Topbar.UserHint>
          <GhostButton icon={ArrowLeft} onClick={() => nav("/administracion")}>
            Volver
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container>
          <Hero
            kicker="Gerencia"
            title="Validación de horas extras"
            subtitle="Revisá y validá las horas extra que ya fueron aprobadas por los coordinadores."
            badge={<Badge icon={ShieldCheck}>Gerencia</Badge>}
          />

          <EmptyState
            icon={Clock}
            title="Próximamente"
            description="Este módulo está en construcción. Aquí podrás validar como gerente las horas extra previamente aprobadas por coordinadores."
          />
        </Container>
      </Main>
    </Shell>
  );
}
