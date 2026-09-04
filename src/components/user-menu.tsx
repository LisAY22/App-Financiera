"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { LogOut, Moon, Settings, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/actions/session";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  email: string;
  image: string | null;
  compact?: boolean;
};

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function UserMenu({ name, email, image, compact = false }: Props) {
  const { resolvedTheme, setTheme } = useTheme();
  const [leaving, startLeaving] = useTransition();

  const isDark = resolvedTheme === "dark";

  const avatar = image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={image} alt="" className="size-8 rounded-full object-cover" />
  ) : (
    <span className="grid size-8 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
      {initials(name)}
    </span>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-sidebar-accent/60",
          compact && "w-auto px-0 hover:bg-transparent",
        )}
      >
        {avatar}
        {!compact && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{name}</span>
            <span className="block truncate text-xs text-muted-foreground">{email}</span>
          </span>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        {/* La etiqueta es un `GroupLabel` de Base UI: nombra al grupo que la
            sigue vía aria-labelledby, así que fuera de un `Group` no tiene a
            quién nombrar y lanza. Envolver aquí no es un parche: agrupa la
            identidad con las acciones que le pertenecen. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <span className="block text-sm font-medium">{name}</span>
            <span className="block truncate text-xs text-muted-foreground">{email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuItem nativeButton={false} render={<Link href="/configuracion" />}>
            <Settings className="size-4" />
            Configuración
          </DropdownMenuItem>

          {/* El popup solo se monta al abrirlo, así que aquí `resolvedTheme` ya
              está resuelto: no hace falta el típico guardia de hidratación.
              `closeOnClick={false}` deja ver el cambio y volver atrás sin
              tener que reabrir el menú. */}
          <DropdownMenuItem
            closeOnClick={false}
            onClick={() => setTheme(isDark ? "light" : "dark")}
          >
            {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            Tema {isDark ? "claro" : "oscuro"}
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        {/* Llamada directa a la Server Action en vez de `<form action>`: elegir
            el ítem cierra el menú, y el popup se desmonta con el formulario
            dentro antes de que el envío salga. El clic se perdía a veces.
            `closeOnClick={false}` mantiene el menú en pie hasta que la
            redirección llega, por el mismo motivo.

            El `startTransition` NO es cosmético: fuera de una transición el
            router no procesa la redirección que devuelve la acción, así que
            la sesión se cerraba en el servidor y la pantalla se quedaba igual,
            como si el botón no hiciera nada. */}
        <DropdownMenuItem
          variant="destructive"
          closeOnClick={false}
          disabled={leaving}
          onClick={() =>
            startLeaving(async () => {
              await signOutAction();
            })
          }
        >
          <LogOut className="size-4" />
          {leaving ? "Cerrando sesión…" : "Cerrar sesión"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
