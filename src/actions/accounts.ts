"use server";

import { revalidatePath } from "next/cache";
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, transactions, transactionSplits } from "@/db/schema";
import { requireUserId } from "@/auth";
import { ensureCategory, INTEREST_CATEGORY } from "@/db/seed-defaults";
import { accountSchema, recordInterestSchema } from "@/lib/validation/schemas";
import { fail, fromZod, newId, nullIfEmpty, ok, type ActionResult } from "./_shared";

export async function saveAccount(input: unknown): Promise<ActionResult<{ id: string }>> {
  const userId = await requireUserId();

  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const data = parsed.data;

  const values = {
    userId,
    name: data.name,
    type: data.type,
    institution: nullIfEmpty(data.institution),
    initialBalance: data.initialBalance,
    color: data.color ?? null,
    interestEnabled: data.interestEnabled,
    // Los campos de interés se limpian cuando el switch está apagado, para que
    // una tasa vieja no reaparezca si alguien lo vuelve a encender.
    interestAnnualRate: data.interestEnabled ? String(data.interestAnnualRate) : null,
    interestCompounding: data.interestEnabled ? (data.interestCompounding ?? null) : null,
    interestStartDate: data.interestEnabled ? (data.interestStartDate ?? null) : null,
  };

  if (data.id) {
    const updated = await db
      .update(accounts)
      .set(values)
      .where(and(eq(accounts.id, data.id), eq(accounts.userId, userId)))
      .returning({ id: accounts.id });
    if (updated.length === 0) return fail("Esa cuenta no existe o no es tuya");
    revalidatePath("/", "layout");
    return ok({ id: data.id });
  }

  const id = newId();
  await db.insert(accounts).values({ ...values, id });
  revalidatePath("/", "layout");
  return ok({ id });
}

/**
 * Archivar en vez de borrar cuando la cuenta ya tiene historial.
 *
 * Borrarla obligaría a borrar o mutilar movimientos pasados, y el análisis de
 * meses anteriores dejaría de cuadrar. Una cuenta archivada desaparece de los
 * selectores pero conserva su historia.
 */
export async function deleteAccount(id: string): Promise<ActionResult> {
  const userId = await requireUserId();

  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        or(eq(transactions.fromAccountId, id), eq(transactions.toAccountId, id)),
      ),
    );

  const [{ splitCount }] = await db
    .select({ splitCount: sql<number>`COUNT(*)`.mapWith(Number) })
    .from(transactionSplits)
    .where(
      and(
        eq(transactionSplits.userId, userId),
        eq(transactionSplits.settledAccountId, id),
      ),
    );

  if (count > 0 || splitCount > 0) {
    const archived = await db
      .update(accounts)
      .set({ archived: true })
      .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
      .returning({ id: accounts.id });
    if (archived.length === 0) return fail("Esa cuenta no existe o no es tuya");
    revalidatePath("/", "layout");
    return ok();
  }

  const deleted = await db
    .delete(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
    .returning({ id: accounts.id });
  if (deleted.length === 0) return fail("Esa cuenta no existe o no es tuya");

  revalidatePath("/", "layout");
  return ok();
}

export async function unarchiveAccount(id: string): Promise<ActionResult> {
  const userId = await requireUserId();
  await db
    .update(accounts)
    .set({ archived: false })
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)));
  revalidatePath("/", "layout");
  return ok();
}

/**
 * Registra el interés que el banco realmente abonó.
 *
 * La app calcula una proyección, pero NUNCA suma intereses al saldo por su
 * cuenta: si lo hiciera, tu saldo dejaría de cuadrar con el del banco en cuanto
 * el banco pagara una cantidad distinta. Este paso siempre lo confirmas tú.
 */
export async function recordInterest(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId();

  const parsed = recordInterestSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const { accountId, amount, date } = parsed.data;

  const [account] = await db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
    .limit(1);
  if (!account) return fail("Esa cuenta no existe o no es tuya");

  const categoryId = await ensureCategory(userId, INTEREST_CATEGORY, "income");

  await db.insert(transactions).values({
    id: newId(),
    userId,
    type: "income",
    amount,
    date,
    description: `Intereses · ${account.name}`,
    categoryId,
    toAccountId: accountId,
  });

  revalidatePath("/", "layout");
  return ok();
}
