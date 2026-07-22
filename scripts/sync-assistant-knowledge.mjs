import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const paths = {
  app: path.join(rootDir, "src", "App.jsx"),
  workAreas: path.join(rootDir, "src", "config", "workAreas.jsx"),
  capabilities: path.join(rootDir, "docs", "assistant-knowledge", "appolo-capabilities.json"),
  docsKnowledge: path.join(rootDir, "docs", "assistant-knowledge", "appolo-knowledge.json"),
  publicKnowledge: path.join(rootDir, "public", "assistant-knowledge", "appolo-knowledge.json"),
};

function removeImports(source) {
  return source
    .replace(/import[\s\S]*?from\s+["'][^"']+["'];\s*/g, "")
    .replace(/import\s+["'][^"']+["'];\s*/g, "");
}

function normalizeWorkAreasSource(source) {
  return removeImports(source)
    .replace(/\bexport\s+/g, "")
    .replace(/icon:\s*<[\s\S]*?\/>/g, "icon: null")
    .replace(/img:\s*img[A-Za-z0-9_$]+/g, "img: null");
}

async function loadWorkAreas() {
  const source = await readFile(paths.workAreas, "utf8");
  const code = `${normalizeWorkAreasSource(source)}

globalThis.__ASSISTANT_KNOWLEDGE_SYNC__ = {
  areaThemes: AREA_THEMES,
  workAreas: WORK_AREAS,
};`;

  const sandbox = {};
  vm.runInNewContext(code, sandbox, {
    filename: paths.workAreas,
    timeout: 1000,
  });

  const result = sandbox.__ASSISTANT_KNOWLEDGE_SYNC__;
  if (!result?.workAreas || !Array.isArray(result.workAreas)) {
    throw new Error("No se pudo extraer WORK_AREAS desde src/config/workAreas.jsx.");
  }

  return result;
}

async function loadBaseKnowledge() {
  const raw = await readFile(paths.docsKnowledge, "utf8");
  return JSON.parse(raw);
}

async function loadCapabilities() {
  const raw = await readFile(paths.capabilities, "utf8");
  const value = JSON.parse(raw);
  if (!Array.isArray(value)) {
    throw new Error("docs/assistant-knowledge/appolo-capabilities.json debe ser un array.");
  }
  return value;
}

function cleanFeatures(features = []) {
  return features
    .filter((feature) => feature?.label && feature?.path)
    .map((feature) => ({
      label: feature.label,
      path: feature.path,
      ...cleanAccessGate(feature),
    }));
}

function cleanAccessGate(item = {}) {
  const gate = {};
  if (item.requiredPerm) gate.requiredPerm = item.requiredPerm;
  if (Array.isArray(item.anyPerms) && item.anyPerms.length) gate.anyPerms = item.anyPerms;
  if (Array.isArray(item.allPerms) && item.allPerms.length) gate.allPerms = item.allPerms;
  if (Array.isArray(item.roles) && item.roles.length) gate.roles = item.roles;
  if (Array.isArray(item.allowedRoles) && item.allowedRoles.length) {
    gate.allowedRoles = item.allowedRoles;
  }
  if (item.adminOverride === false) gate.adminOverride = false;
  if (item.adminOnly === true) gate.adminOnly = true;
  if (item.devOnly === true) gate.devOnly = true;
  return gate;
}

function cleanModules(modules = []) {
  return modules
    .filter((module) => module?.label)
    .map((module) => ({
      label: module.label,
      ...(module.path ? { path: module.path } : {}),
      ...cleanAccessGate(module),
      features: cleanFeatures(module.features),
    }));
}

function defaultSampleQuestions(area) {
  const title = area.title || "esta area";
  return [
    `Como uso ${title}?`,
    `Que modulos tiene ${title}?`,
    `Donde encuentro ${title}?`,
  ];
}

function buildAreas(workAreas, existingAreas = []) {
  const existingByKey = new Map(existingAreas.map((area) => [area.key, area]));

  return workAreas.map((area) => {
    const previous = existingByKey.get(area.key) || {};
    const synced = {
      key: area.key,
      title: area.title,
      path: area.path,
      tag: area.tag,
      description: area.desc || previous.description || "",
      ...(area.theme ? { theme: area.theme } : {}),
      ...cleanAccessGate(area),
      modules: cleanModules(area.modules),
      sampleQuestions: previous.sampleQuestions || defaultSampleQuestions(area),
    };

    if (area.comingSoon === true) synced.comingSoon = true;
    if (area.comingSoonMsg) synced.comingSoonMsg = area.comingSoonMsg;
    if (area.blocked === true) synced.blocked = true;
    if (area.blockedDesc) synced.blockedDesc = area.blockedDesc;
    if (area.adminOnly === true && !synced.allowedRoles) {
      synced.allowedRoles = ["administrativo", "dev"];
    }
    if (area.devOnly === true && !synced.allowedRoles) {
      synced.allowedRoles = ["dev"];
    }

    return synced;
  });
}

function collectAreaPathLabels(areas) {
  const labels = new Map();

  for (const area of areas) {
    if (area.path) labels.set(area.path, area.title);
    for (const module of area.modules || []) {
      if (module.path) labels.set(module.path, `${area.title}: ${module.label}`);
      for (const feature of module.features || []) {
        if (feature.path) labels.set(feature.path, `${area.title}: ${feature.label}`);
      }
    }
  }

  labels.set("/", "Hub principal");
  labels.set("/areas", "Hub principal");
  labels.set("/welcome", "Bienvenida post-login");
  labels.set("/config-region", "Configuracion de tenant/region");

  return labels;
}

