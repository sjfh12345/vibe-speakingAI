<script>
	import { auth } from '$lib/auth.svelte.js';
	import Icon from './Icon.svelte';
	import AuthModal from './AuthModal.svelte';

	let isAuthModalOpen = $state(false);
	let authModalMode = $state('login');
	let isDropdownOpen = $state(false);

	function openLoginModal() {
		authModalMode = 'login';
		isAuthModalOpen = true;
		isDropdownOpen = false;
	}

	function openRegisterModal() {
		authModalMode = 'register';
		isAuthModalOpen = true;
		isDropdownOpen = false;
	}

	function handleLogout() {
		auth.logout();
		isDropdownOpen = false;
	}

	function toggleDropdown() {
		isDropdownOpen = !isDropdownOpen;
	}

	function handleWindowClick(e) {
		if (isDropdownOpen && !e.target.closest('#user-menu-container')) {
			isDropdownOpen = false;
		}
	}
</script>

<svelte:window onclick={handleWindowClick} />

<div id="user-menu-container" class="relative inline-flex items-center gap-2">
	{#if auth.isAuthenticated && auth.user}
		<!-- 로그인된 상태 -->
		<div class="relative">
			<button
				type="button"
				onclick={toggleDropdown}
				class="flex items-center gap-2.5 rounded-full border border-teal-500/30 bg-slate-800/90 py-1.5 pl-2 pr-3 text-sm text-slate-200 hover:border-teal-400 hover:bg-slate-800 transition-all cursor-pointer shadow-sm"
			>
				<div class="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-tr from-teal-500 to-emerald-400 text-xs font-bold text-slate-950 shadow-sm">
					{auth.user.name ? auth.user.name.charAt(0).toUpperCase() : 'U'}
				</div>
				<span class="font-medium text-slate-100 max-w-[120px] truncate">{auth.user.name}</span>
				<svg class="h-4 w-4 text-slate-400 transition-transform {isDropdownOpen ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
				</svg>
			</button>

			{#if isDropdownOpen}
				<div
					class="absolute right-0 mt-2 w-64 rounded-2xl border border-slate-700 bg-slate-900/95 p-2 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in slide-in-from-top-2"
				>
					<div class="px-3 py-2.5 border-b border-slate-800 mb-1">
						<p class="text-xs font-medium text-slate-400">로그인 계정</p>
						<p class="text-sm font-semibold text-white truncate mt-0.5">{auth.user.name}</p>
						<p class="text-xs text-slate-400 truncate">{auth.user.email}</p>
					</div>

					<div class="space-y-0.5">
						<a
							href="/db-test"
							class="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-teal-300 transition-colors"
						>
							<Icon name="sparkles" size={16} />
							<span>Supabase DB 상태 확인</span>
						</a>

						<button
							type="button"
							onclick={handleLogout}
							class="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors cursor-pointer"
						>
							<Icon name="log-out" size={16} />
							<span>로그아웃</span>
						</button>
					</div>
				</div>
			{/if}
		</div>
	{:else}
		<!-- 비로그인 상태 -->
		<div class="flex items-center gap-2">
			<button
				type="button"
				onclick={openLoginModal}
				class="rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-1.5 text-xs font-semibold text-slate-300 hover:border-slate-600 hover:bg-slate-700 hover:text-white transition-all cursor-pointer"
			>
				로그인
			</button>
			<button
				type="button"
				onclick={openRegisterModal}
				class="rounded-xl bg-gradient-to-r from-teal-400 to-emerald-400 px-3.5 py-1.5 text-xs font-bold text-slate-950 shadow-md shadow-teal-500/20 hover:opacity-95 active:scale-95 transition-all cursor-pointer"
			>
				회원가입
			</button>
		</div>
	{/if}
</div>

<!-- 인증 모달 -->
<AuthModal bind:isOpen={isAuthModalOpen} initialMode={authModalMode} />
