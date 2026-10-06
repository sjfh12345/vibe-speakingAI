// Svelte 5 Runes 기반 Supabase Auth 스토어
import { browser } from '$app/environment';
import { supabase, isSupabaseConfigured } from './supabaseClient.js';

class AuthStore {
	user = $state(null);
	session = $state(null);
	isLoading = $state(true);
	isInitialized = $state(false);
	error = $state(null);

	constructor() {
		if (browser) {
			this.init();
		}
	}

	get isAuthenticated() {
		return !!this.user;
	}

	get token() {
		return this.session?.access_token || null;
	}

	/**
	 * Supabase 세션 초기화 및 상태 변화 감지 리스너 등록
	 */
	async init() {
		if (!browser) return;
		try {
			this.isLoading = true;

			// 1. 현재 세션 가져오기
			const { data, error } = await supabase.auth.getSession();
			if (error) {
				console.warn('Supabase 세션 조회 실패:', error.message);
			} else if (data?.session) {
				this.session = data.session;
				this.user = this._formatUser(data.session.user);
			}

			// 2. 인증 상태 변화 이벤트 구독
			supabase.auth.onAuthStateChange((_event, session) => {
				if (session?.user) {
					this.session = session;
					this.user = this._formatUser(session.user);
				} else {
					this.session = null;
					this.user = null;
				}
				this.isLoading = false;
			});
		} catch (err) {
			console.error('인증 초기화 중 오류:', err);
		} finally {
			this.isLoading = false;
			this.isInitialized = true;
		}
	}

	_formatUser(rawUser) {
		if (!rawUser) return null;
		return {
			id: rawUser.id,
			email: rawUser.email,
			name:
				rawUser.user_metadata?.name ||
				rawUser.user_metadata?.full_name ||
				rawUser.email?.split('@')[0] ||
				'사용자',
			avatar_url: rawUser.user_metadata?.avatar_url || '',
			created_at: rawUser.created_at
		};
	}

	/**
	 * 로그인 (Supabase signInWithPassword)
	 */
	async login(email, password) {
		this.isLoading = true;
		this.error = null;
		try {
			if (!isSupabaseConfigured) {
				throw new Error('Supabase URL 및 API Key가 .env에 설정되지 않았습니다.');
			}

			const { data, error } = await supabase.auth.signInWithPassword({
				email: email.trim(),
				password
			});

			if (error) {
				// Supabase 에러 한글화
				let msg = error.message;
				if (msg.includes('Invalid login credentials')) {
					msg = '이메일 또는 비밀번호가 일치하지 않습니다.';
				} else if (msg.includes('Email not confirmed')) {
					msg = '이메일 인증이 완료되지 않았습니다. Supabase 대시보드(Auth > Providers > Email)에서 Confirm Email을 끄거나 메일을 확인해주세요.';
				}
				throw new Error(msg);
			}

			this.session = data.session;
			this.user = this._formatUser(data.user);
			return {
				success: true,
				user: this.user,
				message: `${this.user.name}님, 환영합니다!`
			};
		} catch (err) {
			this.error = err.message;
			throw err;
		} finally {
			this.isLoading = false;
		}
	}

	/**
	 * 회원가입 (Supabase signUp)
	 */
	async register(email, password, name) {
		this.isLoading = true;
		this.error = null;
		try {
			if (!isSupabaseConfigured) {
				throw new Error('Supabase URL 및 API Key가 .env에 설정되지 않았습니다.');
			}

			const redirectUrl = browser ? `${window.location.origin}/` : 'https://speakin-ai.vercel.app/';

			const { data, error } = await supabase.auth.signUp({
				email: email.trim(),
				password,
				options: {
					data: {
						name: name.trim()
					},
					emailRedirectTo: redirectUrl
				}
			});

			if (error) {
				let msg = error.message;
				if (msg.includes('User already registered')) {
					msg = '이미 가입된 이메일 주소입니다. 로그인을 진행해주세요.';
				} else if (msg.includes('Password should be at least')) {
					msg = '비밀번호는 최소 6자 이상이어야 합니다.';
				}
				throw new Error(msg);
			}

			// 이메일 인증이 꺼져있으면 즉시 세션 발급됨
			if (data.session) {
				this.session = data.session;
				this.user = this._formatUser(data.user);
				return {
					success: true,
					user: this.user,
					message: '회원가입 및 로그인이 완료되었습니다!'
				};
			} else {
				// 이메일 확인이 켜져 있는 경우
				return {
					success: true,
					user: this._formatUser(data.user),
					message: '가입 확인 메일이 발송되었습니다. 메일함에서 인증 링크를 확인해주세요.'
				};
			}
		} catch (err) {
			this.error = err.message;
			throw err;
		} finally {
			this.isLoading = false;
		}
	}

	/**
	 * 로그아웃 (Supabase signOut)
	 */
	async logout() {
		try {
			await supabase.auth.signOut();
		} catch (e) {
			console.warn('로그아웃 처리 중 예외:', e);
		} finally {
			this.user = null;
			this.session = null;
			this.error = null;
		}
	}

	/**
	 * 인증 헤더가 첨부된 fetch 유틸리티
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
