import { useEffect, useMemo, useState } from 'react';
import { api, authStore, type User } from '@/lib/api-client';

// Check the stored session with the server once per page load, not once per component.
let verified = false;

/**
 * Session state for the signed-in user: user, isAuthed, isLoading, login, signup,
 * logout. No provider to mount — every caller reads the same `authStore`.
 *
 * The token is in localStorage, which the server cannot read, so the session is
 * filled in after hydration. Render on `isLoading` (a spinner, a skeleton) instead
 * of the signed-out state, or a signed-in visitor sees "Sign in" flash on load.
 */
export function useAuth() {
	const [user, setUser] = useState<User | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		setUser(authStore.record);
		setIsLoading(false);

		if (!verified && authStore.isValid) {
			verified = true;
			// A 401 here clears the store, which signs this tab out.
			api.auth.me().catch(() => {});
		}

		return authStore.onChange(setUser);
	}, []);

	return useMemo(
		() => ({
			user,
			isAuthed: Boolean(user),
			isLoading,
			login: (email: string, password: string) => api.auth.login(email, password),
			signup: (email: string, password: string, extraFields: { name?: string } = {}) =>
				api.auth.signup(email, password, extraFields.name ?? ''),
			logout: () => api.auth.logout(),
		}),
		[user, isLoading],
	);
}

export default useAuth;
