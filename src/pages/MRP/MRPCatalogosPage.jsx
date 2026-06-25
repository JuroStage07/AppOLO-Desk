// MRP Tarimas — Catálogos: marcas, tiendas y almacenes.
//
// Marcas y tiendas se crean SOBRE el almacén de trabajo seleccionado.
// Los almacenes se crean con el tenant/company del usuario logeado.
import React, { useState } from "react";
import { Plus, Warehouse, Box } from "lucide-react";
import {
  Badge,
  Card,
  Field,
  PrimaryButton,
  SecondaryButton,
  GhostButton,
  Sheet,
  Chip,
  ChipsRow,
  StatusPill,
  TableScroll,
  Spinner,
  ErrorState,
  EmptyState,
  SectionTitle,
} from "../../components/ui";
import {
  usePalletWarehouses,
  usePalletArticulos,
  useMrpWorkspace,
} from "../../hooks/mrp";
import { th, td } from "./components/mrpFormat";
import { NoWarehouse } from "./components/WorkspaceBar";

const TABS = [
  { key: "articulos", label: "Artículos", icon: Box },
  { key: "almacenes", label: "Almacenes", icon: Warehouse },
];

export default function MRPCatalogosPage() {
  const [tab, setTab] = useState("articulos");

  return (
    <>
      <SectionTitle
        title="Catálogos"
        action={<Badge tone="accent">Configuración</Badge>}
      />

      <ChipsRow>
        {TABS.map((t) => (
          <Chip key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </Chip>
        ))}
      </ChipsRow>

      {tab === "articulos" && <ArticulosTab />}
      {tab === "almacenes" && <AlmacenesTab />}
    </>
  );
}

function ActiveCell({ active }) {
  return (
    <StatusPill tone={active ? "ok" : "neutral"}>
      {active ? "Activa" : "Inactiva"}
    </StatusPill>
  );
}

/* ------------------------------------------------------------- Artículos */
function ArticulosTab() {
  const { warehouseId } = useMrpWorkspace();
  const {
    articulos,
    loading,
    error,
    refetch,
    create,
    creating,
    setActive,
    peekNextCode,
  } = usePalletArticulos({ includeInactive: true, warehouseId });
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState("");
  const [nextCode, setNextCode] = useState("");
  const [err, setErr] = useState("");

  if (!warehouseId) return <NoWarehouse />;

  const openCreate = async () => {
    setNombre("");
    setErr("");
    setNextCode("");
    setOpen(true);
    try {
      setNextCode(await peekNextCode());
    } catch {
      /* si falla la previsualización, el código igual se asigna al guardar */
    }
  };

  const onCreate = async () => {
    if (!nombre.trim()) {
      setErr("El nombre es obligatorio.");
      return;
    }
    try {
      await create({ nombre, warehouseId });
      setOpen(false);
      setNombre("");
      setErr("");
    } catch {
      /* toast del hook */
    }
  };

  return (
    <>
      <SectionTitle
        title="Artículos del almacén"
        action={
          <PrimaryButton icon={Plus} onClick={openCreate}>
            Nuevo artículo
          </PrimaryButton>
        }
      />
      {loading ? (
        <Spinner label="Cargando artículos…" />
      ) : error ? (
        <ErrorState description={error.message} onRetry={refetch} />
      ) : articulos.length === 0 ? (
        <EmptyState
          icon={Box}
          title="Sin artículos"
          description="Crea el primer artículo de este almacén."
        />
      ) : (
        <Card padding={0}>
          <TableScroll minWidth={560}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Código</th>
                  <th style={th}>Nombre</th>
                  <th style={{ ...th, textAlign: "right" }}>Stock</th>
                  <th style={th}>Estado</th>
                  <th style={{ ...th, textAlign: "right" }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {articulos.map((a) => (
                  <tr key={a.id}>
                    <td style={{ ...td, fontFamily: "monospace", fontWeight: 950 }}>
                      {a.codigo}
                    </td>
                    <td style={td}>{a.nombre}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 950 }}>
                      {a.stock ?? 0}
                    </td>
                    <td style={td}>
                      <ActiveCell active={a.active} />
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <GhostButton size="sm" onClick={() => setActive(a.id, !a.active)}>
                        {a.active ? "Desactivar" : "Activar"}
                      </GhostButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </Card>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Nuevo artículo"
        maxWidth={460}
      >
        <Sheet.Body>
          <Field label="Código" hint="Se asigna automáticamente al guardar.">
            <Field.Input value={nextCode || "Calculando…"} disabled readOnly />
          </Field>
          <Field label="Nombre del artículo" required error={err}>
            <Field.Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Artículo X"
              autoFocus
            />
          </Field>
        </Sheet.Body>
        <Sheet.Actions>
          <SecondaryButton onClick={() => setOpen(false)} disabled={creating}>
            Cancelar
          </SecondaryButton>
          <PrimaryButton onClick={onCreate} loading={creating}>
            Crear
          </PrimaryButton>
        </Sheet.Actions>
      </Sheet>
    </>
  );
}

/* ------------------------------------------------------------ Almacenes */
function AlmacenesTab() {
  const { warehouses, loading, error, refetch, create, creating, setActive } =
    usePalletWarehouses({ includeInactive: true });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", code: "" });
  const [errs, setErrs] = useState({});

  const onCreate = async () => {
    const e = {};
    if (!form.name.trim()) e.name = "Requerido.";
    setErrs(e);
    if (Object.keys(e).length) return;
    try {
      await create(form);
      setOpen(false);
      setForm({ name: "", code: "" });
      setErrs({});
    } catch {
      /* toast del hook */
    }
  };

  return (
    <>
      <SectionTitle
        title="Almacenes"
        action={
          <PrimaryButton icon={Plus} onClick={() => setOpen(true)}>
            Nuevo almacén
          </PrimaryButton>
        }
      />
      {loading ? (
        <Spinner label="Cargando almacenes…" />
      ) : error ? (
        <ErrorState description={error.message} onRetry={refetch} />
      ) : warehouses.length === 0 ? (
        <EmptyState
          icon={Warehouse}
          title="Sin almacenes"
          description="Crea el primer almacén."
        />
      ) : (
        <Card padding={0}>
          <TableScroll minWidth={520}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Nombre</th>
                  <th style={th}>Código</th>
                  <th style={th}>Estado</th>
                  <th style={{ ...th, textAlign: "right" }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {warehouses.map((w) => (
                  <tr key={w.id}>
                    <td style={td}>{w.name}</td>
                    <td style={td}>{w.code || "—"}</td>
                    <td style={td}>
                      <ActiveCell active={w.active} />
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <GhostButton size="sm" onClick={() => setActive(w.id, !w.active)}>
                        {w.active ? "Desactivar" : "Activar"}
                      </GhostButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </Card>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title="Nuevo almacén" maxWidth={460}>
        <Sheet.Body>
          <Field label="Nombre del almacén" required error={errs.name}>
            <Field.Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ej: Almacén Central"
              autoFocus
            />
          </Field>
          <Field label="Código (opcional)">
            <Field.Input
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="Ej: AC1"
            />
          </Field>
        </Sheet.Body>
        <Sheet.Actions>
          <SecondaryButton onClick={() => setOpen(false)} disabled={creating}>
            Cancelar
          </SecondaryButton>
          <PrimaryButton onClick={onCreate} loading={creating}>
            Crear
          </PrimaryButton>
        </Sheet.Actions>
      </Sheet>
    </>
  );
}
