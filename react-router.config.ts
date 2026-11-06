import type { Config } from '@react-router/dev/config';

export default {
	appDirectory: 'src',
	ssr: true,
	// React Router 8 uses Vite's Environment API by default, which the Cloudflare
	// plugin needs. If you ever pin React Router 7, add:
	//   future: { v8_viteEnvironmentApi: true },
} satisfies Config;
