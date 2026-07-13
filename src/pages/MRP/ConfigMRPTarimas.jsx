// Configuración de módulos › MRP Tarimas (hub de submódulos).
//
// Cada card abre una página independiente de configuración:
//   • Relación de entidades  → bodegas ↔ almacenes del MRP.
//   • Administración de motivos → catálogos de motivos por tipo de movimiento.
import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Boxes, Link2, ListChecks, Lock } from "lucide-react";
import {
  Badge,
  Brand,
  Container,
  GhostButton,
  Hero,
  Main,
  ModuleCard,
  ModuleGrid,
  Shell,
  Topbar,
} from "../../components/ui";

const BASE = "/dev/config-modulos/mrp-tarimas";

export default function ConfigMRPTarimas() {
  const nav = useNavigate();
  const go = (path) => nav(path);

  const modules = useMemo(
    () => [
      {
        key: "entidades",
        title: "Relación de entidades",
        desc: "Ligá cada bodega a un almacén del MRP. La bodega activa resuelve su almacén de trabajo.",
        path: `${BASE}/entidades`,
        icon: Link2,
        tag: "Bodegas ↔ Almacenes",
      },
      {
        key: "motivos",
        title: "Administración de motivos",
        desc: "Definí los motivos que se muestran en los modales según el tipo de movimiento (ajustes y traslados).",
        path: `${BASE}/motivos`,
        icon: ListChecks,
        tag: "Motivos",
      },
    ],
    []
  );

  return (
    <Shell>
      <Topbar>
        <Brand
          icon={Boxes}
          title="Configuración MRP Tarimas"
          subtitle="Panel de submódulos"
          onClick={() => go("/dev/config-modulos")}
        />
        <Topbar.Right>
          <GhostButton icon={ArrowLeft} onClick={() => go("/dev/config-modulos")}>
            Volver
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container>
          <Hero
            kicker="Centro de control"
            title="MRP Tarimas"
            subtitle="Elegí un submódulo para configurar el módulo de tarimas."
            badge={<Badge icon={Lock}>Configuración</Badge>}
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
              />
            ))}
          </ModuleGrid>
        </Container>
      </Main>
    </Shell>
  );
}
