"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, MoreHorizontal } from "lucide-react";
import type { Account } from "@/db/schema";
import { deleteAccount, unarchiveAccount } from "@/actions/accounts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export function AccountActions({ account }: { account: Account }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleArchive() {
    startTransition(async () => {
      const result = await deleteAccount(account.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      // Sin movimientos la cuenta se borra de verdad, así que la página deja de
      // existir; con historial solo se archiva y sigue siendo visitable.
      toast.success("Cuenta archivada o eliminada");
      router.push("/cuentas");
    });
  }

  function handleUnarchive() {
    startTransition(async () => {
      await unarchiveAccount(account.id);
      toast.success("Cuenta restaurada");
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="grid size-9 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Más opciones"
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {account.archived ? (
          <DropdownMenuItem disabled={pending} onClick={handleUnarchive}>
            <ArchiveRestore className="size-4" />
            Restaurar cuenta
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem variant="destructive" disabled={pending} onClick={handleArchive}>
            <Archive className="size-4" />
            Archivar cuenta
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
