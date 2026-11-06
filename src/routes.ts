import { type RouteConfig, index, route } from '@react-router/dev/routes';

export default [
	index('routes/home.tsx'),
	route('workshop', 'routes/workshop.tsx'),
	route('login', 'routes/login.tsx'),
	route('sitemap.xml', 'routes/sitemap.xml.ts'),
	route('robots.txt', 'routes/robots.txt.ts'),
	// /api/* is handled by the Worker (workers/api) before React Router runs.
] satisfies RouteConfig;
