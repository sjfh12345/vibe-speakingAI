import adapter from '@sveltejs/adapter-auto'; // 또는 @sveltejs/adapter-vercel

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter()
	}
};

export default config;
