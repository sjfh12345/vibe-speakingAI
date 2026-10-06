import { createClient } from '@supabase/supabase-js';
import { env as publicEnv } from '$env/dynamic/public';

/**
 * Supabase URL 정규화:
 * 1) postgresql://postgres:...@db.<project-ref>.supabase.co:5432/... 형태의 DB URI를 https://<project-ref>.supabase.co 로 자동 변환
 * 2) 끝에 붙은 '/rest/v1/', '/rest/v1', 또는 불필요한 슬래시('/')를 자동으로 정리합니다.
 */
export function cleanSupabaseUrl(rawUrl) {
	if (!rawUrl) return '';
	let cleaned = String(rawUrl).trim();

	// postgresql:// 또는 postgres:// 형태인 경우 REST API URL로 자동 추출 변환
	if (cleaned.startsWith('postgres://') || cleaned.startsWith('postgresql://')) {
		const match = cleaned.match(/@db\.([a-z0-9-]+)\.supabase\.co/i);
		if (match && match[1]) {
			return `https://${match[1]}.supabase.co`;
		}
	}

	cleaned = cleaned.replace(/\/rest\/v1\/?$/i, '');
	cleaned = cleaned.replace(/\/+$/, '');
	return cleaned;
}

// 1. 빌드 타임 & 정적 환경 변수 추출
function getInitialConfig() {
	let url = '';
	let key = '';

	try {
		if (typeof import.meta !== 'undefined' && import.meta.env) {
			url = import.meta.env.SUPABASE_URL || import.meta.env.SUPABASE_BASE_URL || import.meta.env.PUBLIC_SUPABASE_URL || '';
			key = import.meta.env.SUPABASE_ANON_KEY || import.meta.env.PUBLIC_SUPABASE_ANON_KEY || '';
		}
	} catch (e) {
		// ignore
	}

	if (!url && typeof publicEnv !== 'undefined') {
		url = publicEnv.PUBLIC_SUPABASE_URL || publicEnv.PUBLIC_SUPABASE_DB_URL || '';
	}
	if (!key && typeof publicEnv !== 'undefined') {
		key = publicEnv.PUBLIC_SUPABASE_ANON_KEY || publicEnv.PUBLIC_SUPABASE_KEY || '';
	}

	return {
		url: cleanSupabaseUrl(url),
		key: String(key).trim()
	};
}

const initialConfig = getInitialConfig();

export let supabaseUrl = initialConfig.url;
export let supabaseAnonKey = initialConfig.key;

export function checkConfigured(url, key) {
	return Boolean(
		url &&
		key &&
		key !== 'your_supabase_anon_key_here' &&
		key !== 'placeholder-key' &&
		!key.includes('YOUR_ANON_KEY')
	);
}

export let isSupabaseConfigured = checkConfigured(supabaseUrl, supabaseAnonKey);

let internalClient = createClient(
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

/**
 * 서버(+layout.server.js)에서 전달받은 Vercel 환경 변수로 Supabase 클라이언트를 즉시 갱신합니다.
 */
export function updateSupabaseConfig(url, key) {
	const cleanedUrl = cleanSupabaseUrl(url);
	const cleanedKey = String(key || '').trim();

	if (!cleanedUrl || !cleanedKey) return;

	if (cleanedUrl !== supabaseUrl || cleanedKey !== supabaseAnonKey) {
		supabaseUrl = cleanedUrl;
		supabaseAnonKey = cleanedKey;
		isSupabaseConfigured = checkConfigured(supabaseUrl, supabaseAnonKey);

		internalClient = createClient(supabaseUrl, supabaseAnonKey, {
			auth: {
				persistSession: true,
				autoRefreshToken: true,
				detectSessionInUrl: true
			}
		});
	}
}

/**
 * Proxy 객체를 통해 언제든 최신 초기화된 internalClient를 안전하게 호출
 */
export const supabase = new Proxy({}, {
	get(_target, prop) {
		const targetObj = internalClient;
		const val = targetObj[prop];
		if (typeof val === 'function') {
			return val.bind(targetObj);
		}
		return val;
	}
});
