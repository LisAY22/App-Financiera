"use server";

import { signIn, signOut } from "@/auth";

export async function signInAction() {
  await signIn("google", { redirectTo: "/" });
}

/**
 * `reason` solo cambia el mensaje del login. Salir por inactividad y salir a
 * propósito no son lo mismo para quien lo lee: sin la distinción, encontrarte
 * la pantalla de entrada parece que la app te expulsó sin motivo.
 */
export async function signOutAction(reason?: "idle") {
  await signOut({ redirectTo: reason === "idle" ? "/login?reason=idle" : "/login" });
}
