import { redirect } from "next/navigation";
import Link from "next/link";
import { PiggyBank } from "lucide-react";
import { auth } from "@/auth";
import { seedDefaultsIfNeeded } from "@/db/seed-defaults";
import { BottomNav, SidebarNav } from "@/components/nav";
import { UserMenu } from "@/components/user-menu";
import { QuickAdd } from "@/components/transactions/quick-add";
import { SettingsProvider } from "@/components/settings-provider";
import { getAccountsWithBalances } from "@/lib/queries/balances";
import { getCategories, getPeople, getSettings } from "@/lib/queries/lookups";

/**
 * Todo lo que cuelga de aquí depende de la sesión y de datos que cambian con
 * cada movimiento, así que nada se prerenderiza: una página estática serviría
 * saldos congelados —o los de otra persona— desde la caché.
 */
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;
  await seedDefaultsIfNeeded(userId);

  // El botón de alta rápida vive en el armazón, así que necesita las listas
  // aquí: registrar un movimiento no debe obligar a cambiar de página.
  const [accounts, categories, people, settings] = await Promise.all([
    getAccountsWithBalances(userId),
    getCategories(userId),
    getPeople(userId),
    getSettings(userId),
  ]);

  return (
    <SettingsProvider settings={settings}>
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar py-5 md:flex">
        <Link href="/" className="mb-6 flex items-center gap-2.5 px-6">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            <PiggyBank className="size-5" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Finanzas</span>
        </Link>

        <SidebarNav />

        <div className="mt-auto px-3">
          <UserMenu
            name={session.user.name ?? "Mi cuenta"}
            email={session.user.email ?? ""}
            image={session.user.image ?? null}
          />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur-sm md:hidden">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <PiggyBank className="size-4" />
            </span>
            <span className="text-sm font-semibold tracking-tight">Finanzas</span>
          </Link>
          <UserMenu
            compact
            name={session.user.name ?? "Mi cuenta"}
            email={session.user.email ?? ""}
            image={session.user.image ?? null}
          />
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-5 md:px-8 md:pb-12">
          {children}
        </main>
      </div>

      <QuickAdd accounts={accounts} categories={categories} people={people} />
      <BottomNav />
    </div>
    </SettingsProvider>
  );
}
