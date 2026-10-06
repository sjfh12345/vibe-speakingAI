// Svelte 5 Runes 기반 인증 상태 스토어
import { browser } from '$app/environment';

function formatErrorMessage(detail, fallback) {
	if (!detail) return fallback;
	if (typeof detail === 'string') return detail;
	if (Array.isArray(detail)) {
		return detail.map((d) => d.msg || d.message || JSON.stringify(d)).join(', ');
	}
	if (typeof detail === 'object') {
		return detail.message || detail.msg || JSON.stringify(detail);
	}
	return String(detail);
}

class AuthStore {
	user = $state(null);
	token = $state(null);
	isLoading = $state(false);
	isInitialized = $state(false);
	error = $state(null);

	constructor() {
		if (browser) {
			this.init();
		}
	}

	get isAuthenticated() {
		return !!this.user && !!this.token;
	}

	/**
	 * 앱 초기화 시 localStorage에서 토큰을 읽어와 사용자 검증
	 */
	async init() {
		if (!browser) return;
		try {
			this.isLoading = true;
			const savedToken = localStorage.getItem('speaking_ai_token');
			if (savedToken) {
				this.token = savedToken;
				const res = await fetch('/api/auth/me', {
					headers: {
						Authorization: `Bearer ${savedToken}`
					}
				});
				if (res.ok) {
					const data = await res.json();
					if (data.success && data.user) {
						this.user = data.user;
					} else {
						this.logout();
					}
				} else {
					// 토큰 만료 또는 유효하지 않음
					this.logout();
				}
			}
		} catch (err) {
			console.error('인증 상태 복원 실패:', err);
			this.logout();
		} finally {
			this.isLoading = false;
			this.isInitialized = true;
		}
	}

	/**
	 * 로그인
	 */
	async login(email, password) {
		this.isLoading = true;
		this.error = null;
		try {
			const res = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password })
			});

			const data = await res.json().catch(() => ({}));
			if (!res.ok || !data.success) {
				const msg = formatErrorMessage(data.detail || data.message, `로그인 실패 (${res.status})`);
				throw new Error(msg);
			}

			this.token = data.token;
			this.user = data.user;
			if (browser) {
				localStorage.setItem('speaking_ai_token', data.token);
			}
			return { success: true, user: data.user, message: data.message };
		} catch (err) {
			this.error = err.message;
			throw err;
		} finally {
			this.isLoading = false;
		}
	}

	/**
	 * 회원가입
	 */
	async register(email, password, name) {
		this.isLoading = true;
		this.error = null;
		try {
			const res = await fetch('/api/auth/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password, name })
			});

			const data = await res.json().catch(() => ({}));
			if (!res.ok || !data.success) {
				const msg = formatErrorMessage(data.detail || data.message, `회원가입 실패 (${res.status})`);
				throw new Error(msg);
			}

			this.token = data.token;
			this.user = data.user;
			if (browser) {
				localStorage.setItem('speaking_ai_token', data.token);
			}
			return { success: true, user: data.user, message: data.message };
		} catch (err) {
			this.error = err.message;
			throw err;
		} finally {
			this.isLoading = false;
		}
	}

	/**
	 * 로그아웃
	 */
	logout() {
		this.user = null;
		this.token = null;
		this.error = null;
		if (browser) {
			localStorage.removeItem('speaking_ai_token');
		}
	}

	/**
	 * 인증 토큰이 자동으로 첨부된 fetch 유틸리티
	 */
	async authFetch(url, options = {}) {
		const headers = new Headers(options.headers || {});
		if (this.token) {
			headers.set('Authorization', `Bearer ${this.token}`);
		}
		return fetch(url, { ...options, headers });
	}
}

export const auth = new AuthStore();
