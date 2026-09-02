import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import type { SQL } from "drizzle-orm";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "Falta DATABASE_URL. Copia .env.example a .env.local y pega la cadena de conexión de Neon.",
  );
}

/**
 * Driver HTTP de Neon: cada consulta es un fetch, sin conexión persistente.
 * Es lo correcto en Vercel, donde la función no existe entre requests y un
 * pool TCP tradicional se quedaría colgando o agotaría conexiones.
 */
const sql = neon(process.env.DATABASE_URL);

export const db = drizzle(sql, { schema });
export { schema };

/**
 * Ejecuta SQL crudo y devuelve solo las filas.
 *
 * El driver de Neon envuelve el resultado en `{ rows, fields, ... }`; este
 * helper evita que cada consulta de análisis tenga que acordarse de `.rows`.
 */
export async function rawRows<T extends Record<string, unknown>>(
  query: SQL,
): Promise<T[]> {
  const result = await db.execute<T>(query);
  return result.rows;
}
