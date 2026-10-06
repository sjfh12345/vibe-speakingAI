import { env } from '$env/dynamic/private';

/**
 * Vercel Serverless 및 Node 서버 런타임에서 Supabase 및 필수 공개 환경 변수를 클라이언트로 안전하게 전달합니다.
 */
export function load() {
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

	return {
		supabaseUrl,
		supabaseAnonKey
	};
}
