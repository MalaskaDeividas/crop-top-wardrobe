import { redirect } from 'react-router';
import { authStore } from '@/lib/api-client';

/**
 * Guard a protected route. The session lives in localStorage, so this belongs in
 * `clientLoader` — a server `loader` cannot see it. Keep it that way: if
 * server-rendered output depended on the visitor, any cache in front of the site
 * could serve one person's page to everyone.
 *
 *   export const clientLoader = () => ({ user: requireAuth() });
 *   clientLoader.hydrate = true as const;
 *   export function HydrateFallback() { return <div />; }
 */
export function requireAuth(redirectTo = '/login') {
	const record = authStore.record;

	if (!authStore.isValid || !record) {
		throw redirect(redirectTo);
	}

	return record;
}

export default requireAuth;
