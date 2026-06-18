# Plan de integración del Asistente AppoloDesk con n8n

> Este documento describe **cómo conectar más adelante** la UI del chat
> (`AssistantChat` en `src/pages/AreasTrabajoHubPage.jsx`) con un workflow de
> n8n. Por ahora el chat usa respuestas mock locales; nada de lo aquí descrito
> está conectado todavía. No incluye secretos ni credenciales.

---

## 1. Visión general del flujo

```
UI del chat (frontend)
      │  POST (fetch)  { userMessage, contexto del usuario }
      ▼
Webhook n8n  ──► limpiar/normalizar pregunta
      │
      ├─► buscar contexto en appolo-knowledge.json o vector store
      │
      ├─► construir prompt (sistema + contexto + pregunta + historial)
      │
      ├─► llamar al modelo (LLM)
      ▼
Respuesta JSON { answer, sources, confidence, suggestedActions }
      ▼
UI del chat renderiza la respuesta del asistente
```

---

## 2. Webhook esperado

- **Tipo:** nodo *Webhook* de n8n, método `POST`.
- **URL:** se guardará en el frontend como variable de entorno (p. ej.
  `VITE_ASSISTANT_WEBHOOK_URL`) — **no** hardcodear en el código.
- **Auth recomendada:** header/token compartido (p. ej. `X-Appolo-Token`)
  validado en n8n; opcionalmente, verificar el ID token de Firebase del usuario.
- **CORS:** habilitar el origen del hosting de AppoloDesk.

---

## 3. Payload recomendado (frontend → n8n)

```json
{
  "userMessage": "¿Cómo genero un visado?",
  "userId": "firebase-uid",
  "tenantId": "TENANT_X",
  "company": "COMPANY_Y",
  "role": "administrativo",
  "permisos": { "mantenimiento": true, "saludOcupacional": false },
  "currentRoute": "/areas",
  "conversationId": "uuid-de-la-conversacion",
  "history": [
    { "role": "assistant", "text": "Hola, soy el asistente de AppoloDesk..." },
    { "role": "user", "text": "¿Cómo genero un visado?" }
  ]
}
```

| Campo | Origen en el frontend | Uso en n8n |
|-------|------------------------|------------|
| `userMessage` | textarea del chat | pregunta a responder |
| `userId` | `AuthCtx.user.uid` | trazabilidad / auditoría |
| `tenantId` | `AuthCtx.profile.tenantId` | aislar contexto por tenant |
| `company` | `AuthCtx.profile.company` | aislar contexto por company |
| `role` | `AuthCtx.role` | adaptar la respuesta a permisos |
| `permisos` | `AuthCtx.permisos` | ocultar módulos sin acceso |
| `currentRoute` | `useLocation().pathname` | contexto de dónde está el usuario |
| `conversationId` | uuid generado al abrir el chat | mantener hilo |
| `history` | `assistantMessages` (recortado) | memoria corta de la charla |

> **No** enviar emails, tokens ni datos sensibles más allá de lo necesario para
> dar contexto. El `tenantId`/`company` se envían para que n8n acote el alcance,
> pero la verdad de permisos debe revalidarse en backend cuando se conecte a
> datos en vivo.

---

## 4. Respuesta esperada (n8n → frontend)

```json
{
  "answer": "Para generar un visado, entrá a Seguridad › Visados › Generar visado (/seguridad/visado/generar)...",
  "sources": [
    { "title": "Seguridad — Visados", "ref": "appolo-knowledge.md#62-seguridad-sso" }
  ],
  "confidence": 0.86,
  "suggestedActions": [
    { "label": "Ir a Generar visado", "path": "/seguridad/visado/generar" },
    { "label": "Administrar visados", "path": "/seguridad/visados" }
  ]
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `answer` | string | Texto a mostrar en la burbuja del asistente |
| `sources` | array | Fragmentos/documentos usados (para transparencia) |
| `confidence` | number (0–1) | Si es baja, la UI puede avisar "no estoy seguro" |
| `suggestedActions` | array | Chips/botones con `label` + `path` para navegar |

La UI actual (`AssistantChat`) ya muestra burbujas; `suggestedActions` se puede
renderizar como chips que naveguen con `nav(path)` (validando que la ruta exista
y que el rol/permiso del usuario la permita).

---

## 5. Workflow recomendado en n8n

1. **Webhook (POST)** — recibe el payload y valida el token compartido.
2. **Normalización** — limpiar la pregunta (trim, minúsculas, quitar PII
   accidental), validar campos mínimos (`userMessage`, `tenantId`).
3. **Recuperación de contexto** — buscar en `appolo-knowledge.json` (o en un
   vector store alimentado con `appolo-knowledge.md`) los fragmentos más
   relevantes a la pregunta. Filtrar por lo que el `role`/`permisos` permiten ver.
4. **Construcción del prompt** — system prompt (rol del asistente + reglas de
   seguridad) + contexto recuperado + `history` recortado + `userMessage`.
5. **Llamada al modelo (LLM)** — usar el modelo elegido; pedir salida en el
   formato JSON de la sección 4.
6. **Post-proceso** — validar/parsear el JSON, recortar acciones a rutas
   conocidas, calcular/normalizar `confidence`.
7. **Responder** — devolver el JSON al webhook (que la UI consume).

Opcional: nodo de logging (sin secretos) para auditoría de preguntas por tenant.

---

## 6. Reglas de seguridad del workflow

- **No exponer secretos** (claves de API, SMTP, SQL, Firebase) en respuestas ni
  logs. Viven en credenciales de n8n / variables de entorno.
- **Aislamiento por tenant:** nunca responder con datos de un `tenantId`/`company`
  distinto al del solicitante. Mientras solo haya documentación general, esto
  aplica especialmente cuando se conecten datos en vivo.
- **Si no sabe, lo dice:** ante baja `confidence` o falta de contexto, responder
  "No tengo información suficiente sobre eso" y sugerir el módulo/ruta adecuado,
  en vez de inventar.
- **Documentación general vs datos en vivo:** distinguir claramente. Hoy el bot
  solo conoce funcionamiento/módulos/procesos (este paquete); no debe afirmar
  cifras, estados o registros concretos hasta que exista una fuente en vivo
  conectada y autorizada.
- **Validación de rutas sugeridas:** `suggestedActions[].path` debe limitarse a
  rutas reales del sistema (ver `appolo-knowledge.json.routes`) y respetar el
  rol/permiso del usuario.

---

## 7. Próximos pasos (cuando se implemente)

1. Crear el workflow en n8n con el webhook y el formato de esta guía.
2. Subir `appolo-knowledge.md` a un vector store (o cargar
   `appolo-knowledge.json` como contexto estructurado).
3. Añadir `VITE_ASSISTANT_WEBHOOK_URL` (y token) al `.env` del frontend.
4. En `AssistantChat`, reemplazar la respuesta mock por un `fetch` al webhook
   con el payload de la sección 3 y renderizar `answer` + `suggestedActions`.
5. Mantener un estado de error/timeout amable en la UI.
