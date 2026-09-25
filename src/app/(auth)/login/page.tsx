import { redirect } from "next/navigation";
import { Clock, PiggyBank, ShieldCheck } from "lucide-react";
import { auth } from "@/auth";
import { signInAction } from "@/actions/session";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { IDLE_TIMEOUT_MS } from "@/lib/session-policy";

export const metadata = { title: "Entrar" };

export default async function LoginPage(props: PageProps<"/login">) {
  const session = await auth();
  if (session?.user) redirect("/");

  const params = await props.searchParams;
  const hasError = Boolean(params.error);
  const wasIdle = params.reason === "idle";
  const idleMinutes = Math.round(IDLE_TIMEOUT_MS / 60_000);

  return (
    <main className="relative grid min-h-dvh">
      {/* Ambiente. `pointer-events-none` y aria-hidden: es decorado, no debe
          robar clics ni aparecer en un lector de pantalla. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-40 -left-32 size-[32rem] rounded-full bg-primary/20 blur-3xl dark:bg-primary/10" />
        <div className="absolute -right-40 -bottom-48 size-[34rem] rounded-full bg-chart-4/20 blur-3xl dark:bg-chart-4/10" />
      </div>

      <section className="relative grid place-items-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center">
            <span className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm shadow-primary/30">
              <PiggyBank className="size-7" />
            </span>
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              Finanzas
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground text-pretty lg:hidden">
              Tus cuentas, gastos, ahorro y deudas en un solo lugar.
            </p>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/80 p-6 shadow-xl shadow-foreground/5 backdrop-blur-sm sm:p-8 space-y-6">
            {wasIdle && (
              <Alert>
                <Clock className="size-4" />
                <AlertDescription>
                  Cerramos tu sesión tras {idleMinutes} minutos sin actividad.
                  Vuelve a entrar para seguir.
                </AlertDescription>
              </Alert>
            )}

            {hasError && (
              <Alert variant="destructive">
                <AlertDescription>
                  Esa cuenta no tiene acceso. La app solo admite los correos
                  autorizados en su configuración.
                </AlertDescription>
              </Alert>
            )}

            <form action={signInAction}>
              <Button
                type="submit"
                size="lg"
                className="w-full gap-2.5 shadow-sm shadow-primary/25"
              >
                <GoogleMark />
                Entrar con Google
              </Button>
            </form>

            <div className="flex items-start gap-2.5 rounded-xl bg-muted/60 p-3 text-[13px] leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-px size-4 shrink-0 text-primary" />
              <p>
                El acceso está limitado a una lista de correos autorizados: nadie
                más puede entrar aunque tenga el enlace.
              </p>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            La sesión se cierra sola tras {idleMinutes} minutos de inactividad.
          </p>
        </div>
      </section>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3.01h3.88c2.27-2.09 3.58-5.17 3.58-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.88-3.01c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.11A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.28a7.2 7.2 0 0 1 0-4.56V6.61H1.28a12 12 0 0 0 0 10.78l4.01-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.61 4.59 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.61l4.01 3.11C6.23 6.86 8.88 4.75 12 4.75Z"
      />
    </svg>
  );
}
