import "server-only";
import { sql } from "drizzle-orm";
import { db, rawRows } from "@/db";
import {
  accounts,
  categories,
  debts,
  transactions,
  transactionSplits,
} from "@/db/schema";
import type { Cents } from "@/lib/money";
import {
  enumerateBuckets,
  type DateRange,
  type Granularity,
  type IsoDate,
} from "@/lib/periods";

/* ==================================================================== *
 * LAS DOS REGLAS DEL ANÁLISIS
 *
 * Viven aquí y solo aquí, en la CTE `flows`, para que sea imposible que una
 * gráfica las aplique y otra no.
 *
 * 1. NETO POR CUOTAS. Un gasto compartido guarda el monto bruto (lo que salió
 *    de tu cuenta), pero cuenta como `bruto − cuotas de otras personas` desde
 *    el momento en que lo registras, esté cobrado o no. Por eso el análisis
 *    nunca cambia retroactivamente cuando alguien te paga.
 *
 * 2. SIN DOBLE CONTEO DE DEUDAS. Un pago de deuda cuenta como egreso solo si
 *    `debts.counts_as_expense`, que se deriva del origen de la deuda. Si ya
 *    registraste la compra como gasto en su fecha, pagarla después solo mueve
 *    saldo.
 *
 * Las transferencias y los desembolsos de préstamo no aparecen en esta CTE en
 * absoluto: mover dinero de un bolsillo a otro no es ganar ni gastar.
 * ==================================================================== */
function flows(userId: string) {
  return sql`
    flows AS (
      -- Ingresos: monto tal cual
      SELECT t.id, t.date, 'income'::text AS direction, t.category_id,
             t.to_account_id AS account_id, t.amount AS amount
      FROM ${transactions} t
      WHERE t.user_id = ${userId} AND t.type = 'income'

      UNION ALL

      -- Egresos: monto NETO de las cuotas que otras personas cubren
      SELECT t.id, t.date, 'expense'::text AS direction, t.category_id,
             t.from_account_id AS account_id,
             t.amount - COALESCE((
               SELECT SUM(s.amount) FROM ${transactionSplits} s
               WHERE s.transaction_id = t.id
             ), 0) AS amount
      FROM ${transactions} t
      WHERE t.user_id = ${userId} AND t.type = 'expense'

      UNION ALL

      -- Pagos de deuda: egreso solo cuando la deuda no fue ya contada al comprar
      SELECT t.id, t.date, 'expense'::text AS direction, t.category_id,
             t.from_account_id AS account_id, t.amount AS amount
      FROM ${transactions} t
      JOIN ${debts} d ON d.id = t.debt_id
      WHERE t.user_id = ${userId} AND t.type = 'debt_payment' AND d.counts_as_expense
    )
  `;
}

/** `date_trunc` en el mismo origen de semana (lunes) que usa `periods.ts`. */
function truncExpr(granularity: Granularity) {
  return sql.raw(`date_trunc('${granularity}', f.date)::date`);
}

/* ==================================================================== *
 * 1. Ingresos vs egresos por periodo
 * ==================================================================== */

export type FlowPoint = {
  bucket: IsoDate;
  income: Cents;
  expense: Cents;
  net: Cents;
};

export async function getIncomeExpenseSeries(
  userId: string,
  range: DateRange,
  granularity: Granularity,
): Promise<FlowPoint[]> {
  const rows = await rawRows<{
    bucket: string;
    income: string | number;
    expense: string | number;
  }>(sql`
    WITH ${flows(userId)}
    SELECT ${truncExpr(granularity)} AS bucket,
           COALESCE(SUM(f.amount) FILTER (WHERE f.direction = 'income'), 0) AS income,
           COALESCE(SUM(f.amount) FILTER (WHERE f.direction = 'expense'), 0) AS expense
    FROM flows f
    WHERE f.date BETWEEN ${range.from} AND ${range.to}
    GROUP BY 1
    ORDER BY 1
  `);

  const byBucket = new Map<string, FlowPoint>();
  for (const r of rows) {
    const income = Number(r.income);
    const expense = Number(r.expense);
    byBucket.set(String(r.bucket).slice(0, 10), {
      bucket: String(r.bucket).slice(0, 10),
      income,
      expense,
      net: income - expense,
    });
  }

  // Rellena los periodos vacíos: un mes sin movimientos debe verse como un
  // hueco en cero, no desaparecer del eje.
  return enumerateBuckets(range, granularity).map(
    (bucket) => byBucket.get(bucket) ?? { bucket, income: 0, expense: 0, net: 0 },
  );
}

