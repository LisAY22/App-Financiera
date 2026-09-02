import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, userSettings } from "@/db/schema";

/**
 * Categoría reservada. Los pagos de deuda la usan por defecto para que el
 * desglose por categoría funcione por el camino normal, sin categorías
 * sintéticas inventadas en la capa de análisis.
 */
export const DEBT_PAYMENT_CATEGORY = "Pago de deudas";
export const INTEREST_CATEGORY = "Intereses";

const DEFAULT_EXPENSE_CATEGORIES = [
  { name: "Comida", icon: "utensils" },
  { name: "Transporte", icon: "bus" },
  { name: "Vivienda", icon: "house" },
  { name: "Servicios", icon: "zap" },
  { name: "Salud", icon: "heart-pulse" },
  { name: "Entretenimiento", icon: "clapperboard" },
  { name: "Compras", icon: "shopping-bag" },
  { name: "Educación", icon: "graduation-cap" },
  { name: DEBT_PAYMENT_CATEGORY, icon: "landmark" },
  { name: "Otros", icon: "circle-ellipsis" },
];

const DEFAULT_INCOME_CATEGORIES = [
  { name: "Salario", icon: "wallet" },
  { name: "Freelance", icon: "laptop" },
  { name: INTEREST_CATEGORY, icon: "trending-up" },
  { name: "Regalos", icon: "gift" },
  { name: "Otros", icon: "circle-ellipsis" },
];

/**
 * Siembra las categorías la primera vez que alguien entra.
 *
 * Es idempotente vía `user_settings.seeded_at`: si dos requests entran a la vez
 * en el primer login, el índice único `(user_id, kind, name)` impide duplicados
 * y `onConflictDoNothing` absorbe la carrera sin reventar la sesión.
 */
export async function seedDefaultsIfNeeded(userId: string): Promise<void> {
  const [settings] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  if (settings?.seededAt) return;

  const rows = [
    ...DEFAULT_EXPENSE_CATEGORIES.map((c, i) => ({
      userId,
      name: c.name,
      kind: "expense" as const,
      icon: c.icon,
      sortOrder: i,
    })),
    ...DEFAULT_INCOME_CATEGORIES.map((c, i) => ({
      userId,
      name: c.name,
      kind: "income" as const,
      icon: c.icon,
      sortOrder: i,
    })),
  ];

  await db.insert(categories).values(rows).onConflictDoNothing();

  await db
    .insert(userSettings)
    .values({ userId, seededAt: new Date() })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { seededAt: new Date() },
    });
}

/** Busca una categoría reservada por nombre, creándola si alguien la borró. */
export async function ensureCategory(
  userId: string,
  name: string,
  kind: "income" | "expense",
): Promise<string> {
  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.userId, userId),
        eq(categories.name, name),
        eq(categories.kind, kind),
      ),
    )
    .limit(1);

  if (existing) return existing.id;

  const [created] = await db
    .insert(categories)
    .values({ userId, name, kind })
    .onConflictDoNothing()
    .returning({ id: categories.id });

  if (created) return created.id;

  // Otra petición la creó entre nuestro SELECT y el INSERT.
  const [raced] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.userId, userId),
        eq(categories.name, name),
        eq(categories.kind, kind),
      ),
    )
    .limit(1);

  if (!raced) throw new Error(`No se pudo crear la categoría "${name}"`);
  return raced.id;
}
