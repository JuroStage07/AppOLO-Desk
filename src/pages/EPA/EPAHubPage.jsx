import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ClipboardList, Lock } from "lucide-react";
import { auth } from "../../firebase";
import {
  Badge,
  Brand,
  Container,
  GhostButton,
  Hero,
  Main,
  ModuleCard,
  ModuleGrid,
  QuickCard,
  Shell,
  Topbar,
} from "../../components/ui";
import usePinnedModules from "../../hooks/usePinnedModules";
import imgEpa from "../../assets/epalogo.jpeg";

export default function EPAHubPage() {
  const nav = useNavigate();
  const user = auth.currentUser;
  const { isPinned, togglePin } = usePinnedModules("epa");

  const go = (path) => nav(path);

  const modules = useMemo(
    () => [
      {
        key: "aperturas-finalizadas",
        title: "Aperturas finalizadas",
        desc: "Historial de aperturas cerradas o completadas para consulta y seguimiento.",
        path: "/epa/aperturas-finalizadas",
        icon: ClipboardList,
        tag: "Historial",
      },
    ],
    []
  );

  return (
    <Shell>
      <Topbar>
        <Brand
          iconNode={<img src={imgEpa} alt="EPA" style={brandImg} />}
          markColor="#EEF2F6"
          title="EPA"
          subtitle="Panel de módulos"
          onClick={() => go("/epa")}
        />
        <Topbar.Right>
          <Topbar.UserBox
            name={user?.displayName || "Usuario"}
            email={user?.email || "—"}
          />
          <GhostButton icon={ArrowLeft} onClick={() => go("/")}>
            Inicio
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container>
          <Hero
            kicker="Centro de control"
            title="Módulos EPA"
            subtitle="Accedé al historial de aperturas finalizadas según tu tarea operativa."
            badge={<Badge icon={Lock}>EPA</Badge>}
            aside={<QuickCard moduleKey="epa" />}
          />

          <ModuleGrid>
            {modules.map((m) => (
              <ModuleCard
                key={m.key}
                title={m.title}
                desc={m.desc}
                icon={m.icon}
                tag={m.tag}
                tone="accent"
                href={m.path}
                onClick={() => go(m.path)}
                pinned={isPinned(m.path)}
                onTogglePin={() => togglePin(m.title, m.path)}
              />
            ))}
          </ModuleGrid>
        </Container>
      </Main>
    </Shell>
  );
}

const brandImg = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  display: "block",
};
