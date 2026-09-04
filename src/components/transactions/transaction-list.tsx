"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal, Trash2, Users } from "lucide-react";
import type { TransactionListItem } from "@/lib/queries/transactions";
import { formatDateLabel } from "@/lib/periods";
import { deleteTransaction } from "@/actions/transactions";
import { Amount, TYPE_META } from "@/components/amount";
import { useMoneyFormatter } from "@/components/settings-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Lista de movimientos.
 *
 * En un gasto compartido se muestran los dos números a la vez: el bruto en
 * pequeño y tachado, y el neto como cifra principal. Ver solo uno confunde —el
 * banco dice 1000 y el análisis dice 400— así que la lista muestra la
 * traducción entre ambos en lugar de esconderla.
 */
export function TransactionList({
  items,
  compact = false,
}: {
  items: TransactionListItem[];
  compact?: boolean;
}) {
  const format = useMoneyFormatter();

  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Todavía no hay movimientos.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {items.map((item) => {
        const meta = TYPE_META[item.type];
        const Icon = meta.icon;
        const hasSplits = item.splitCount > 0 && item.netAmount !== item.amount;

        return (
          <li
            key={item.id}
            className={cn(
              "flex items-center gap-2.5 py-3 first:pt-0 last:pb-0 sm:gap-3",
              compact && "py-2.5",
            )}
          >
            <span
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-xl bg-muted sm:size-9",
                meta.tone,
              )}
            >
              <Icon className="size-4" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {item.description || meta.label}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                <span>{formatDateLabel(item.date)}</span>
                {item.categoryName && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{item.categoryName}</span>
                  </>
                )}
                {item.type === "transfer" && (
                  <>
                    <span aria-hidden>·</span>
                    <span>
                      {item.fromAccountName} → {item.toAccountName}
                    </span>
                  </>
                )}
                {hasSplits && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3" />
                      {item.splitCount} cuota{item.splitCount > 1 ? "s" : ""}
                    </span>
                  </>
                )}
              </p>
            </div>

            <div className="shrink-0 text-right whitespace-nowrap">
              <p className="text-sm font-medium">
                <Amount cents={item.netAmount} type={item.type} />
              </p>
              {hasSplits && (
                <p className="tabular mt-0.5 text-xs text-muted-foreground line-through">
                  {format(item.amount)}
                </p>
              )}
            </div>

            {!compact && <RowMenu id={item.id} description={item.description} />}
          </li>
        );
      })}
    </ul>
  );
}

function RowMenu({ id, description }: { id: string; description: string }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteTransaction(id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Movimiento eliminado");
      setConfirming(false);
    });
  }

  return (
    <DropdownMenu open={confirming} onOpenChange={setConfirming}>
      <DropdownMenuTrigger
        className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={`Opciones de ${description || "este movimiento"}`}
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          variant="destructive"
          disabled={pending}
          closeOnClick={false}
          onClick={handleDelete}
        >
          <Trash2 className="size-4" />
          {pending ? "Eliminando…" : "Eliminar"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
