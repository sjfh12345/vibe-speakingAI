<script>
	import { auth } from '$lib/auth.svelte.js';
	import Icon from './Icon.svelte';

	let { isOpen = $bindable(false), initialMode = 'login', onSuccess = () => {} } = $props();

	let mode = $state('login'); // 'login' | 'register'
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let name = $state('');
	let showPassword = $state(false);
	let localError = $state('');
	let localSuccess = $state('');
	let isSubmitting = $state(false);

	// 비밀번호 유효성 및 일치 여부 실시간 파생 상태 (Svelte 5 Runes)
	let isPasswordLengthValid = $derived(password.length >= 6);
	let hasConfirmInput = $derived(confirmPassword.length > 0);
	let isPasswordMatch = $derived(hasConfirmInput && password === confirmPassword);
	let isPasswordMismatch = $derived(hasConfirmInput && password !== confirmPassword);

	// 모드가 변경되거나 팝업이 열릴 때 초기화
	$effect(() => {
		if (isOpen) {
			localError = '';
			localSuccess = '';
			mode = initialMode;
		}
	});

	function switchMode(newMode) {
		mode = newMode;
		localError = '';
		localSuccess = '';
		password = '';
		confirmPassword = '';
	}

	function handleClose() {
		isOpen = false;
		localError = '';
		localSuccess = '';
	}

	function handleBackdropClick(e) {
		if (e.target === e.currentTarget) {
			handleClose();
		}
	}

	function handleKeydown(e) {
		if (e.key === 'Escape' && isOpen) {
			handleClose();
		}
	}

	function clearError() {
		if (localError) localError = '';
	}

	async function handleSubmit(e) {
		e.preventDefault();
		localError = '';
		localSuccess = '';

		const trimmedEmail = email.trim();
		const trimmedName = name.trim();

		// 클라이언트 상세 유효성 검사
		if (mode === 'register') {
			if (!trimmedName) {
				localError = '이름(또는 닉네임)을 입력해주세요.';
				return;
			}
		}

		if (!trimmedEmail) {
			localError = '이메일 주소를 입력해주세요.';
			return;
		}
		if (!trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
			localError = '올바른 이메일 형식(예: user@example.com)으로 입력해주세요.';
			return;
		}

		if (!password) {
			localError = '비밀번호를 입력해주세요.';
			return;
		}

		if (mode === 'register') {
			if (password.length < 6) {
				localError = '비밀번호는 최소 6자 이상이어야 합니다.';
				return;
			}
			if (!confirmPassword) {
				localError = '비밀번호 확인란을 입력해주세요.';
				return;
			}
			if (password !== confirmPassword) {
				localError = '비밀번호와 비밀번호 확인이 일치하지 않습니다.';
				return;
			}
		}

		isSubmitting = true;

		try {
			if (mode === 'login') {
				const res = await auth.login(trimmedEmail, password);
				localSuccess = res.message || '로그인에 성공했습니다!';
			} else {
				const res = await auth.register(trimmedEmail, password, trimmedName);
				localSuccess = res.message || '회원가입이 완료되었습니다!';
			}

			// 성공 시 0.8초 후 모달 닫기
			setTimeout(() => {
				isOpen = false;
				onSuccess(auth.user);
				password = '';
				confirmPassword = '';
				localSuccess = '';
			}, 800);
		} catch (err) {
			console.error('인증 처리 오류:', err);
			localError = err.message || '처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
		} finally {
			isSubmitting = false;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 transition-all duration-300 animate-in fade-in"
		onclick={handleBackdropClick}
		role="presentation"
	>
		<div
			class="relative w-full max-w-md overflow-hidden rounded-3xl border border-slate-700/80 bg-slate-900/95 p-6 sm:p-8 shadow-2xl shadow-teal-950/40 backdrop-blur-xl transition-all"
			role="dialog"
			aria-modal="true"
			aria-labelledby="auth-modal-title"
		>
			<!-- 상단 배경 글로우 효과 -->
			<div class="absolute -top-24 -left-20 h-48 w-48 rounded-full bg-teal-500/20 blur-3xl pointer-events-none"></div>
			<div class="absolute -bottom-24 -right-20 h-48 w-48 rounded-full bg-emerald-500/20 blur-3xl pointer-events-none"></div>

			<!-- 상단 좌측: 뒤로가기 / 취소 버튼 -->
			<button
				type="button"
				onclick={handleClose}
				class="absolute top-5 left-5 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800/80 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700/60 transition-all cursor-pointer shadow-sm active:scale-95"
				aria-label="이전 화면으로 돌아가기"
			>
				<Icon name="arrow-left" size={14} />
				<span>뒤로가기</span>
			</button>

			<!-- 상단 우측: 닫기 (X) 버튼 -->
			<button
				type="button"
				onclick={handleClose}
				class="absolute top-5 right-5 flex h-8 w-8 items-center justify-center rounded-full bg-slate-800/80 text-slate-400 hover:bg-slate-700 hover:text-white border border-slate-700/60 transition-all cursor-pointer shadow-sm active:scale-95"
				aria-label="닫기"
			>
				<Icon name="x" size={16} />
			</button>

			<!-- 로고 / 헤더 -->
			<div class="mt-4 mb-6 text-center">
				<div class="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-teal-500 to-emerald-400 shadow-lg shadow-teal-500/20 mb-3">
					<Icon name="sparkles" size={24} class="text-slate-950" />
				</div>
				<h2 id="auth-modal-title" class="text-2xl font-bold tracking-tight text-white">
					{mode === 'login' ? 'Speaking AI 로그인' : 'Speaking AI 회원가입'}
				</h2>
				<p class="mt-1 text-sm text-slate-400">
					{mode === 'login'
						? '초저지연 AI 음성 튜터와 함께 실시간 대화를 시작하세요'
						: '간단한 회원가입으로 나만의 맞춤형 음성 세션을 저장하세요'}
				</p>
			</div>

			<!-- 탭 전환 (로그인 / 회원가입) -->
			<div class="mb-6 flex rounded-xl bg-slate-800/80 p-1 border border-slate-700/50">
				<button
					type="button"
					onclick={() => switchMode('login')}
					class="flex-1 rounded-lg py-2 text-sm font-semibold transition-all cursor-pointer {mode === 'login'
						? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-slate-950 shadow-md shadow-teal-500/20'
						: 'text-slate-400 hover:text-white'}"
				>
					로그인
				</button>
				<button
					type="button"
					onclick={() => switchMode('register')}
					class="flex-1 rounded-lg py-2 text-sm font-semibold transition-all cursor-pointer {mode === 'register'
						? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-slate-950 shadow-md shadow-teal-500/20'
						: 'text-slate-400 hover:text-white'}"
				>
					회원가입
				</button>
			</div>

			<!-- 알림 메시지 (에러 / 성공) -->
			{#if localError}
				<div class="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/15 px-4 py-3 text-xs text-rose-200 flex items-start gap-2 animate-shake shadow-md">
					<span class="font-bold text-rose-400 shrink-0">⚠️</span>
					<span class="leading-relaxed">{localError}</span>
				</div>
			{/if}

			{#if localSuccess}
				<div class="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-3 text-xs text-emerald-200 flex items-start gap-2 shadow-md">
					<Icon name="check" size={16} class="text-emerald-400 shrink-0 mt-0.5" />
					<span class="leading-relaxed">{localSuccess}</span>
				</div>
			{/if}

			<!-- 폼 영역 -->
			<form onsubmit={handleSubmit} class="space-y-4">
				{#if mode === 'register'}
					<!-- 이름 / 닉네임 입력 (회원가입 전용) -->
					<div>
						<label for="name-input" class="block text-xs font-medium text-slate-300 mb-1.5">이름 또는 닉네임</label>
						<div class="relative">
							<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
								<Icon name="user" size={18} />
							</div>
							<input
								id="name-input"
								type="text"
								bind:value={name}
								oninput={clearError}
								placeholder="예: 홍길동"
								class="w-full rounded-xl border border-slate-700 bg-slate-800/80 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/20 transition-all"
							/>
						</div>
					</div>
				{/if}

				<!-- 이메일 입력 -->
				<div>
					<label for="email-input" class="block text-xs font-medium text-slate-300 mb-1.5">이메일 주소</label>
					<div class="relative">
						<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
							<Icon name="mail" size={18} />
						</div>
						<input
							id="email-input"
							type="email"
							bind:value={email}
							oninput={clearError}
							placeholder="name@example.com"
							class="w-full rounded-xl border border-slate-700 bg-slate-800/80 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/20 transition-all"
						/>
					</div>
				</div>

				<!-- 비밀번호 입력 -->
				<div>
					<div class="flex items-center justify-between mb-1.5">
						<label for="password-input" class="block text-xs font-medium text-slate-300">비밀번호</label>
						{#if mode === 'register' && password.length > 0}
							<span class="text-[11px] font-medium {isPasswordLengthValid ? 'text-emerald-400' : 'text-amber-400'}">
								{isPasswordLengthValid ? '✓ 6자 이상 충족' : `최소 6자 이상 (${password.length}/6)`}
							</span>
						{/if}
					</div>
					<div class="relative">
						<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
							<Icon name="lock" size={18} />
						</div>
						<input
							id="password-input"
							type={showPassword ? 'text' : 'password'}
							bind:value={password}
							oninput={clearError}
							placeholder={mode === 'register' ? '6자 이상 입력해주세요' : '비밀번호를 입력하세요'}
							class="w-full rounded-xl border border-slate-700 bg-slate-800/80 py-2.5 pl-10 pr-11 text-sm text-white placeholder-slate-500 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/20 transition-all"
						/>
						<button
							type="button"
							onclick={() => (showPassword = !showPassword)}
							class="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
							aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
						>
							<Icon name={showPassword ? 'eye-off' : 'eye'} size={18} />
						</button>
					</div>
				</div>

				<!-- 비밀번호 확인 (회원가입 전용 및 즉각적인 일치 상태 피드백) -->
				{#if mode === 'register'}
					<div>
						<label for="confirm-pw-input" class="block text-xs font-medium text-slate-300 mb-1.5">비밀번호 확인</label>
						<div class="relative">
							<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
								<Icon name="lock" size={18} />
							</div>
							<input
								id="confirm-pw-input"
								type={showPassword ? 'text' : 'password'}
								bind:value={confirmPassword}
								oninput={clearError}
								placeholder="동일한 비밀번호를 다시 입력하세요"
								class="w-full rounded-xl py-2.5 pl-10 pr-11 text-sm text-white placeholder-slate-500 transition-all bg-slate-800/80 border
								{hasConfirmInput
									? isPasswordMatch
										? 'border-emerald-500/80 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20'
										: 'border-rose-500/80 focus:border-rose-400 focus:ring-2 focus:ring-rose-400/20'
									: 'border-slate-700 focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20'}"
							/>
							<!-- 우측 일치/불일치 상태 아이콘 -->
							{#if hasConfirmInput}
								<div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5">
									{#if isPasswordMatch}
										<span class="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
											<Icon name="check" size={13} />
										</span>
									{:else}
										<span class="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500/20 text-rose-400">
											<Icon name="x" size={13} />
										</span>
									{/if}
								</div>
							{/if}
						</div>

						<!-- 즉각적인 일치 여부 상태 메시지 -->
						<div class="mt-1.5 flex items-center gap-1.5 text-xs">
							{#if hasConfirmInput}
								{#if isPasswordMatch}
									<span class="inline-flex items-center gap-1 text-emerald-400 font-medium">
										<Icon name="check" size={14} class="text-emerald-400" />
										<span>비밀번호가 일치합니다.</span>
									</span>
								{:else}
									<span class="inline-flex items-center gap-1 text-rose-400 font-medium">
										<Icon name="x" size={14} class="text-rose-400" />
										<span>비밀번호가 일치하지 않습니다.</span>
									</span>
								{/if}
							{:else}
								<span class="text-slate-400 text-[11px]">
									* 위에서 입력한 비밀번호와 동일하게 입력해주세요.
								</span>
							{/if}
						</div>
					</div>
				{/if}

				<!-- 액션 버튼 영역 (취소 버튼 + 제출 버튼) -->
				<div class="mt-5 flex items-center gap-2.5">
					<button
						type="button"
						onclick={handleClose}
						disabled={isSubmitting}
						class="flex-1 py-3 px-4 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 hover:text-white text-slate-300 text-sm font-semibold transition-all cursor-pointer disabled:opacity-50 text-center active:scale-95"
					>
						취소
					</button>

					<button
						type="submit"
						disabled={isSubmitting}
						class="flex-[2] flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-400 via-emerald-400 to-teal-500 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-teal-500/25 hover:opacity-95 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
					>
						{#if isSubmitting}
							<svg class="h-4 w-4 animate-spin text-slate-950" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
							</svg>
							<span>{mode === 'login' ? '로그인 중...' : '가입 중...'}</span>
						{:else}
							<Icon name={mode === 'login' ? 'log-in' : 'sparkles'} size={18} />
							<span>{mode === 'login' ? '로그인하기' : '회원가입 완료'}</span>
						{/if}
					</button>
				</div>
			</form>

			<!-- 하단 가이드 링크 -->
			<div class="mt-6 text-center text-xs text-slate-400">
				{#if mode === 'login'}
					계정이 없으신가요?
					<button
						type="button"
						onclick={() => switchMode('register')}
						class="ml-1 font-semibold text-teal-400 hover:text-teal-300 hover:underline cursor-pointer"
					>
						지금 회원가입하기
					</button>
				{:else}
					이미 계정이 있으신가요?
					<button
						type="button"
						onclick={() => switchMode('login')}
						class="ml-1 font-semibold text-teal-400 hover:text-teal-300 hover:underline cursor-pointer"
					>
						로그인하기
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}
