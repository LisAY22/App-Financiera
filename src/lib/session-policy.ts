/**
 * Política de sesión, escrita una sola vez.
 *
 * Esto son finanzas personales: un teléfono desbloqueado encima de la mesa no
 * debería dejar los saldos a la vista para siempre. El corte por inactividad lo
 * aplican dos capas distintas, y por eso los números viven aquí y no repartidos:
 *
 * - **El servidor** (`auth.ts`) caduca la fila de sesión en la base. Es el que
 *   manda: aunque alguien manipule el navegador, sin fila no hay acceso.
 * - **El cliente** (`idle-guard.tsx`) avisa y cierra *antes* que el servidor.
 *
 * El orden importa. Si el cliente cortara después, la pantalla seguiría
 * mostrando saldos con una sesión ya muerta hasta la siguiente navegación: la
 * información sensible sigue ahí, que es justo lo que se quiere evitar.
 *
 * Por eso `SESSION_MAX_AGE_S` es el doble del corte del cliente: le da margen
 * para actuar primero y hace de red por si el JavaScript no corre.
 */

/** Inactividad tras la cual el cliente cierra la sesión. */
export const IDLE_TIMEOUT_MS = 15 * 60_000;

/**
 * Cuánto dura el aviso previo. Se descuenta del total, no se suma: a los 14 min
 * aparece el diálogo y a los 15 se cierra. Un aviso que extendiera el plazo
 * haría que el número de arriba fuese mentira.
 */
export const IDLE_WARNING_MS = 60_000;

/** Caducidad de la sesión en la base. Red de seguridad detrás del cliente. */
export const SESSION_MAX_AGE_S = (2 * IDLE_TIMEOUT_MS) / 1000;

/**
 * Cada cuánto una petición refresca la caducidad. Sin esto, Auth.js solo la
 * renovaría muy de vez en cuando y una sesión activa moriría a mitad de uso.
 */
export const SESSION_UPDATE_AGE_S = 5 * 60;