/* ==================================================================== *
 * 2. Desglose por categoría, con comparación contra el periodo anterior
 * ==================================================================== */

export type CategorySlice = {
  categoryId: string;
  name: string;
  color: string | null;
  icon: string | null;
  total: Cents;
  /** Mismo dato en el periodo inmediatamente anterior, para la variación */
  previous: Cents;
  share: number;
};

export async function getCategoryBreakdown(
  userId: string,
  range: DateRange,
  previous: DateRange,
  direction: "income" | "expense" = "expense",
): Promise<CategorySlice[]> {
  const rows = await rawRows<{
    category_id: string;
    name: string;
    color: string | null;
    icon: string | null;
    total: string | number;
    previous: string | number;
  }>(sql`
    WITH ${flows(userId)}
    SELECT c.id AS category_id, c.name, c.color, c.icon,
           COALESCE(SUM(f.amount) FILTER (
             WHERE f.date BETWEEN ${range.from} AND ${range.to}
           ), 0) AS total,
           COALESCE(SUM(f.amount) FILTER (
             WHERE f.date BETWEEN ${previous.from} AND ${previous.to}
           ), 0) AS previous
    FROM flows f
    JOIN ${categories} c ON c.id = f.category_id
    WHERE f.direction = ${direction}
      AND f.date BETWEEN ${previous.from} AND ${range.to}
    GROUP BY c.id, c.name, c.color, c.icon
    HAVING COALESCE(SUM(f.amount) FILTER (
             WHERE f.date BETWEEN ${range.from} AND ${range.to}
           ), 0) <> 0
        OR COALESCE(SUM(f.amount) FILTER (
             WHERE f.date BETWEEN ${previous.from} AND ${previous.to}
           ), 0) <> 0
    ORDER BY total DESC
  `);

  const slices = rows.map((r) => ({
    categoryId: r.category_id,
    name: r.name,
    color: r.color,
    icon: r.icon,
    total: Number(r.total),
    previous: Number(r.previous),
    share: 0,
  }));

  const grand = slices.reduce((sum, s) => sum + s.total, 0);
  for (const s of slices) s.share = grand === 0 ? 0 : (s.total / grand) * 100;
  return slices;
}

/* ==================================================================== *
 * 3. Tendencia por categoría (áreas apiladas)
 * ==================================================================== */

export type CategoryTrend = {
  buckets: IsoDate[];
  /** Una fila por categoría, alineada con `buckets` */
  series: { categoryId: string; name: string; values: Cents[] }[];
};

