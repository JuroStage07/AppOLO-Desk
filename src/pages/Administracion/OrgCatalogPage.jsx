import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Building2, Globe2, Pencil, Plus, Power, RefreshCw, Warehouse } from "lucide-react";
import {
  Badge,
  Brand,
  Button,
  Container,
  EmptyState,
  Field,
  GhostButton,
  Hero,
  Main,
  Sheet,
  Shell,
  Spinner,
  StatusPill,
  TableScroll,
  Topbar,
  useConfirm,
  useToast,
} from "../../components/ui";
import { BORDER, DANGER, SHADOW_CARD, SLATE, SURFACE, SURFACE_INSET, TEXT } from "../../styles/theme";
import { fetchOrgCatalog, saveOrgCatalog } from "../../services/orgCatalog";
import { invalidateOrgCatalogCache } from "../../hooks/useOrgCatalog";

const ENTITY_LABEL = { tenant: "país", company: "compañía", bodega: "almacén" };

const EMPTY_FORM = {
  tenant: { id: "", name: "" },
  company: { id: "", name: "" },
  bodega: { tenantId: "", companyId: "", code: "", name: "", sroWarehouseId: "" },
};

const toCode = (v) =>
  String(v || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, "");

/**
 * Administración del catálogo de países (tenants), compañías y almacenes (bodegas).
 * Solo role dev (ruta protegida en App.jsx + validación server-side en orgCatalogAdmin).
 */
