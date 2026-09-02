"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { people, transactions, transactionSplits } from "@/db/schema";
import { requireUserId } from "@/auth";
import { transactionSchema, type TransactionInput } from "@/lib/validation/schemas";
import {
  asBatch,
  fail,
  fromZod,
  newId,
  nullIfEmpty,
  ok,
  type ActionResult,
} from "./_shared";

function revalidateEverything() {
  // Cualquier movimiento cambia saldos, análisis y deudas a la vez, porque todo
  // se deriva de la misma tabla. Revalidar por separado dejaría vistas viejas.
  revalidatePath("/", "layout");
}

/**
 * Resuelve los ids de las personas que aparecen en las cuotas, creando las que
 * se escribieron al vuelo.
 *
 * Se hace ANTES del lote atómico a propósito: si el gasto luego falla, lo peor
 * que queda es una persona sin movimientos, que es inofensivo. Al revés —
 * cuotas apuntando a una persona que no existe — sería una violación de la
 * llave foránea.
 */
async function resolvePeople(
  userId: string,
  splits: { personId?: string; personName?: string }[],
): Promise<Map<number, string>> {
  const resolved = new Map<number, string>();
  const existing = await db
    .select({ id: people.id, name: people.name })
    .from(people)
    .where(eq(people.userId, userId));

  const byName = new Map(existing.map((p) => [p.name.toLowerCase(), p.id]));

  for (const [index, split] of splits.entries()) {
    if (split.personId) {
      resolved.set(index, split.personId);
      continue;
    }
    const name = split.personName?.trim();
    if (!name) continue;

    const found = byName.get(name.toLowerCase());
    if (found) {
      resolved.set(index, found);
      continue;
    }

    const id = newId();
    await db.insert(people).values({ id, userId, name }).onConflictDoNothing();
    byName.set(name.toLowerCase(), id);
    resolved.set(index, id);
  }

  return resolved;
}

export async function saveTransaction(
  input: TransactionInput,
): Promise<ActionResult<{ id: string }>> {
  const userId = await requireUserId();

  const parsed = transactionSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const data = parsed.data;

  const isEdit = Boolean(data.id);
  const transactionId = data.id ?? newId();

  const base = {
    id: transactionId,
    userId,
    amount: data.amount,
    date: data.date,
    description: data.description ?? "",
    notes: nullIfEmpty(data.notes),
    updatedAt: new Date(),
  };

  const row =
    data.type === "income"
      ? {
          ...base,
          type: "income" as const,
          toAccountId: data.toAccountId,
          fromAccountId: null,
          categoryId: data.categoryId,
          debtId: null,
        }
      : data.type === "expense"
        ? {
            ...base,
            type: "expense" as const,
            fromAccountId: data.fromAccountId,
            toAccountId: null,
            categoryId: data.categoryId,
            debtId: null,
          }
        : {
            ...base,
            type: "transfer" as const,
            fromAccountId: data.fromAccountId,
            toAccountId: data.toAccountId,
            categoryId: null,
            debtId: null,
          };

  const splitInputs = data.type === "expense" ? data.splits : [];
  const peopleIds = splitInputs.length ? await resolvePeople(userId, splitInputs) : new Map();

  const splitRows = splitInputs.flatMap((split, index) => {
    const personId = peopleIds.get(index);
    if (!personId) return [];
    return [
      {
        id: newId(),
        userId,
        transactionId,
        personId,
        amount: split.amount,
        status: split.settled ? ("settled" as const) : ("pending" as const),
        settledAccountId: split.settled ? (split.settledAccountId ?? null) : null,
        settledDate: split.settled ? (split.settledDate ?? data.date) : null,
      },
    ];
  });

  try {
    if (isEdit) {
      const [existing] = await db
        .select({ id: transactions.id })
        .from(transactions)
        .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)))
        .limit(1);
      if (!existing) return fail("Ese movimiento no existe o no es tuyo");

      // Las cuotas se reemplazan enteras en vez de reconciliarse una por una:
      // más simple y sin estados intermedios en los que el neto quedaría mal.
      await db.batch(
        asBatch([
          db.update(transactions).set(row).where(eq(transactions.id, transactionId)),
          db
            .delete(transactionSplits)
            .where(eq(transactionSplits.transactionId, transactionId)),
          ...(splitRows.length ? [db.insert(transactionSplits).values(splitRows)] : []),
        ]),
      );
    } else {
      await db.batch(
        asBatch([
          db.insert(transactions).values(row),
          ...(splitRows.length ? [db.insert(transactionSplits).values(splitRows)] : []),
        ]),
      );
    }
  } catch (error) {
    return fail(describeDbError(error));
  }

  revalidateEverything();
  return ok({ id: transactionId });
}

export async function deleteTransaction(id: string): Promise<ActionResult> {
  const userId = await requireUserId();

  const deleted = await db
    .delete(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .returning({ id: transactions.id });

  if (deleted.length === 0) return fail("Ese movimiento no existe o no es tuyo");

  revalidateEverything();
  return ok();
}

/**
 * Traduce los errores de la base de datos a algo accionable.
 *
 * Los CHECK del esquema son la última línea de defensa contra un movimiento mal
 * formado; si uno salta, es un bug nuestro, no un dato que la persona pueda
 * arreglar escribiendo distinto.
 */
function describeDbError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("transactions_shape")) {
    return "El movimiento quedó mal formado (cuentas o categoría inconsistentes con el tipo).";
  }
  if (message.includes("amount_positive")) {
    return "El monto debe ser mayor que cero.";
  }
  if (message.includes("splits_settled_shape")) {
    return "Una cuota marcada como pagada necesita cuenta destino y fecha.";
  }
  return "No se pudo guardar el movimiento. Intenta de nuevo.";
}