function extractRoutePaths(appSource) {
  const paths = [];
  const seen = new Set();
  const routeRegex = /<Route[\s\S]*?\bpath=["']([^"']+)["']/g;
  let match;

  while ((match = routeRegex.exec(appSource)) !== null) {
    const routePath = match[1];
    // Nested React Router paths (for example "dashboard") are relative to their
    // parent. Their canonical absolute paths come from WORK_AREAS below.
    if (routePath.startsWith("/") && !seen.has(routePath)) {
      seen.add(routePath);
      paths.push(routePath);
    }
  }

  return paths;
}

function collectModulePaths(areas = []) {
  const paths = [];
  for (const area of areas) {
    for (const module of area.modules || []) {
      if (module.path?.startsWith("/")) paths.push(module.path);
      for (const feature of module.features || []) {
        if (feature.path?.startsWith("/")) paths.push(feature.path);
      }
    }
  }
  return paths;
}

function inferAccess(routePath) {
  if (routePath === "/login") return "public";
  if (routePath === "/config-region") return "auth (sin tenant)";
  if (routePath === "/dev" || routePath.startsWith("/dev/")) return "private (dev)";
  if (
    routePath === "/administracion" ||
    routePath.startsWith("/administracion/") ||
    routePath === "/horas-extra" ||
    routePath.startsWith("/horas-extra/")
  ) {
    return "private (administrativo/dev)";
  }
  return "private";
}

function routeNameFromPath(routePath) {
  if (routePath === "/") return "Hub principal";
  return routePath
    .replace(/^\//, "")
    .replace(/\*/g, "wildcard")
    .replace(/:/g, "")
    .split("/")
    .filter(Boolean)
    .map((part) => part.replace(/-/g, " "))
    .join(" / ") || "Ruta de AppoloDesk";
}

function buildRoutes(appSource, existingRoutes = [], areas = []) {
  const existingByPath = new Map(existingRoutes.map((route) => [route.path, route]));
  const labelByPath = collectAreaPathLabels(areas);

  const routePaths = [...new Set([...extractRoutePaths(appSource), ...collectModulePaths(areas)])];

  return routePaths.map((routePath) => {
    const previous = existingByPath.get(routePath);
    return {
      path: routePath,
      access: previous?.access || inferAccess(routePath),
      screen: previous?.screen || labelByPath.get(routePath) || routeNameFromPath(routePath),
    };
  });
}

function buildFlatNavigation(areas) {
  const items = [];

  for (const area of areas) {
    items.push({
      type: "area",
      areaKey: area.key,
      areaTitle: area.title,
      label: area.title,
      path: area.path,
      keywords: [area.key, area.title, area.description, area.tag].filter(Boolean),
    });

    for (const module of area.modules || []) {
      items.push({
        type: "module",
        areaKey: area.key,
        areaTitle: area.title,
        label: module.label,
        path: module.path,
        keywords: [area.key, area.title, module.label, module.path].filter(Boolean),
      });

      for (const feature of module.features || []) {
        items.push({
          type: "feature",
          areaKey: area.key,
          areaTitle: area.title,
          moduleLabel: module.label,
          label: feature.label,
          path: feature.path,
          keywords: [area.key, area.title, module.label, feature.label, feature.path].filter(Boolean),
        });
      }
    }
  }

  return items.filter((item) => item.path);
}

function buildKnowledge(baseKnowledge, syncedAreas, syncedRoutes, capabilities) {
  return {
    ...baseKnowledge,
    generatedAt: new Date().toISOString(),
    generatedFrom: [
      "src/config/workAreas.jsx",
      "src/App.jsx",
      "docs/assistant-knowledge/appolo-capabilities.json",
      "docs/assistant-knowledge/appolo-knowledge.json",
    ],
    areas: syncedAreas,
    routes: syncedRoutes,
    navigationIndex: buildFlatNavigation(syncedAreas),
    capabilities,
  };
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const json = `${JSON.stringify(value, null, 2)}\n`;
  JSON.parse(json);
  await writeFile(filePath, json, "utf8");
}

async function main() {
  const [baseKnowledge, appSource, { workAreas }, capabilities] = await Promise.all([
    loadBaseKnowledge(),
    readFile(paths.app, "utf8"),
    loadWorkAreas(),
    loadCapabilities(),
  ]);

  const areas = buildAreas(workAreas, baseKnowledge.areas);
  const routes = buildRoutes(appSource, baseKnowledge.routes, areas);
  const knowledge = buildKnowledge(baseKnowledge, areas, routes, capabilities);

  await writeJson(paths.docsKnowledge, knowledge);
  await writeJson(paths.publicKnowledge, knowledge);

  console.log(`Assistant knowledge synced.`);
  console.log(`- Areas: ${areas.length}`);
  console.log(`- Routes: ${routes.length}`);
  console.log(`- Capabilities: ${capabilities.length}`);
  console.log(`- Docs: ${path.relative(rootDir, paths.docsKnowledge)}`);
  console.log(`- Public: ${path.relative(rootDir, paths.publicKnowledge)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
