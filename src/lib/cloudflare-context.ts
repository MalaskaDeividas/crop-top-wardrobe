/**
 * Cloudflare bindings (D1, R2, env vars) for loaders and actions.
 *
 * React Router 8 passes a typed `RouterContextProvider` to loaders instead of a
 * plain object. The Worker sets this value on every request; read it with:
 *
 *   export async function loader({ context }: Route.LoaderArgs) {
 *     const { env } = context.get(cloudflareContext);
 *     const row = await env.DB.prepare('SELECT 1').first();
 *   }
 */
import { createContext } from 'react-router';

export type CloudflareContext = { env: Env; ctx: ExecutionContext };

export const cloudflareContext = createContext<CloudflareContext>();
