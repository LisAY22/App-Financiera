import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, people, transactions, transactionSplits } from "@/db/schema";
import type { SplitStatus } from "@/db/schema";
import type { Cents } from "@/lib/money";
import type { IsoDate } from "@/lib/periods";

export type Receivable = {
  splitId: string;
  personId: string;
  personName: string;
  personColor: string | null;
  amount: Cents;
  status: SplitStatus;
  settledAccountName: string | null;
  settledDate: IsoDate | null;
  /** El gasto que originó la cuota */
  transactionId: string;
  transactionDate: IsoDate;
  transactionDescription: string;
  transactionAmount: Cents;
  categoryName: string | null;
};

async function listSplits(userId: string, status: SplitStatus): Promise<Receivable[]> {
  const rows = await db
    .select({
      splitId: transactionSplits.id,
      personId: people.id,
      personName: people.name,
      personColor: people.color,
      amount: transactionSplits.amount,
      status: transactionSplits.status,
      settledAccountName: accounts.name,
      settledDate: transactionSplits.settledDate,
      transactionId: transactions.id,
      transactionDate: transactions.date,
      transactionDescription: transactions.description,
      transactionAmount: transactions.amount,
      categoryName: categories.name,
    })
    .from(transactionSplits)
    .innerJoin(transactions, eq(transactions.id, transactionSplits.transactionId))
    .innerJoin(people, eq(people.id, transactionSplits.personId))
    .leftJoin(accounts, eq(accounts.id, transactionSplits.settledAccountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(eq(transactionSplits.userId, userId), eq(transactionSplits.status, status)))
    .orderBy(desc(transactions.date), asc(people.name));

  return rows as Receivable[];
}

export function getPendingReceivables(userId: string) {
  return listSplits(userId, "pending");
}

export function getSettledReceivables(userId: string) {
  return listSplits(userId, "settled");
}

export type PersonDebtGroup = {
  personId: string;
  personName: string;
  personColor: string | null;
  total: Cents;
  items: Receivable[];
};

/** Agrupa lo pendiente por persona: la pregunta real es "¿quién me debe?". */
export function groupByPerson(items: Receivable[]): PersonDebtGroup[] {
  const groups = new Map<string, PersonDebtGroup>();

  for (const item of items) {
    const existing = groups.get(item.personId);
    if (existing) {
      existing.total += item.amount;
      existing.items.push(item);
    } else {
      groups.set(item.personId, {
        personId: item.personId,
        personName: item.personName,
        personColor: item.personColor,
        total: item.amount,
        items: [item],
      });
    }
  }

  return [...groups.values()].sort((a, b) => b.total - a.total);
}

export async function getPendingReceivablesTotal(userId: string): Promise<Cents> {
  const items = await getPendingReceivables(userId);
  return items.reduce((sum, item) => sum + item.amount, 0);
}
