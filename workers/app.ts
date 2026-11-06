/**
 * Cloudflare Worker entry: `/api/*` goes to the D1-backed API, everything else
 * is server-rendered by React Router. Static assets in build/client are served
 * by Cloudflare before this code runs.
 */
import { createRequestHandler, RouterContextProvider } from 'react-router';
import { cloudflareContext } from '../src/lib/cloudflare-context';
import { handleApi } from './api/index.ts';
import type { ApiEnv } from './api/types.ts';

const requestHandler = createRequestHandler(() => import('virtual:react-router/server-build'), import.meta.env.MODE);

export default {
	fetch(request, env, ctx) {
		const { pathname } = new URL(request.url);
		if (pathname === '/api' || pathname.startsWith('/api/')) {
			// The generated `Env` only lists bindings present in wrangler.jsonc, and the
			// optional R2 `IMAGES` bucket may be commented out, so widen it here.
			return handleApi(request, env as unknown as ApiEnv);
		}

		// React Router 8 requires a RouterContextProvider here, not a plain object.
		const context = new RouterContextProvider();
		context.set(cloudflareContext, { env, ctx });
		return requestHandler(request, context);
	},
} satisfies ExportedHandler<Env>;
