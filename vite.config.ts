import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudflare } from '@cloudflare/vite-plugin';
import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	plugins: [
		// Runs the SSR build inside workerd (the Workers runtime), locally and on deploy,
		// with the D1/R2 bindings from wrangler.jsonc.
		cloudflare({ viteEnvironment: { name: 'ssr' } }),
		reactRouter(),
	],
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
		},
	},
	// The cut-out worker loads Transformers.js from a CDN with a dynamic import,
	// which needs a module worker (Vite's default build format is a classic script).
	worker: {
		format: 'es',
	},
});
