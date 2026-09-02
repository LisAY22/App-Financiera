"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { debts, people, transactions } from "@/db/schema";
import { requireUserId } from "@/auth";
import { DEBT_PAYMENT_CATEGORY, ensureCategory } from "@/db/seed-defaults";
import { findPossibleOriginExpense } from "@/lib/queries/debts";
import { countsAsExpenseFor } from "@/lib/debt-rules";
import { debtPaymentSchema, debtSchema } from "@/lib/validation/schemas";
import {
  asBatch,
  fail,
  fromZod,
  newId,
  nullIfEmpty,
  ok,
  type ActionResult,
} from "./_shared";

/** Expone el detector de duplicados al formulario, en vivo mientras escribes. */
export async function checkForDuplicateExpense(amountCents: number) {
  const userId = await requireUserId();
  if (!Number.isFinite(amountCents) || amountCents <= 0) return [];
  return findPossibleOriginExpense(userId, amountCents);
}

export async function saveDebt(input: unknown): Promise<ActionResult<{ id: string }>> {
  const userId = await requireUserId();

  const parsed = debtSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const data = parsed.data;

  /*
    Aquí vive la regla anti-doble-conteo: `countsAsExpense` se DERIVA del
    origen, no es una casilla que se pueda marcar mal. Si ya registraste la
    compra como gasto, sus pagos no vuelven a contar; si no la registraste,
    los pagos son el egreso.
  */
  const countsAsExpense = countsAsExpenseFor(data.origin);

  // Vincula al acreedor con la lista de personas para poder agrupar deudas y
  // cuotas por la misma persona.
  let creditorPersonId = data.creditorPersonId ?? null;
  if (!creditorPersonId && data.creditorName) {
    const [existing] = await db
      .select({ id: people.id })
      .from(people)
      .where(and(eq(people.userId, userId), eq(people.name, data.creditorName)))
      .limit(1);

    if (existing) {
      creditorPersonId = existing.id;
    } else {
      const id = newId();
      await db
        .insert(people)
        .values({ id, userId, name: data.creditorName })
        .onConflictDoNothing();
      creditorPersonId = id;
    }
  }

  const values = {
    userId,
    description: data.description,
    creditorPersonId,
    creditorName: data.creditorName,
    originalAmount: data.originalAmount,
    startDate: data.startDate,
    dueDate: nullIfEmpty(data.dueDate),
    origin: data.origin,
    countsAsExpense,
    originTransactionId: data.originTransactionId ?? null,
    notes: nullIfEmpty(data.notes),
  };

  if (data.id) {
    const updated = await db
      .update(debts)
      .set(values)
      .where(and(eq(debts.id, data.id), eq(debts.userId, userId)))
      .returning({ id: debts.id });
    if (updated.length === 0) return fail("Esa deuda no existe o no es tuya");
    revalidatePath("/", "layout");
    return ok({ id: data.id });
  }

  const id = newId();

  /*
    Un préstamo en efectivo SÍ mueve saldo al crearse: el dinero entró a tu
    cuenta. Se registra como `debt_disbursement`, un tipo que suma al saldo pero
    queda fuera del análisis de ingresos — porque que te presten dinero no es
    ganarlo.
  */
  const disbursement =
    data.origin === "cash_loan" && data.disbursementAccountId
      ? {
          id: newId(),
          userId,
          type: "debt_disbursement" as const,
          amount: data.originalAmount,
          date: data.startDate,
          description: `Préstamo recibido · ${data.creditorName}`,
          toAccountId: data.disbursementAccountId,
          debtId: id,
        }
      : null;

  await db.batch(
    asBatch([
      db.insert(debts).values({ ...values, id }),
      ...(disbursement ? [db.insert(transactions).values(disbursement)] : []),
    ]),
  );

  revalidatePath("/", "layout");
  return ok({ id });
}

export async function deleteDebt(id: string): Promise<ActionResult> {
  const userId = await requireUserId();
  // Los movimientos de la deuda caen con ella (ON DELETE CASCADE): dejar pagos
  // huérfanos de una deuda borrada descuadraría los saldos.
  const deleted = await db
    .delete(debts)
    .where(and(eq(debts.id, id), eq(debts.userId, userId)))
    .returning({ id: debts.id });
  if (deleted.length === 0) return fail("Esa deuda no existe o no es tuya");
  revalidatePath("/", "layout");
  return ok();
}

/**
 * Registra un pago de deuda.
 *
 * Siempre baja el saldo de la cuenta de origen. Si cuenta o no como egreso en
 * el análisis lo decide `debts.counts_as_expense`, ya fijado al crear la deuda;
 * este movimiento no vuelve a preguntarlo.
 */
export async function payDebt(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId();

  const parsed = debtPaymentSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const data = parsed.data;

  const [debt] = await db
    .select({
      id: debts.id,
      description: debts.description,
      creditorName: debts.creditorName,
    })
    .from(debts)
    .where(and(eq(debts.id, data.debtId), eq(debts.userId, userId)))
    .limit(1);
  if (!debt) return fail("Esa deuda no existe o no es tuya");

  const categoryId = await ensureCategory(userId, DEBT_PAYMENT_CATEGORY, "expense");

  await db.insert(transactions).values({
    id: newId(),
    userId,
    type: "debt_payment",
    amount: data.amount,
    date: data.date,
    description:
      nullIfEmpty(data.description) ?? `Pago · ${debt.description} (${debt.creditorName})`,
    categoryId,
    fromAccountId: data.fromAccountId,
    debtId: debt.id,
  });

  revalidatePath("/", "layout");
  return ok();
}

/**
 * Acepta el vínculo que propuso el detector de duplicados.
 *
 * Al confirmar que un gasto ya registrado es la compra que originó la deuda, el
 * origen pasa a `purchase_tracked` y sus pagos dejan de contar como egreso: el
 * dinero ya se contó una vez, en la fecha de la compra.
 */
export async function linkOriginExpense(
  debtId: string,
  transactionId: string,
): Promise<ActionResult> {
  const userId = await requireUserId();

  const updated = await db
    .update(debts)
    .set({
      origin: "purchase_tracked",
      countsAsExpense: false,
      originTransactionId: transactionId,
    })
    .where(and(eq(debts.id, debtId), eq(debts.userId, userId)))
    .returning({ id: debts.id });

  if (updated.length === 0) return fail("Esa deuda no existe o no es tuya");

  revalidatePath("/", "layout");
  return ok();
}
