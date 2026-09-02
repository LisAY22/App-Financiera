import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, people, userSettings } from "@/db/schema";
import type { Category, Person } from "@/db/schema";
import { DEFAULT_CURRENCY, DEFAULT_LOCALE } from "@/lib/money";

export async function getCategories(
  userId: string,
  { includeArchived = false } = {},
): Promise<Category[]> {
  return db
    .select()
    .from(categories)
    .where(
      includeArchived
        ? eq(categories.userId, userId)
        : and(eq(categories.userId, userId), eq(categories.archived, false)),
    )
    .orderBy(asc(categories.kind), asc(categories.sortOrder), asc(categories.name));
}

export async function getPeople(userId: string): Promise<Person[]> {
  return db
    .select()
    .from(people)
    .where(eq(people.userId, userId))
    .orderBy(asc(people.name));
}

export type Settings = { currency: string; locale: string };

/** Nunca falla por falta de fila: devuelve los valores por defecto. */
export async function getSettings(userId: string): Promise<Settings> {
  const [row] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  return {
    currency: row?.currency ?? DEFAULT_CURRENCY,
    locale: row?.locale ?? DEFAULT_LOCALE,
  };
}
