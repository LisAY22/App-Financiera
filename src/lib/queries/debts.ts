import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, rawRows } from "@/db";
import { debts, people, transactions } from "@/db/schema";
import type { Debt } from "@/db/schema";
import type { Cents } from "@/lib/money";
import {
  enumerateBuckets,
  fromIso,
  todayIso,
  type DateRange,
  type Granularity,
  type IsoDate,
} from "@/lib/periods";
import { differenceInCalendarDays } from "date-fns";

/* ==================================================================== *
 * Estado de las deudas
 * ==================================================================== */

/*
  La referencia a la tabla externa va calificada a mano (`"debts"."id"`).
  Drizzle omite el nombre de la tabla cuando cree que no hace falta, y dentro de
  una subconsulta correlacionada ese `"id"` desnudo resolvería contra
  `transactions`: la condición no se cumpliría nunca y todas las deudas
  aparecerían sin pagos. Falla en silencio, así que no se deja al azar.
*/
const paidExpression = sql<number>`COALESCE((
  SELECT SUM(t.amount) FROM ${transactions} t
  WHERE t.debt_id = ${sql.raw('"debts"."id"')} AND t.type = 'debt_payment'
), 0)`;

export type DebtWithProgress = Debt & {
  paid: Cents;
  remaining: Cents;
  settled: boolean;
  creditorName: string;
  /** Días para el vencimiento; negativo si ya venció. `null` si no tiene fecha. */
  daysUntilDue: number | null;
  progress: number;
};

export async function getDebts(userId: string): Promise<DebtWithProgress[]> {
  const rows = await db
    .select({
      debt: debts,
      personName: people.name,
      paid: paidExpression.mapWith(Number),
    })
    .from(debts)
    .leftJoin(people, eq(people.id, debts.creditorPersonId))
    .where(eq(debts.userId, userId))
    .orderBy(sql`${debts.dueDate} NULLS LAST`, debts.createdAt);

  const today = todayIso();

  return rows.map(({ debt, personName, paid }) => {
    const remaining = Math.max(debt.originalAmount - paid, 0);
    return {
      ...debt,
      creditorName: personName ?? debt.creditorName,
      paid,
      remaining,
      settled: remaining <= 0,
      daysUntilDue: debt.dueDate
        ? differenceInCalendarDays(fromIso(debt.dueDate), fromIso(today))
        : null,
      progress:
        debt.originalAmount === 0 ? 100 : Math.min((paid / debt.originalAmount) * 100, 100),
    };
  });
}

export async function getDebt(
  userId: string,
  debtId: string,
): Promise<DebtWithProgress | null> {
  const all = await getDebts(userId);
  return all.find((d) => d.id === debtId) ?? null;
}

/* ==================================================================== *
 * Detector de duplicados
 * ==================================================================== */

export type DuplicateCandidate = {
  transactionId: string;
  date: IsoDate;
  description: string;
  amount: Cents;
  categoryName: string | null;
};

/**
 * Busca un egreso ya registrado que probablemente sea la compra que originó
 * esta deuda.
 *
 * Sin esto, la forma más fácil de arruinar el análisis es registrar la compra
 * como gasto y luego crear la deuda: el mismo dinero contaría dos veces. La
 * ventana de 60 días y la tolerancia de ±5 % cubren el caso real (registras la
 * compra, y días después decides llevar la deuda) sin llenar de falsos
 * positivos a quien tiene muchos gastos parecidos.
 */
export async function findPossibleOriginExpense(
  userId: string,
  amount: Cents,
  { tolerancePct = 5, windowDays = 60 } = {},
): Promise<DuplicateCandidate[]> {
  const low = Math.round(amount * (1 - tolerancePct / 100));
  const high = Math.round(amount * (1 + tolerancePct / 100));

  const rows = await rawRows<{
    id: string;
    date: string;
    description: string;
    amount: string | number;
    category_name: string | null;
  }>(sql`
    SELECT t.id, t.date, t.description, t.amount, c.name AS category_name
    FROM ${transactions} t
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.user_id = ${userId}
      AND t.type = 'expense'
      AND t.amount BETWEEN ${low} AND ${high}
      AND t.date >= CURRENT_DATE - ${sql.raw(String(windowDays))} * INTERVAL '1 day'
      AND NOT EXISTS (
        SELECT 1 FROM ${debts} d WHERE d.origin_transaction_id = t.id
      )
    ORDER BY ABS(t.amount - ${amount}), t.date DESC
    LIMIT 5
  `);

  return rows.map((r) => ({
    transactionId: r.id,
    date: String(r.date).slice(0, 10),
    description: r.description,
    amount: Number(r.amount),
    categoryName: r.category_name,
  }));
}

/** El aviso inverso: al registrar un egreso, ¿se parece al pago de una deuda? */
export async function findMatchingOpenDebt(
  userId: string,
  amount: Cents,
): Promise<{ id: string; description: string; creditorName: string } | null> {
  const open = (await getDebts(userId)).filter((d) => !d.settled);
  const match = open.find((d) => Math.abs(d.remaining - amount) <= amount * 0.02);
  return match
    ? { id: match.id, description: match.description, creditorName: match.creditorName }
    : null;
}

/* ==================================================================== *
 * Gráficas de deuda
 * ==================================================================== */

export type DebtBalancePoint = {
  bucket: IsoDate;
  outstanding: Cents;
  paid: Cents;
};

