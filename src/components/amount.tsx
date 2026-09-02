"use client";

import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, HandCoins } from "lucide-react";
import type { TransactionType } from "@/db/schema";
import type { Cents } from "@/lib/money";
import { useMoneyFormatter } from "@/components/settings-provider";
import { cn } from "@/lib/utils";

/**
 * Los colores de dirección del dinero NUNCA van solos.
 *
 * Cada monto lleva además signo, y cada movimiento su icono, así que quien no
 * distinga verde de rojo sigue leyendo la app sin perder información. El color
 * refuerza, no informa por sí mismo.
 */
export const TYPE_META: Record<
  TransactionType,
  { label: string; icon: typeof ArrowUpRight; tone: string; sign: "+" | "−" | "" }
> = {
  income: {
    label: "Ingreso",
    icon: ArrowDownLeft,
    tone: "text-[var(--income-ink)]",
    sign: "+",
  },
  expense: {
    label: "Egreso",
    icon: ArrowUpRight,
    tone: "text-[var(--expense-ink)]",
    sign: "−",
  },
  transfer: {
    label: "Transferencia",
    icon: ArrowLeftRight,
    tone: "text-muted-foreground",
    sign: "",
  },
  debt_payment: {
    label: "Pago de deuda",
    icon: HandCoins,
    tone: "text-[var(--debt-ink)]",
    sign: "−",
  },
  debt_disbursement: {
    label: "Préstamo recibido",
    icon: HandCoins,
    tone: "text-[var(--debt-ink)]",
    sign: "+",
  },
};

type AmountProps = {
  cents: Cents;
  /** Colorea según el tipo de movimiento y antepone su signo. */
  type?: TransactionType;
  /** Colorea por el signo del propio número (para balances y variaciones). */
  signed?: boolean;
  className?: string;
  compact?: boolean;
  hideZeroCents?: boolean;
};

export function Amount({
  cents,
  type,
  signed = false,
  className,
  compact = false,
  hideZeroCents = false,
}: AmountProps) {
  const format = useMoneyFormatter();
  const meta = type ? TYPE_META[type] : null;

  const tone = meta
    ? meta.tone
    : signed
      ? cents > 0
        ? "text-[var(--income-ink)]"
        : cents < 0
          ? "text-[var(--expense-ink)]"
          : "text-muted-foreground"
      : "";

  const body = format(Math.abs(cents), { compact, hideZeroCents });
  const sign = meta ? meta.sign : signed && cents !== 0 ? (cents > 0 ? "+" : "−") : "";

  return (
    <span className={cn("tabular", tone, className)}>
      {sign}
      {body}
    </span>
  );
}

/** Etiqueta con icono para el tipo de movimiento. */
export function TypeBadge({ type }: { type: TransactionType }) {
  const meta = TYPE_META[type];
  const Icon = meta.icon;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className={cn("size-3.5", meta.tone)} />
      {meta.label}
    </span>
  );
}
