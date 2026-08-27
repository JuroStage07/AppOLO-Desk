// Barrel del Centro de Notificaciones.
//
//   import { NotificationCenter } from "../components/notifications";
//
// El componente es genérico y no depende de ningún módulo: para que un módulo
// nuevo aporte notificaciones alcanza con emitir documentos en la colección
// `notifications` (desde backend) y registrar su `type` en notificationMeta.js.

export { default as NotificationCenter } from "./NotificationCenter";
export {
  DEFAULT_META,
  ENTITY_META,
  NOTIFICATION_META,
  entityMeta,
  notificationMeta,
  relativeTimeEs,
} from "./notificationMeta";