export async function getCategoryTrend(
  userId: string,
  range: DateRange,
  granularity: Granularity,
  /** Cuántas categorías mostrar antes de plegar el resto en "Otras" */
  topN = 6,
): Promise<CategoryTrend> {
  const rows = await rawRows<{
    bucket: string;
    category_id: string;
    name: string;
    total: string | number;
  }>(sql`
    WITH ${flows(userId)}
    SELECT ${truncExpr(granularity)} AS bucket, c.id AS category_id, c.name,
           SUM(f.amount) AS total
    FROM flows f
    JOIN ${categories} c ON c.id = f.category_id
    WHERE f.direction = 'expense' AND f.date BETWEEN ${range.from} AND ${range.to}
    GROUP BY 1, c.id, c.name
    ORDER BY 1
  `);

  const buckets = enumerateBuckets(range, granularity);
  const bucketIndex = new Map(buckets.map((b, i) => [b, i]));

  const totals = new Map<string, { name: string; total: number }>();
  for (const r of rows) {
    const prev = totals.get(r.category_id);
    totals.set(r.category_id, {
      name: r.name,
      total: (prev?.total ?? 0) + Number(r.total),
    });
  }

  // La paleta categórica tiene ocho slots y NUNCA se cicla: más allá de ahí
  // las categorías se pliegan en "Otras" en vez de repetir colores.
  const ranked = [...totals.entries()].sort((a, b) => b[1].total - a[1].total);
  const keep = new Set(ranked.slice(0, topN).map(([id]) => id));
  const hasOthers = ranked.length > topN;

  const series = ranked
    .slice(0, topN)
    .map(([id, v]) => ({
      categoryId: id,
      name: v.name,
      values: new Array<number>(buckets.length).fill(0),
    }));

  const others = {
    categoryId: "others",
    name: "Otras",
    values: new Array<number>(buckets.length).fill(0),
  };

  const seriesIndex = new Map(series.map((s, i) => [s.categoryId, i]));

  for (const r of rows) {
    const bi = bucketIndex.get(String(r.bucket).slice(0, 10));
    if (bi === undefined) continue;
    const target = keep.has(r.category_id)
      ? series[seriesIndex.get(r.category_id)!]
      : others;
    target.values[bi] += Number(r.total);
  }

  return { buckets, series: hasOthers ? [...series, others] : series };
}

/* ==================================================================== *
 * 4. KPIs del periodo
 * ==================================================================== */

export type Kpis = {
  totalIncome: Cents;
  totalExpense: Cents;
  net: Cents;
  avgIncomePerBucket: Cents;
  avgExpensePerBucket: Cents;
  /** Porcentaje del ingreso que no gastaste */
  savingsRate: number;
  topCategory: { name: string; total: Cents } | null;
  peakBucket: { bucket: IsoDate; expense: Cents } | null;
};

export async function getKpis(
  userId: string,
  range: DateRange,
  granularity: Granularity,
): Promise<Kpis> {
  const [series, breakdown] = await Promise.all([
    getIncomeExpenseSeries(userId, range, granularity),
    getCategoryBreakdown(userId, range, range, "expense"),
  ]);

  const totalIncome = series.reduce((s, p) => s + p.income, 0);
  const totalExpense = series.reduce((s, p) => s + p.expense, 0);

  // Solo promedia periodos con actividad: incluir meses futuros vacíos del
  // rango hundiría el promedio y haría creer que gastas menos de lo que gastas.
  const active = series.filter((p) => p.income !== 0 || p.expense !== 0);
  const n = Math.max(active.length, 1);

  const peak = series.reduce<FlowPoint | null>(
    (best, p) => (best === null || p.expense > best.expense ? p : best),
    null,
  );

  return {
    totalIncome,
    totalExpense,
    net: totalIncome - totalExpense,
    avgIncomePerBucket: Math.round(totalIncome / n),
    avgExpensePerBucket: Math.round(totalExpense / n),
    savingsRate:
      totalIncome === 0 ? 0 : ((totalIncome - totalExpense) / totalIncome) * 100,
    topCategory: breakdown[0]
      ? { name: breakdown[0].name, total: breakdown[0].total }
      : null,
    peakBucket:
      peak && peak.expense > 0 ? { bucket: peak.bucket, expense: peak.expense } : null,
  };
}

/* ==================================================================== *
 * 5. Evolución del patrimonio
 * ==================================================================== */

export type NetWorthPoint = {
  bucket: IsoDate;
  assets: Cents;
  debt: Cents;
  net: Cents;
};

/**
 * Saldo acumulado de todas las cuentas al cierre de cada periodo, menos la
 * deuda viva en ese momento.
 *
 * A diferencia del resto del análisis, aquí SÍ entran transferencias y
 * desembolsos: para el patrimonio importa el movimiento real de dinero, no si
 * fue ingreso o gasto.
 */
