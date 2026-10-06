import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';

/**
 * Supabase URL 정규화:
 * 끝에 붙은 '/rest/v1/', '/rest/v1', 또는 불필요한 슬래시('/')를 자동으로 정리합니다.
 */
function cleanSupabaseUrl(rawUrl) {
	if (!rawUrl) return '';
	let cleaned = String(rawUrl).trim();
	// /rest/v1/ 제거
	cleaned = cleaned.replace(/\/rest\/v1\/?$/i, '');
	// 끝 슬래시 제거
	cleaned = cleaned.replace(/\/+$/, '');
	return cleaned;
}

// 1. SUPABASE_URL / SUPABASE_BASE_URL 우선 탐색 (Vercel Supabase 연동 환경변수)
// 2. PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_DB_URL 탐색
const rawUrl =
	(typeof process !== 'undefined' && (process.env?.SUPABASE_URL || process.env?.SUPABASE_BASE_URL)) ||
	(typeof import.meta !== 'undefined' && (import.meta.env?.SUPABASE_URL || import.meta.env?.SUPABASE_BASE_URL)) ||
	env?.PUBLIC_SUPABASE_URL ||
	env?.PUBLIC_SUPABASE_DB_URL ||
	(typeof process !== 'undefined' && process.env?.PUBLIC_SUPABASE_URL) ||
	(typeof import.meta !== 'undefined' && import.meta.env?.PUBLIC_SUPABASE_URL) ||
	'';

export const supabaseUrl = cleanSupabaseUrl(rawUrl);

// 1. SUPABASE_ANON_KEY 우선 탐색 (Vercel Supabase 연동 환경변수)
// 2. PUBLIC_SUPABASE_ANON_KEY / PUBLIC_SUPABASE_KEY 탐색
const rawAnonKey =
	(typeof process !== 'undefined' && process.env?.SUPABASE_ANON_KEY) ||
	(typeof import.meta !== 'undefined' && import.meta.env?.SUPABASE_ANON_KEY) ||
	env?.PUBLIC_SUPABASE_ANON_KEY ||
	env?.PUBLIC_SUPABASE_KEY ||
	(typeof process !== 'undefined' && process.env?.PUBLIC_SUPABASE_ANON_KEY) ||
	(typeof import.meta !== 'undefined' && import.meta.env?.PUBLIC_SUPABASE_ANON_KEY) ||
	'';

export const supabaseAnonKey = String(rawAnonKey).trim();

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

