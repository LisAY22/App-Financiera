import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { SQL } from "drizzle-orm";
import * as schema from "@/db/schema";

/**
 * Postgres real, en memoria, por archivo de test.
 *
 * Las reglas que importan en esta app (monto neto por cuotas, doble conteo de
 * deudas, agrupación por semana/mes/año) están escritas en SQL, así que probarlas
 * contra un doble en JS no probaría nada. PGlite corre el mismo motor —incluidos
 * los CHECK del esquema y `date_trunc`— sin depender de la red.
 */
export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });

  const migration = readFileSync(
    path.resolve(__dirname, "../../drizzle/0000_init.sql"),
    "utf8",
  );

  // drizzle-kit separa las sentencias con este marcador.
  for (const statement of migration.split("--> statement-breakpoint")) {
    const trimmed = statement.trim();
    if (trimmed) await client.exec(trimmed);
  }

  async function rawRows<T extends Record<string, unknown>>(query: SQL): Promise<T[]> {
    const result = await db.execute<T>(query);
    return result.rows as T[];
  }

  return { client, db, rawRows };
}

export const USER_ID = "user-test";

export async function seedUser(db: TestDb) {
  await db
    .insert(schema.authUsers)
    .values({ id: USER_ID, name: "Prueba", email: "prueba@example.com" });
}
