import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export function GET() {
	const apiKey = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
	const isConfigured = Boolean(apiKey && apiKey !== 'your_openai_api_key_here');
	const isValidPrefix = isConfigured && (apiKey.startsWith('sk-') || apiKey.startsWith('sk-proj-'));

	const maskedKey = isConfigured
		? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`
		: '미설정 (Not Set)';

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

	const isSupabaseConfigured = Boolean(
		supabaseUrl &&
		supabaseAnonKey &&
		supabaseAnonKey !== 'your_supabase_anon_key_here'
	);

	return json({
		backend_status: 'healthy (Vercel Serverless / SvelteKit)',
		api_key_status: {
			is_configured: isConfigured,
			is_valid_prefix: isValidPrefix,
			masked_key: maskedKey,
			hint: isValidPrefix
				? '정상 설정됨'
				: isConfigured
				? "API 키 형식이 올바르지 않습니다 ('sk-'로 시작해야 함)."
				: 'OPENAI_API_KEY를 Vercel 환경 변수에 등록해주세요.'
		},
		supabase_status: {
			is_configured: isSupabaseConfigured,
			url: supabaseUrl ? `${supabaseUrl.slice(0, 20)}...` : '미설정',
			has_key: Boolean(supabaseAnonKey)
		}
	});
}
