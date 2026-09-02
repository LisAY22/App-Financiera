"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { Category, Person } from "@/db/schema";
import type { AccountWithBalance } from "@/lib/queries/balances";
import { TransactionForm } from "./transaction-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Botón flotante de alta rápida.
 *
 * Vive en el armazón y no en una página, porque el momento de registrar un
 * gasto es cuando acabas de hacerlo, estés donde estés dentro de la app.
 */
export function QuickAdd({
  accounts,
  categories,
  people,
}: {
  accounts: AccountWithBalance[];
  categories: Category[];
  people: Person[];
}) {
  const [open, setOpen] = useState(false);

  // Sin cuentas no hay dónde registrar nada; la página de cuentas guía primero.
  if (accounts.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            size="lg"
            className="fixed bottom-20 right-4 z-40 size-14 rounded-full p-0 shadow-lg md:bottom-8 md:right-8"
            aria-label="Registrar movimiento"
          />
        }
      >
        <Plus className="size-6" />
      </DialogTrigger>

      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo movimiento</DialogTitle>
          <DialogDescription>
            Un ingreso, un egreso o un traspaso entre tus cuentas.
          </DialogDescription>
        </DialogHeader>

        <TransactionForm
          accounts={accounts}
          categories={categories}
          people={people}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