export async function getNetWorthSeries(
  userId: string,
  range: DateRange,
  granularity: Granularity,
): Promise<NetWorthPoint[]> {
  const buckets = enumerateBuckets(range, granularity);
  if (buckets.length === 0) return [];

  const [initialRow] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${accounts.initialBalance}), 0)`.mapWith(Number),
    })
    .from(accounts)
    .where(sql`${accounts.userId} = ${userId} AND ${accounts.archived} = false`);

  const movements = await rawRows<{ bucket: string; delta: string | number }>(sql`
    SELECT ${sql.raw(`date_trunc('${granularity}', d.date)::date`)} AS bucket,
           SUM(d.delta) AS delta
    FROM (
      SELECT t.date, t.amount AS delta
      FROM ${transactions} t WHERE t.user_id = ${userId} AND t.to_account_id IS NOT NULL
      UNION ALL
      SELECT t.date, -t.amount AS delta
      FROM ${transactions} t WHERE t.user_id = ${userId} AND t.from_account_id IS NOT NULL
      UNION ALL
      SELECT s.settled_date AS date, s.amount AS delta
      FROM ${transactionSplits} s
      WHERE s.user_id = ${userId} AND s.status = 'settled' AND s.settled_date IS NOT NULL
    ) d
    WHERE d.date <= ${range.to}
    GROUP BY 1
    ORDER BY 1
  `);

  const debtRows = await rawRows<{
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

  const deltaByBucket = new Map<string, number>();
  for (const r of movements) {
    const key = String(r.bucket).slice(0, 10);
    deltaByBucket.set(key, (deltaByBucket.get(key) ?? 0) + Number(r.delta));
  }

  const debtDeltaByBucket = new Map<string, number>();
  for (const r of debtRows) {
    const key = String(r.bucket).slice(0, 10);
    const delta = Number(r.incurred) - Number(r.paid);
    debtDeltaByBucket.set(key, (debtDeltaByBucket.get(key) ?? 0) + delta);
  }

  // Todo lo anterior al primer bucket visible se acumula en el punto de partida,
  // para que la línea no empiece en cero e invente una caída que no existió.
  const first = buckets[0];
  let assets = initialRow?.total ?? 0;
  let debt = 0;
  for (const [key, delta] of deltaByBucket) if (key < first) assets += delta;
  for (const [key, delta] of debtDeltaByBucket) if (key < first) debt += delta;

  return buckets.map((bucket) => {
    assets += deltaByBucket.get(bucket) ?? 0;
    debt += debtDeltaByBucket.get(bucket) ?? 0;
    const outstanding = Math.max(debt, 0);
    return { bucket, assets, debt: outstanding, net: assets - outstanding };
  });
}

/* ==================================================================== *
 * 6. Desglose del gasto por cuenta
 * ==================================================================== */

export type AccountSlice = {
  accountId: string;
  name: string;
  total: Cents;
  share: number;
};

export async function getExpenseByAccount(
  userId: string,
  range: DateRange,
): Promise<AccountSlice[]> {
  const rows = await rawRows<{
    account_id: string;
    name: string;
    total: string | number;
  }>(sql`
    WITH ${flows(userId)}
    SELECT a.id AS account_id, a.name, SUM(f.amount) AS total
    FROM flows f
    JOIN ${accounts} a ON a.id = f.account_id
    WHERE f.direction = 'expense' AND f.date BETWEEN ${range.from} AND ${range.to}
    GROUP BY a.id, a.name
    ORDER BY total DESC
  `);

  const slices = rows.map((r) => ({
    accountId: r.account_id,
    name: r.name,
    total: Number(r.total),
    share: 0,
  }));
  const grand = slices.reduce((s, x) => s + x.total, 0);
  for (const s of slices) s.share = grand === 0 ? 0 : (s.total / grand) * 100;
  return slices;
}
