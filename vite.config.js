import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');

	const supabaseUrl =
		env.SUPABASE_URL ||
		env.SUPABASE_BASE_URL ||
		env.PUBLIC_SUPABASE_URL ||
		process.env.SUPABASE_URL ||
		process.env.SUPABASE_BASE_URL ||
		process.env.PUBLIC_SUPABASE_URL ||
		'';

	const supabaseAnonKey =
		env.SUPABASE_ANON_KEY ||
		env.PUBLIC_SUPABASE_ANON_KEY ||
		process.env.SUPABASE_ANON_KEY ||
		process.env.PUBLIC_SUPABASE_ANON_KEY ||
		'';

	const supabaseBaseUrl =
		env.SUPABASE_BASE_URL ||
		env.SUPABASE_URL ||
		env.PUBLIC_SUPABASE_URL ||
		process.env.SUPABASE_BASE_URL ||
		process.env.SUPABASE_URL ||
		process.env.PUBLIC_SUPABASE_URL ||
		'';

	return {
		plugins: [
			tailwindcss(),
			sveltekit({
				compilerOptions: {
					// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},

				// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
				// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
				// See https://svelte.dev/docs/kit/adapters for more information about adapters.
				adapter: adapter()
			})
		],
		envPrefix: ['VITE_', 'PUBLIC_', 'SUPABASE_'],
		define: {
			'process.env.SUPABASE_URL': JSON.stringify(supabaseUrl),
			'process.env.SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
			'process.env.SUPABASE_BASE_URL': JSON.stringify(supabaseBaseUrl),
			'import.meta.env.SUPABASE_URL': JSON.stringify(supabaseUrl),
			'import.meta.env.SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
			'import.meta.env.SUPABASE_BASE_URL': JSON.stringify(supabaseBaseUrl)
		},
		server: {
			port: 5173,
			proxy: {
				// 브라우저 5173 포트에서 /api 요청 시 8000 포트의 FastAPI로 자동 프록시 연결
				'/api': {
					target: 'http://127.0.0.1:8000',
					changeOrigin: true,
					secure: false
				}
			}
		},
		test: {
			expect: { requireAssertions: true },
			projects: [
				{
					extends: './vite.config.js',
					test: {
						name: 'client',
						browser: {
							enabled: true,
							provider: playwright(),
							instances: [{ browser: 'chromium', headless: true }]
						},
						include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
						exclude: ['src/lib/server/**']
					}
				},

				{
					extends: './vite.config.js',
					test: {
						name: 'server',
						environment: 'node',
						include: ['src/**/*.{test,spec}.{js,ts}'],
						exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
					}
				}
			]
		}
	};
});

