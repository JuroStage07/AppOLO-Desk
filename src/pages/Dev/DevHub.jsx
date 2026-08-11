import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Code2, Database, KeyRound, Lock, SlidersHorizontal } from "lucide-react";
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

export default function DevHub() {
  const nav = useNavigate();
  const { isPinned, togglePin } = usePinnedModules("dev");

  const go = (path) => nav(path);

  const modules = useMemo(
    () => [
      {
        key: "update-supabase",
        title: "Update AppOLO Supabase",
        desc: "Sincronización y actualización de datos hacia Supabase",
        path: "/dev/update-supabase",
        icon: Database,
        tag: "Sincronización",
      },
      {
        key: "supabase",
        title: "Supabase",
        desc: "Login interno de Supabase (sesión propia con scope por JWT) para Despacho Dev y Registro de salida.",
        path: "/dev/supabase",
        icon: KeyRound,
        tag: "Sesión",
      },
      {
        key: "config-modulos",
        title: "Configuración de módulos",
        desc: "Ajustes y parámetros de los módulos de la plataforma",
        path: "/dev/config-modulos",
        icon: SlidersHorizontal,
        tag: "Configuración",
      },
    ],
    []
  );

  return (
    <Shell>
      <Topbar>
        <Brand
          icon={Code2}
          title="Dev"
          subtitle="Panel de módulos"
          onClick={() => go("/dev")}
        />
        <Topbar.Right>
          <GhostButton icon={ArrowLeft} onClick={() => go("/")}>
            Inicio
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container>
          <Hero
            kicker="Centro de control"
            title="Módulos"
            subtitle="Herramientas internas de desarrollo: migraciones, sincronización y utilidades."
            badge={<Badge icon={Lock}>Desarrollo</Badge>}
            aside={<QuickCard moduleKey="dev" />}
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