export default function OrgCatalogPage() {
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();

  const [catalog, setCatalog] = useState({ tenants: [], companies: [], bodegas: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tenantFilter, setTenantFilter] = useState("all");
  const [editor, setEditor] = useState(null); // { entity, action, form }
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCatalog(await fetchOrgCatalog());
      // El selector de almacén y UserHub releen el catálogo actualizado.
      invalidateOrgCatalogCache();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const tenantName = useMemo(
    () => Object.fromEntries(catalog.tenants.map((t) => [t.id, t.name])),
    [catalog.tenants]
  );
  const bodegasByTenant = useMemo(() => {
    const map = {};
    catalog.bodegas.forEach((b) => {
      map[b.tenantId] = (map[b.tenantId] || 0) + 1;
    });
    return map;
  }, [catalog.bodegas]);
  const bodegasByCompany = useMemo(() => {
    const map = {};
    catalog.bodegas.forEach((b) => {
      map[b.companyId] = (map[b.companyId] || 0) + 1;
    });
    return map;
  }, [catalog.bodegas]);
  const visibleBodegas = useMemo(
    () => catalog.bodegas.filter((b) => tenantFilter === "all" || b.tenantId === tenantFilter),
    [catalog.bodegas, tenantFilter]
  );

  const openCreate = (entity) => {
    const form = { ...EMPTY_FORM[entity] };
    if (entity === "bodega") {
      form.tenantId = tenantFilter !== "all" ? tenantFilter : catalog.tenants.find((t) => t.active)?.id || "";
      form.companyId = catalog.companies.find((c) => c.active)?.id || "";
    }
    setEditor({ entity, action: "create", form });
  };

  const openEdit = (entity, record) => {
    const form =
      entity === "bodega"
        ? {
            id: record.id,
            tenantId: record.tenantId,
            companyId: record.companyId,
            code: record.code,
            name: record.name,
            sroWarehouseId: record.sroWarehouseId || "",
          }
        : { id: record.id, name: record.name };
    setEditor({ entity, action: "update", form });
  };

  const setField = (key, value) => setEditor((e) => ({ ...e, form: { ...e.form, [key]: value } }));

  const handleSave = async () => {
    const { entity, action, form } = editor;
    const data =
      entity === "bodega" && action === "update"
        ? { id: form.id, name: form.name, sroWarehouseId: form.sroWarehouseId }
        : form;
    setSaving(true);
    try {
      await saveOrgCatalog(entity, action, data);
      toast.success(
        action === "create"
          ? `Se creó el ${ENTITY_LABEL[entity]}.`
          : `Se guardaron los cambios del ${ENTITY_LABEL[entity]}.`
      );
      setEditor(null);
      await load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (entity, record) => {
    const next = !record.active;
    if (!next) {
      const dependents =
        entity === "tenant"
          ? catalog.bodegas.filter((b) => b.tenantId === record.id && b.active).length
          : entity === "company"
            ? catalog.bodegas.filter((b) => b.companyId === record.id && b.active).length
            : 0;
      const ok = await confirm({
        title: `Desactivar ${ENTITY_LABEL[entity]} ${record.name}`,
        message:
          (dependents
            ? `Tiene ${dependents} almacén(es) activo(s) que seguirán existiendo. `
            : "") +
          "No se borra nada: los datos históricos quedan intactos y se puede volver a activar. Dejará de aparecer para asignar.",
        confirmText: "Desactivar",
        tone: "warning",
      });
      if (!ok) return;
    }
    setBusyId(`${entity}:${record.id}`);
    try {
      await saveOrgCatalog(entity, "update", { id: record.id, active: next });
      toast.success(next ? "Activado." : "Desactivado.");
      await load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const bodegaPreviewId =
    editor?.entity === "bodega" && editor.action === "create"
      ? [editor.form.tenantId, editor.form.companyId, toCode(editor.form.code)].every(Boolean)
        ? `${editor.form.tenantId}-${editor.form.companyId}-${toCode(editor.form.code)}`
        : ""
      : "";

  const rowActions = (entity, record) => (
    <div style={styles.actions}>
      <GhostButton size="sm" icon={Pencil} onClick={() => openEdit(entity, record)}>
        Editar
      </GhostButton>
      <GhostButton
        size="sm"
        icon={Power}
        loading={busyId === `${entity}:${record.id}`}
        onClick={() => toggleActive(entity, record)}
        style={record.active ? { color: DANGER } : undefined}
      >
        {record.active ? "Desactivar" : "Activar"}
      </GhostButton>
    </div>
  );

  const statusPill = (active) =>
    active ? <StatusPill tone="ok">Activo</StatusPill> : <StatusPill tone="neutral">Inactivo</StatusPill>;

  return (
    <Shell>
      <Topbar>
        <Brand icon={Globe2} title="Administración" subtitle="Países y almacenes" onClick={() => nav("/administracion")} />
        <Topbar.Right>
          <GhostButton icon={ArrowLeft} onClick={() => nav("/administracion")}>
            Volver
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container>
          <Hero
            kicker="Administración · solo dev"
            title="Países, compañías y almacenes"
            subtitle="Catálogo que separa los datos de la plataforma. Cada almacén pertenece a un país y a una compañía. Nada se borra: se desactiva."
            badge={<Badge icon={Warehouse}>{catalog.bodegas.length} almacenes</Badge>}
            aside={
              <Button variant="secondary" icon={RefreshCw} onClick={load} disabled={loading} block>
                Actualizar
              </Button>
            }
          />

          {!!error && <div style={styles.errorBanner}>{error}</div>}

          {loading ? (
            <Spinner label="Cargando catálogo…" />
          ) : (
            <>
              <section style={styles.card}>
                <div style={styles.cardHead}>
                  <div style={styles.cardTitle}>
                    <Globe2 size={17} strokeWidth={2.3} /> Países
                  </div>
                  <Button variant="primary" size="sm" icon={Plus} onClick={() => openCreate("tenant")}>
                    Nuevo país
                  </Button>
                </div>
                {catalog.tenants.length === 0 ? (
                  <EmptyState icon={Globe2} title="Sin países" description="Creá el primer país." />
                ) : (
                  <TableScroll minWidth={560} bordered={false}>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th style={styles.th}>Código</th>
                          <th style={styles.th}>Nombre</th>
                          <th style={styles.thRight}>Almacenes</th>
                          <th style={styles.th}>Estado</th>
                          <th style={styles.thRight}>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {catalog.tenants.map((t) => (
                          <tr key={t.id}>
                            <td style={styles.tdCode}>{t.id}</td>
                            <td style={styles.td}>{t.name}</td>
                            <td style={styles.tdRight}>{bodegasByTenant[t.id] || 0}</td>
                            <td style={styles.td}>{statusPill(t.active)}</td>
                            <td style={styles.tdRight}>{rowActions("tenant", t)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableScroll>
                )}
              </section>

              <section style={styles.card}>
                <div style={styles.cardHead}>
                  <div style={styles.cardTitle}>
                    <Building2 size={17} strokeWidth={2.3} /> Compañías
                  </div>
                  <Button variant="primary" size="sm" icon={Plus} onClick={() => openCreate("company")}>
                    Nueva compañía
                  </Button>
                </div>
                {catalog.companies.length === 0 ? (
                  <EmptyState icon={Building2} title="Sin compañías" description="Creá la primera compañía." />
                ) : (
                  <TableScroll minWidth={560} bordered={false}>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th style={styles.th}>Código</th>
                          <th style={styles.th}>Nombre</th>
                          <th style={styles.thRight}>Almacenes</th>
                          <th style={styles.th}>Estado</th>
                          <th style={styles.thRight}>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {catalog.companies.map((c) => (
                          <tr key={c.id}>
                            <td style={styles.tdCode}>{c.id}</td>
                            <td style={styles.td}>{c.name}</td>
                            <td style={styles.tdRight}>{bodegasByCompany[c.id] || 0}</td>
                            <td style={styles.td}>{statusPill(c.active)}</td>
                            <td style={styles.tdRight}>{rowActions("company", c)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableScroll>
                )}
              </section>

              <section style={styles.card}>
                <div style={styles.cardHead}>
                  <div style={styles.cardTitle}>
                    <Warehouse size={17} strokeWidth={2.3} /> Almacenes
                  </div>
                  <div style={styles.headRight}>
                    <select
                      value={tenantFilter}
                      onChange={(e) => setTenantFilter(e.target.value)}
                      style={styles.select}
                      aria-label="Filtrar por país"
                    >
                      <option value="all">Todos los países</option>
                      {catalog.tenants.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="primary"
                      size="sm"
                      icon={Plus}
                      onClick={() => openCreate("bodega")}
                      disabled={!catalog.tenants.some((t) => t.active) || !catalog.companies.some((c) => c.active)}
                    >
                      Nuevo almacén
                    </Button>
                  </div>
                </div>
                {visibleBodegas.length === 0 ? (
                  <EmptyState icon={Warehouse} title="Sin almacenes" description="No hay almacenes para este país." />
                ) : (
                  <TableScroll minWidth={820} bordered={false}>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th style={styles.th}>ID</th>
                          <th style={styles.th}>Nombre</th>
                          <th style={styles.th}>País</th>
                          <th style={styles.th}>Compañía</th>
                          <th style={styles.th}>Warehouse SRO</th>
                          <th style={styles.th}>Estado</th>
                          <th style={styles.thRight}>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleBodegas.map((b) => (
                          <tr key={b.id}>
                            <td style={styles.tdCode}>{b.id}</td>
                            <td style={styles.td}>{b.name}</td>
                            <td style={styles.td}>{tenantName[b.tenantId] || b.tenantId}</td>
                            <td style={styles.td}>{b.companyId}</td>
                            <td style={styles.tdMuted}>{b.sroWarehouseId ? `${b.sroWarehouseId.slice(0, 8)}…` : "—"}</td>
                            <td style={styles.td}>{statusPill(b.active)}</td>
                            <td style={styles.tdRight}>{rowActions("bodega", b)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableScroll>
                )}
              </section>
            </>
          )}
        </Container>
      </Main>

      <Sheet
        open={!!editor}
        onClose={() => !saving && setEditor(null)}
        title={
          editor
            ? `${editor.action === "create" ? "Nuevo" : "Editar"} ${ENTITY_LABEL[editor.entity]}`
            : ""
        }
        placement="center"
        maxWidth={520}
      >
        {editor && (
          <>
            <Sheet.Body>
              {(editor.entity === "tenant" || editor.entity === "company") && (
                <>
                  <Field label="Código" required>
                    <Field.Input
                      value={editor.form.id}
                      onChange={(e) => setField("id", toCode(e.target.value))}
                      placeholder={editor.entity === "tenant" ? "CR" : "OLO"}
                      disabled={editor.action === "update"}
                      maxLength={editor.entity === "tenant" ? 5 : 10}
                    />
                  </Field>
                  <Field label="Nombre" required>
                    <Field.Input
                      value={editor.form.name}
                      onChange={(e) => setField("name", e.target.value)}
                      placeholder={editor.entity === "tenant" ? "Costa Rica" : "OLO Logistics"}
                    />
                  </Field>
                  {editor.action === "update" && (
                    <Sheet.Hint>El código no se puede cambiar: los datos existentes dependen de él.</Sheet.Hint>
                  )}
                </>
              )}

              {editor.entity === "bodega" && (
                <>
                  <Field label="País" required>
                    <Field.Select
                      value={editor.form.tenantId}
                      onChange={(e) => setField("tenantId", e.target.value)}
                      disabled={editor.action === "update"}
                    >
                      <option value="">Elegí un país</option>
                      {catalog.tenants
                        .filter((t) => t.active || t.id === editor.form.tenantId)
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.id})
                          </option>
                        ))}
                    </Field.Select>
                  </Field>
                  <Field label="Compañía" required>
                    <Field.Select
                      value={editor.form.companyId}
                      onChange={(e) => setField("companyId", e.target.value)}
                      disabled={editor.action === "update"}
                    >
                      <option value="">Elegí una compañía</option>
                      {catalog.companies
                        .filter((c) => c.active || c.id === editor.form.companyId)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.id})
                          </option>
                        ))}
                    </Field.Select>
                  </Field>
                  <Field label="Código del almacén" required>
                    <Field.Input
                      value={editor.form.code}
                      onChange={(e) => setField("code", toCode(e.target.value))}
                      placeholder="CLIRO"
                      disabled={editor.action === "update"}
                      maxLength={20}
                    />
                  </Field>
                  <Field label="Nombre" required>
                    <Field.Input
                      value={editor.form.name}
                      onChange={(e) => setField("name", e.target.value)}
                      placeholder="CLIRO"
                    />
                  </Field>
                  <Field label="Warehouse SRO (opcional)">
                    <Field.Input
                      value={editor.form.sroWarehouseId}
                      onChange={(e) => setField("sroWarehouseId", e.target.value.trim())}
                      placeholder="UUID del almacén en SRO"
                    />
                  </Field>
                  <Sheet.Hint>
                    {editor.action === "create"
                      ? bodegaPreviewId
                        ? `ID del almacén: ${bodegaPreviewId}. No se podrá cambiar después.`
                        : "El ID se arma con país, compañía y código, y no se podrá cambiar después."
                      : `ID: ${editor.form.id}. País, compañía y código no se pueden cambiar; si cambió la estructura, creá un almacén nuevo y desactivá este.`}
                  </Sheet.Hint>
                </>
              )}
            </Sheet.Body>
            <Sheet.Actions>
              <Button variant="secondary" onClick={() => setEditor(null)} disabled={saving}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={handleSave} loading={saving} disabled={saving}>
                {editor.action === "create" ? "Crear" : "Guardar"}
              </Button>
            </Sheet.Actions>
          </>
        )}
      </Sheet>
    </Shell>
  );
}

const styles = {
  errorBanner: {
    background: "rgba(185,28,28,0.08)",
    border: "1px solid rgba(185,28,28,0.25)",
    color: DANGER,
    borderRadius: 14,
    padding: 14,
    fontWeight: 800,
    fontSize: 13,
  },
  card: {
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: 18,
    boxShadow: SHADOW_CARD,
    overflow: "hidden",
  },
  cardHead: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "14px 16px",
    borderBottom: `1px solid ${BORDER}`,
    background: SURFACE_INSET,
  },
  cardTitle: { display: "inline-flex", alignItems: "center", gap: 8, color: TEXT, fontWeight: 950, fontSize: 15 },
  headRight: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 },
  select: {
    border: `1px solid ${BORDER}`,
    background: SURFACE,
    color: TEXT,
    borderRadius: 12,
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
  },
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    textAlign: "left",
    padding: "11px 14px",
    borderBottom: `1px solid ${BORDER}`,
    color: SLATE,
    fontSize: 12,
    fontWeight: 950,
    textTransform: "uppercase",
  },
  thRight: {
    textAlign: "right",
    padding: "11px 14px",
    borderBottom: `1px solid ${BORDER}`,
    color: SLATE,
    fontSize: 12,
    fontWeight: 950,
    textTransform: "uppercase",
  },
  td: { padding: "10px 14px", borderBottom: `1px solid ${BORDER}`, color: TEXT, fontSize: 13, fontWeight: 800 },
  tdRight: {
    padding: "10px 14px",
    borderBottom: `1px solid ${BORDER}`,
    color: TEXT,
    fontSize: 13,
    fontWeight: 800,
    textAlign: "right",
  },
  tdCode: {
    padding: "10px 14px",
    borderBottom: `1px solid ${BORDER}`,
    color: TEXT,
    fontSize: 12.5,
    fontWeight: 950,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    whiteSpace: "nowrap",
  },
  tdMuted: {
    padding: "10px 14px",
    borderBottom: `1px solid ${BORDER}`,
    color: SLATE,
    fontSize: 12.5,
    fontWeight: 700,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  actions: { display: "inline-flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" },
};
