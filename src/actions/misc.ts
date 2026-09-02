"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  categories,
  people,
  transactions,
  transactionSplits,
  userSettings,
} from "@/db/schema";
import { requireUserId } from "@/auth";
import {
  categorySchema,
  personSchema,
  settingsSchema,
  settleSplitSchema,
} from "@/lib/validation/schemas";
import { fail, fromZod, newId, ok, type ActionResult } from "./_shared";

/* ------------------------------------------------------------------ *
 * Categorías
 * ------------------------------------------------------------------ */

export async function saveCategory(input: unknown): Promise<ActionResult<{ id: string }>> {
  const userId = await requireUserId();

  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const data = parsed.data;

  const values = {
    userId,
    name: data.name,
    kind: data.kind,
    color: data.color ?? null,
    icon: data.icon ?? null,
  };

  try {
    if (data.id) {
      const updated = await db
        .update(categories)
        .set(values)
        .where(and(eq(categories.id, data.id), eq(categories.userId, userId)))
        .returning({ id: categories.id });
      if (updated.length === 0) return fail("Esa categoría no existe o no es tuya");
      revalidatePath("/", "layout");
      return ok({ id: data.id });
    }

    const id = newId();
    await db.insert(categories).values({ ...values, id });
    revalidatePath("/", "layout");
    return ok({ id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("categories_user_name_kind_idx")) {
      return fail(`Ya tienes una categoría de ${data.kind === "income" ? "ingreso" : "egreso"} llamada "${data.name}"`);
    }
    throw error;
  }
}

/**
 * Archiva si la categoría ya tiene movimientos, borra si no.
 *
 * Borrar una categoría en uso reescribiría el pasado: los gastos de meses
 * anteriores quedarían sin clasificar y el análisis histórico cambiaría solo.
 */
export async function deleteCategory(id: string): Promise<ActionResult> {
  const userId = await requireUserId();

  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.categoryId, id)));

  if (count > 0) {
    await db
      .update(categories)
      .set({ archived: true })
      .where(and(eq(categories.id, id), eq(categories.userId, userId)));
  } else {
    await db
      .delete(categories)
      .where(and(eq(categories.id, id), eq(categories.userId, userId)));
  }

  revalidatePath("/", "layout");
  return ok();
}

/* ------------------------------------------------------------------ *
 * Personas
 * ------------------------------------------------------------------ */

export async function savePerson(input: unknown): Promise<ActionResult<{ id: string }>> {
  const userId = await requireUserId();

  const parsed = personSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const data = parsed.data;

  if (data.id) {
    await db
      .update(people)
      .set({ name: data.name, color: data.color ?? null })
      .where(and(eq(people.id, data.id), eq(people.userId, userId)));
    revalidatePath("/", "layout");
    return ok({ id: data.id });
  }

  const id = newId();
  await db.insert(people).values({ id, userId, name: data.name, color: data.color ?? null });
  revalidatePath("/", "layout");
  return ok({ id });
}

/* ------------------------------------------------------------------ *
 * Cuotas por cobrar
 * ------------------------------------------------------------------ */

/**
 * Marca una cuota como cobrada.
 *
 * El dinero entra a la cuenta que elijas, así que el saldo sube. El análisis
 * NO cambia: ese gasto ya contaba neto desde que lo registraste, y esa es
 * exactamente la propiedad que evita que tus gráficas se muevan solas.
 */
export async function settleSplit(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId();

  const parsed = settleSplitSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const data = parsed.data;

  const updated = await db
    .update(transactionSplits)
    .set({
      status: "settled",
      settledAccountId: data.settledAccountId,
      settledDate: data.settledDate,
    })
    .where(
      and(eq(transactionSplits.id, data.splitId), eq(transactionSplits.userId, userId)),
    )
    .returning({ id: transactionSplits.id });

  if (updated.length === 0) return fail("Esa cuota no existe o no es tuya");

  revalidatePath("/", "layout");
  return ok();
}

/** Deshace el cobro, por si lo marcaste por error. */
export async function unsettleSplit(splitId: string): Promise<ActionResult> {
  const userId = await requireUserId();

  await db
    .update(transactionSplits)
    .set({ status: "pending", settledAccountId: null, settledDate: null })
    .where(and(eq(transactionSplits.id, splitId), eq(transactionSplits.userId, userId)));

  revalidatePath("/", "layout");
  return ok();
}

/* ------------------------------------------------------------------ *
 * Configuración
 * ------------------------------------------------------------------ */

export async function saveSettings(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId();

  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const data = parsed.data;

  await db
    .insert(userSettings)
    .values({ userId, currency: data.currency.toUpperCase(), locale: data.locale })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { currency: data.currency.toUpperCase(), locale: data.locale },
    });

  revalidatePath("/", "layout");
  return ok();
}