/**
 * Evolución del total adeudado + cuánto pagaste en cada periodo.
 *
 * `outstanding` es acumulado (arrastra todo lo anterior al rango visible);
 * `paid` es el flujo del periodo.
 */
export async function getDebtSeries(
  userId: string,
  range: DateRange,
  granularity: Granularity,
): Promise<DebtBalancePoint[]> {
  const rows = await rawRows<{
    bucket: string;
    incurred: string | number;
    paid: string | number;
  }>(sql`
    SELECT ${sql.raw(`date_trunc('${granularity}', d.date)::date`)} AS bucket,
           SUM(d.incurred) AS incurred, SUM(d.paid) AS paid
    FROM (
      SELECT de.start_date AS date, de.original_amount AS incurred, 0 AS paid
      FROM ${debts} de WHERE de.user_id = ${userId}
      UNION ALL
      SELECT t.date, 0 AS incurred, t.amount AS paid
      FROM ${transactions} t
      WHERE t.user_id = ${userId} AND t.type = 'debt_payment'
    ) d
    WHERE d.date <= ${range.to}
    GROUP BY 1
    ORDER BY 1
  `);

  const incurredBy = new Map<string, number>();
  const paidBy = new Map<string, number>();
  for (const r of rows) {
    const key = String(r.bucket).slice(0, 10);
    incurredBy.set(key, (incurredBy.get(key) ?? 0) + Number(r.incurred));
    paidBy.set(key, (paidBy.get(key) ?? 0) + Number(r.paid));
  }

  const buckets = enumerateBuckets(range, granularity);
  if (buckets.length === 0) return [];
  const first = buckets[0];

  let outstanding = 0;
  for (const [key, v] of incurredBy) if (key < first) outstanding += v;
  for (const [key, v] of paidBy) if (key < first) outstanding -= v;

  return buckets.map((bucket) => {
    outstanding += (incurredBy.get(bucket) ?? 0) - (paidBy.get(bucket) ?? 0);
    return {
      bucket,
      outstanding: Math.max(outstanding, 0),
      paid: paidBy.get(bucket) ?? 0,
    };
  });
}

export type CreditorSlice = { name: string; remaining: Cents; share: number };

export async function getDebtByCreditor(userId: string): Promise<CreditorSlice[]> {
  const all = (await getDebts(userId)).filter((d) => !d.settled);
  const byCreditor = new Map<string, number>();
  for (const d of all) {
    byCreditor.set(d.creditorName, (byCreditor.get(d.creditorName) ?? 0) + d.remaining);
  }
  const total = [...byCreditor.values()].reduce((a, b) => a + b, 0);
  return [...byCreditor.entries()]
    .map(([name, remaining]) => ({
      name,
      remaining,
      share: total === 0 ? 0 : (remaining / total) * 100,
    }))
    .sort((a, b) => b.remaining - a.remaining);
}

export type PayoffProjection = {
  totalRemaining: Cents;
  /** Promedio pagado por mes en los últimos 6 meses con pagos */
  avgMonthlyPayment: Cents;
  monthsToFree: number | null;
  estimatedDate: IsoDate | null;
};

/**
 * A tu ritmo real de pago, ¿cuándo quedas libre?
 *
 * Promedia solo los meses en que sí pagaste algo: incluir los meses sin pagos
 * daría una proyección artificialmente pesimista para quien paga en bloques.
 */
export async function getPayoffProjection(userId: string): Promise<PayoffProjection> {
  const debtsList = await getDebts(userId);
  const totalRemaining = debtsList
    .filter((d) => !d.settled)
    .reduce((s, d) => s + d.remaining, 0);

  const rows = await rawRows<{ bucket: string; paid: string | number }>(sql`
    SELECT date_trunc('month', t.date)::date AS bucket, SUM(t.amount) AS paid
    FROM ${transactions} t
    WHERE t.user_id = ${userId} AND t.type = 'debt_payment'
      AND t.date >= CURRENT_DATE - INTERVAL '6 months'
    GROUP BY 1
    ORDER BY 1
  `);

  const monthly = rows.map((r) => Number(r.paid)).filter((v) => v > 0);
  const avg =
    monthly.length === 0
      ? 0
      : Math.round(monthly.reduce((a, b) => a + b, 0) / monthly.length);

  if (totalRemaining === 0) {
    return { totalRemaining: 0, avgMonthlyPayment: avg, monthsToFree: 0, estimatedDate: null };
  }
  if (avg === 0) {
    return {
      totalRemaining,
      avgMonthlyPayment: 0,
      monthsToFree: null,
      estimatedDate: null,
    };
  }

  const months = Math.ceil(totalRemaining / avg);
  const target = new Date();
  target.setMonth(target.getMonth() + months);

  return {
    totalRemaining,
    avgMonthlyPayment: avg,
    monthsToFree: months,
    estimatedDate: target.toISOString().slice(0, 10),
  };
}

/** Cuánto pagaste de deudas dentro de un rango. */
export async function getDebtPaidInRange(
  userId: string,
  range: DateRange,
): Promise<Cents> {
  const [row] = await db
    .select({ total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`.mapWith(Number) })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.type, "debt_payment"),
        sql`${transactions.date} BETWEEN ${range.from} AND ${range.to}`,
      ),
    );
  return row?.total ?? 0;
}
