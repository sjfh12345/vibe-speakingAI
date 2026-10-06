import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';

/**
 * Supabase URL 정규화:
 * 끝에 붙은 '/rest/v1/', '/rest/v1', 또는 불필요한 슬래시('/')를 자동으로 정리합니다.
 */
function cleanSupabaseUrl(rawUrl) {
	if (!rawUrl) return 'https://iwsvipldfphknjzyrvoj.supabase.co';
	let cleaned = rawUrl.trim();
	// /rest/v1/ 제거
	cleaned = cleaned.replace(/\/rest\/v1\/?$/i, '');
	// 끝 슬래시 제거
	cleaned = cleaned.replace(/\/+$/, '');
	return cleaned;
}

const rawUrl =
	env.PUBLIC_SUPABASE_URL ||
	env.PUBLIC_SUPABASE_DB_URL ||
	'https://iwsvipldfphknjzyrvoj.supabase.co';

const supabaseUrl = cleanSupabaseUrl(rawUrl);

const supabaseAnonKey = (
	env.PUBLIC_SUPABASE_ANON_KEY ||
	env.PUBLIC_SUPABASE_KEY ||
	''
).trim();

export const isSupabaseConfigured = Boolean(
	supabaseUrl &&
	supabaseAnonKey &&
	supabaseAnonKey !== 'your_supabase_anon_key_here' &&
	!supabaseAnonKey.includes('YOUR_ANON_KEY')
);

export const supabase = createClient(
	supabaseUrl || 'https://placeholder.supabase.co',
	supabaseAnonKey || 'placeholder-key',
	{
		auth: {
			persistSession: true,
			autoRefreshToken: true,
			detectSessionInUrl: true
		}
	}
);
