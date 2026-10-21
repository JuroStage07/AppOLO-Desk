import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button, Field, Sheet } from "../../components/ui";
import { DANGER, SLATE, TEXT } from "../../styles/theme";

/**
 * Confirmación para eliminar un usuario: hay que escribir su correo.
 * Explica qué se borra (el acceso) y qué no (sus registros).
 */
export default function DeleteUserDialog({ user, open, deleting, onCancel, onConfirm }) {
  const [typed, setTyped] = useState("");
  const email = String(user?.email || "").trim().toLowerCase();
  const matches = email ? typed.trim().toLowerCase() === email : typed.trim().toUpperCase() === "ELIMINAR";

  if (!user) return null;
  const name = user.displayName || user.nombre || user.email || user.id;

  return (
    <Sheet open={open} onClose={() => !deleting && onCancel()} title="Eliminar usuario" placement="center" maxWidth={520}>
      <Sheet.Body>
        <div style={styles.text}>
          Vas a eliminar a <strong style={{ color: TEXT }}>{name}</strong>
          {email ? ` (${email})` : ""}.
        </div>
        <ul style={styles.list}>
          <li>
            <strong>Se elimina:</strong> su cuenta de acceso (deja de poder entrar a Desk y a la app
            móvil), su perfil, su usuario de la app y sus notificaciones.
          </li>
          <li>
            <strong>No se elimina:</strong> nada de lo que registró (OTs, horas extra, aperturas, marcas…).
            Esos registros conservan su nombre.
          </li>
          <li>Su perfil queda archivado y se puede restaurar si fue un error.</li>
        </ul>
        <Field label={email ? `Escribí su correo para confirmar: ${email}` : "Escribí ELIMINAR para confirmar"} required>
          <Field.Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={email || "ELIMINAR"}
            autoComplete="off"
            disabled={deleting}
          />
        </Field>
      </Sheet.Body>
      <Sheet.Actions>
        <Button variant="secondary" onClick={onCancel} disabled={deleting}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          icon={Trash2}
          onClick={() => onConfirm(user, email)}
          disabled={!matches || deleting}
          loading={deleting}
          style={{ background: DANGER, borderColor: DANGER }}
        >
          Eliminar usuario
        </Button>
      </Sheet.Actions>
    </Sheet>
  );
}

const styles = {
  text: { fontSize: 14, fontWeight: 700, color: SLATE, lineHeight: 1.45 },
  list: { margin: "4px 0 6px", paddingLeft: 18, fontSize: 13, fontWeight: 700, color: SLATE, lineHeight: 1.5, display: "grid", gap: 4 },
};
