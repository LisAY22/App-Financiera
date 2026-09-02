import "server-only";
import type { z } from "zod";
import type { BatchItem } from "drizzle-orm/batch";

/**
 * `db.batch()` exige una tupla no vacía. Este alias evita repetir el mismo
 * cast en cada acción cuando el número de escrituras depende de los datos
 * (por ejemplo, un gasto que puede llevar cuotas o no).
 */
export type Batch = [BatchItem<"pg">, ...BatchItem<"pg">[]];

export function asBatch(queries: BatchItem<"pg">[]): Batch {
  return queries as Batch;
}

export type FieldErrors = Record<string, string[]>;

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: FieldErrors };

export function ok(): ActionResult<undefined>;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

export function fail(error: string, fieldErrors?: FieldErrors): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

/** Convierte los errores de Zod al formato plano que consumen los formularios. */
export function fromZod(error: z.ZodError): ActionResult<never> {
  const fieldErrors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  const first = error.issues[0]?.message ?? "Revisa los datos";
  return { ok: false, error: first, fieldErrors };
}

/**
 * El driver HTTP de Neon no tiene transacciones interactivas: no se puede leer
 * un id generado y usarlo en la siguiente escritura dentro de la misma
 * transacción. Por eso los ids se generan aquí, en JS, y las escrituras
 * relacionadas se mandan juntas con `db.batch()`, que sí es atómico.
 *
 * Es lo que garantiza que un gasto y sus cuotas entren o fallen juntos: un
 * gasto sin sus cuotas mostraría un monto neto equivocado en el análisis.
 */
export function newId(): string {
  return crypto.randomUUID();
}

/** Normaliza campos de texto opcionales: "" y solo espacios se guardan como NULL. */
export function nullIfEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
