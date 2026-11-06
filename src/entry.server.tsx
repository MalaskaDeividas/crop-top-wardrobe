/**
 * Server rendering on Cloudflare Workers. Workers speak web streams, so this uses
 * `renderToReadableStream` instead of Node's `renderToPipeableStream`.
 */
import { isbot } from 'isbot';
import { renderToReadableStream } from 'react-dom/server';
import type { EntryContext, RouterContextProvider } from 'react-router';
import { ServerRouter } from 'react-router';

export const streamTimeout = 5_000;

// Render errors such as "Element type is invalid" only carry react-dom frames; the
// component stack is what points at the app file, so append it to the error.
function appendComponentStack(error: unknown, errorInfo?: { componentStack?: string | null }) {
	const componentStack = errorInfo?.componentStack;

	if (!(error instanceof Error) || !componentStack || error.stack?.includes(componentStack)) {
		return;
	}

	const separator = componentStack.startsWith('\n') ? '' : '\n';

	try {
		error.stack = `${error.stack ?? `${error.name}: ${error.message}`}${separator}${componentStack}`;
	} catch {
		// error.stack can be read-only on exotic error objects.
	}
}

export default async function handleRequest(
	request: Request,
	responseStatusCode: number,
	responseHeaders: Headers,
	routerContext: EntryContext,
	_loadContext: RouterContextProvider,
) {
	// https://httpwg.org/specs/rfc9110.html#HEAD
	if (request.method.toUpperCase() === 'HEAD') {
		return new Response(null, { status: responseStatusCode, headers: responseHeaders });
	}

	let shellRendered = false;
	const userAgent = request.headers.get('user-agent');
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), streamTimeout + 1000);

	const body = await renderToReadableStream(
		<ServerRouter context={routerContext} url={request.url} />,
		{
			signal: controller.signal,
			onError(error: unknown, errorInfo?: { componentStack?: string | null }) {
				appendComponentStack(error, errorInfo);
				responseStatusCode = 500;
				// Errors during the initial shell reject and are logged by React Router.
				if (shellRendered) {
					console.error(error);
				}
			},
		},
	);
	shellRendered = true;

	// Bots and SPA-mode renders wait for all content so crawlers see the full document.
	if ((userAgent && isbot(userAgent)) || routerContext.isSpaMode) {
		await body.allReady;
	}
	body.allReady.finally(() => clearTimeout(timeoutId));

	responseHeaders.set('Content-Type', 'text/html');
	return new Response(body, { headers: responseHeaders, status: responseStatusCode });
}
