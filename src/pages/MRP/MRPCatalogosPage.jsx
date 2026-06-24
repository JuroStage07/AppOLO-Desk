// MRP Tarimas — Catálogos: marcas, tiendas y almacenes.
//
// Marcas y tiendas se crean SOBRE el almacén de trabajo seleccionado.
// Los almacenes se crean con el tenant/company del usuario logeado.
import React, { useState } from "react";
import { Plus, Tag, Store, Warehouse } from "lucide-react";
import {
  Shell,
  Topbar,
  Main,
  Container,
  Hero,
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
  usePalletBrands,
  usePalletStores,
  usePalletWarehouses,
  useMrpWorkspace,
} from "../../hooks/mrp";
import { th, td } from "./components/mrpFormat";
import WorkspaceBar, { NoWarehouse } from "./components/WorkspaceBar";

const TABS = [
  { key: "marcas", label: "Marcas", icon: Tag },
  { key: "tiendas", label: "Tiendas", icon: Store },
  { key: "almacenes", label: "Almacenes", icon: Warehouse },
];

export default function MRPCatalogosPage() {
  const [tab, setTab] = useState("marcas");

  return (
    <Shell>
      <Topbar />
      <Main>
        <Container>
          <Hero
            kicker="MRP Tarimas"
            title="Catálogos"
            subtitle="Marcas y tiendas se crean sobre el almacén de trabajo; los almacenes son la base del módulo."
            badge={<Badge tone="accent">Configuración</Badge>}
          />

          <WorkspaceBar />

          <ChipsRow>
            {TABS.map((t) => (
              <Chip key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>
                {t.label}
              </Chip>
            ))}
          </ChipsRow>

          {tab === "marcas" && <MarcasTab />}
          {tab === "tiendas" && <TiendasTab />}
          {tab === "almacenes" && <AlmacenesTab />}
        </Container>
      </Main>
    </Shell>
  );
}

function ActiveCell({ active }) {
  return (
    <StatusPill tone={active ? "ok" : "neutral"}>
      {active ? "Activa" : "Inactiva"}
    </StatusPill>
  );
}

/* --------------------------------------------------------------- Marcas */
function MarcasTab() {
  const { warehouseId } = useMrpWorkspace();
  const { brands, loading, error, refetch, create, creating, setActive } =
    usePalletBrands({ includeInactive: true, warehouseId });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");

  if (!warehouseId) return <NoWarehouse />;

  const onCreate = async () => {
    if (!name.trim()) {
      setErr("El nombre es obligatorio.");
      return;
    }
    try {
      await create({ name, warehouseId });
      setOpen(false);
      setName("");
      setErr("");
    } catch {
      /* toast del hook */
    }
  };

  return (
    <>
      <SectionTitle
        title="Marcas del almacén"
        action={
          <PrimaryButton icon={Plus} onClick={() => setOpen(true)}>
            Nueva marca
          </PrimaryButton>
        }
      />
      {loading ? (
        <Spinner label="Cargando marcas…" />
      ) : error ? (
        <ErrorState description={error.message} onRetry={refetch} />
      ) : brands.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="Sin marcas"
          description="Crea la primera marca de este almacén."
        />
      ) : (
        <Card padding={0}>
          <TableScroll minWidth={420}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Marca</th>
                  <th style={th}>Estado</th>
                  <th style={{ ...th, textAlign: "right" }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {brands.map((b) => (
                  <tr key={b.id}>
                    <td style={td}>{b.name}</td>
                    <td style={td}>
                      <ActiveCell active={b.active} />
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <GhostButton size="sm" onClick={() => setActive(b.id, !b.active)}>
                        {b.active ? "Desactivar" : "Activar"}
                      </GhostButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </Card>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title="Nueva marca" maxWidth={460}>
        <Sheet.Body>
          <Field label="Nombre de marca" required error={err}>
            <Field.Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Marca X"
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

/* -------------------------------------------------------------- Tiendas */
function TiendasTab() {
  const { warehouseId } = useMrpWorkspace();
  const { stores, loading, error, refetch, create, creating, setActive } =
    usePalletStores({ includeInactive: true, warehouseId });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ storeNumber: "", name: "" });
  const [errs, setErrs] = useState({});

  if (!warehouseId) return <NoWarehouse />;

  const onCreate = async () => {
    const e = {};
    if (!form.storeNumber.trim()) e.storeNumber = "Requerido.";
    if (!form.name.trim()) e.name = "Requerido.";
    setErrs(e);
    if (Object.keys(e).length) return;
    try {
      await create({ ...form, warehouseId });
      setOpen(false);
      setForm({ storeNumber: "", name: "" });
      setErrs({});
    } catch {
      /* toast del hook */
    }
  };

  return (
    <>
      <SectionTitle
        title="Tiendas del almacén"
        action={
          <PrimaryButton icon={Plus} onClick={() => setOpen(true)}>
            Nueva tienda
          </PrimaryButton>
        }
      />
      {loading ? (
        <Spinner label="Cargando tiendas…" />
      ) : error ? (
        <ErrorState description={error.message} onRetry={refetch} />
      ) : stores.length === 0 ? (
        <EmptyState
          icon={Store}
          title="Sin tiendas"
          description="Crea la primera tienda de este almacén."
        />
      ) : (
        <Card padding={0}>
          <TableScroll minWidth={520}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Número</th>
                  <th style={th}>Nombre</th>
                  <th style={th}>Estado</th>
                  <th style={{ ...th, textAlign: "right" }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {stores.map((s) => (
                  <tr key={s.id}>
                    <td style={td}>{s.store_number}</td>
                    <td style={td}>{s.name}</td>
                    <td style={td}>
                      <ActiveCell active={s.active} />
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <GhostButton size="sm" onClick={() => setActive(s.id, !s.active)}>
                        {s.active ? "Desactivar" : "Activar"}
                      </GhostButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </Card>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title="Nueva tienda" maxWidth={460}>
        <Sheet.Body>
          <Field label="Número de tienda" required error={errs.storeNumber}>
            <Field.Input
              value={form.storeNumber}
              onChange={(e) => setForm((f) => ({ ...f, storeNumber: e.target.value }))}
              placeholder="Ej: 101"
              autoFocus
            />
          </Field>
          <Field label="Nombre de tienda" required error={errs.name}>
            <Field.Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ej: Tienda Centro"
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
