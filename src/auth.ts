import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import { SESSION_MAX_AGE_S, SESSION_UPDATE_AGE_S } from "@/lib/session-policy";
import {
  authAccounts,
  authSessions,
  authUsers,
  authVerificationTokens,
} from "@/db/schema";

/**
 * Lista blanca de correos.
 *
 * Sin esto, "iniciar sesión con Google" significa que CUALQUIER persona con una
 * cuenta de Google puede entrar a tus finanzas. El proveedor solo demuestra
 * quién eres, no que tengas permiso.
 */
function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: authUsers,
    accountsTable: authAccounts,
    sessionsTable: authSessions,
    verificationTokensTable: authVerificationTokens,
  }),
  providers: [Google],
  // La caducidad por inactividad se decide en session-policy.ts, no aquí: el
  // guardia del cliente tiene que usar el mismo número o los dos cortes se
  // contradicen. Ver el comentario de ese archivo.
  session: {
    strategy: "database",
    maxAge: SESSION_MAX_AGE_S,
    updateAge: SESSION_UPDATE_AGE_S,
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    signIn({ user }) {
      const allowed = allowedEmails();
      // Una lista vacía cierra la puerta en vez de abrirla: un despliegue al
      // que se le olvidó la variable de entorno queda inaccesible, no público.
      if (allowed.length === 0) return false;
      const email = user.email?.toLowerCase();
      return Boolean(email && allowed.includes(email));
    },
    session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
});

/** Devuelve el id de la persona autenticada o lanza. Úsalo en cada Server Action. */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new Error("No autenticado");
  return userId;
}
