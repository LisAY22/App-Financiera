"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";

import { signOutAction } from "@/actions/session";
import { IDLE_TIMEOUT_MS, IDLE_WARNING_MS } from "@/lib/session-policy";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Compartir la última actividad entre pestañas. Sin esto, trabajar en una
 * pestaña dejaría morir a la otra, y al volver a ella te encontrarías la sesión
 * cerrada aunque no hubieras estado inactiva ni un minuto.
 */
const ACTIVITY_KEY = "finanzas:last-activity";

/**
 * `mousemove` queda fuera a propósito: el cursor se mueve solo al abrir un menú
 * o al recolocar la ventana, y bastaría eso para mantener viva una sesión
 * abandonada. Estos eventos exigen intención real.
 */
const ACTIVITY_EVENTS = [
  "pointerdown",
  "keydown",
  "wheel",
  "touchstart",
  "scroll",
] as const;

/** No hace falta escribir en localStorage en cada pulsación. */
const PERSIST_EVERY_MS = 5_000;

const TICK_MS = 1_000;

export function IdleGuard() {
  const router = useRouter();

  /** `null` = sin aviso. Un número = milisegundos que quedan. */
  const [remaining, setRemaining] = React.useState<number | null>(null);

  // Arranca en 0, no en `Date.now()`: leer el reloj durante el render es
  // impuro. El efecto de montaje pone la marca real, y `check` no cuenta nada
  // hasta entonces.
  const lastActivity = React.useRef(0);
  const lastPersist = React.useRef(0);
  const closing = React.useRef(false);

  // Los listeners leen esto para saber si deben ignorar la actividad pasiva. Va
  // en una ref y no en el estado porque se registran una sola vez, al montar.
  const warning = remaining !== null;
  const warningRef = React.useRef(false);
  React.useEffect(() => {
    warningRef.current = warning;
  }, [warning]);

  const markActive = React.useCallback(() => {
    const now = Date.now();
    lastActivity.current = now;
    if (now - lastPersist.current > PERSIST_EVERY_MS) {
      lastPersist.current = now;
      // Modo incógnito y algunos navegadores con almacenamiento bloqueado
      // lanzan aquí. El guardia debe seguir funcionando en esa pestaña, solo
      // que sin coordinarse con las demás.
      try {
        localStorage.setItem(ACTIVITY_KEY, String(now));
      } catch {}
    }
  }, []);

  /**
   * Sale y deja constancia del motivo. Idempotente: el tick corre cada segundo.
   *
   * La transición es obligatoria: fuera de ella el router descarta la
   * redirección que devuelve la acción y la pestaña se queda abierta con la
   * sesión ya cerrada por detrás.
   */
  const endSession = React.useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    React.startTransition(async () => {
      await signOutAction("idle");
    });
  }, []);

  /** «Sigo aquí»: reinicia el contador y revalida la sesión del servidor. */
  const stayLoggedIn = React.useCallback(() => {
    markActive();
    setRemaining(null);
    // La cuenta atrás pudo agotar el `updateAge` del servidor. Un refresh toca
    // el servidor, que renueva la caducidad de la fila de sesión; sin esto el
    // botón te dejaría en una app viva con una sesión a punto de caducar.
    router.refresh();
  }, [markActive, router]);

  React.useEffect(() => {
    // Si otra pestaña estuvo activa hace un momento, esta hereda su marca en
    // vez de empezar el contador de cero.
    let start = Date.now();
    try {
      const stored = Number(localStorage.getItem(ACTIVITY_KEY));
      if (Number.isFinite(stored) && stored > 0) start = Math.max(start, stored);
    } catch {}
    lastActivity.current = start;

    const onActivity = () => {
      // Durante el aviso solo cuenta pulsar el botón. Un roce del trackpad no
      // debería revivir en silencio la sesión de un dispositivo desatendido.
      if (!warningRef.current) markActive();
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== ACTIVITY_KEY || !event.newValue) return;
      const stamp = Number(event.newValue);
      if (Number.isFinite(stamp) && stamp > lastActivity.current) {
        lastActivity.current = stamp;
        setRemaining(null);
      }
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }
    window.addEventListener("storage", onStorage);

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
      window.removeEventListener("storage", onStorage);
    };
  }, [markActive]);

  React.useEffect(() => {
    // Se compara contra `Date.now()` en vez de encadenar timeouts porque el
    // navegador estrangula los temporizadores en pestañas ocultas y los congela
    // del todo cuando el equipo se suspende. Con marcas de tiempo, cerrar la
    // laptop dos horas se detecta en el primer tick al volver.
    const check = () => {
      // 0 = el efecto de montaje todavía no puso la marca inicial. Contar desde
      // la época cerraría la sesión en el primer tick.
      if (lastActivity.current === 0) return;
      const left = IDLE_TIMEOUT_MS - (Date.now() - lastActivity.current);
      if (left <= 0) {
        setRemaining(0);
        endSession();
      } else if (left <= IDLE_WARNING_MS) {
        setRemaining(left);
      } else {
        setRemaining(null);
      }
    };

    const id = window.setInterval(check, TICK_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", check);
    };
  }, [endSession]);

  const seconds = Math.max(0, Math.ceil((remaining ?? 0) / 1000));

  return (
    <Dialog
      open={warning}
      onOpenChange={(open) => {
        if (!open) stayLoggedIn();
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-xs">
        <DialogHeader>
          <span className="grid size-10 place-items-center rounded-xl bg-destructive/10 text-destructive">
            <ShieldAlert className="size-5" />
          </span>
          <DialogTitle>¿Sigues ahí?</DialogTitle>
          <DialogDescription>
            Por seguridad cerraremos tu sesión en{" "}
            <span className="font-medium tabular-nums text-foreground">
              {seconds} s
            </span>{" "}
            por inactividad.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={() => endSession()}>
            Cerrar sesión
          </Button>
          <Button onClick={stayLoggedIn}>Seguir aquí</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
