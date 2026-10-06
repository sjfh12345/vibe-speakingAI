<script>
	import { onMount } from 'svelte';
	import UserNav from '$lib/components/UserNav.svelte';
	import { supabase, isSupabaseConfigured, supabaseUrl, updateSupabaseConfig } from '$lib/supabaseClient.js';

	let { data } = $props();

	let loading = $state(true);
	let dbStatus = $state(null);
	let recordsData = $state(null);
	let errorMessage = $state('');
	let successMessage = $state('');

	// 새 레코드 입력 폼 상태
	let newTitle = $state('');
	let newContent = $state('');
	let isSubmitting = $state(false);
	let isCreatingTable = $state(false);
	let copied = $state(false);

	$effect(() => {
		if (data?.supabaseUrl && data?.supabaseAnonKey) {
			updateSupabaseConfig(data.supabaseUrl, data.supabaseAnonKey);
		}
	});

	const sampleSql = `-- 1. DB 연결 테스트용 테이블 생성
CREATE TABLE IF NOT EXISTS public.test_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    content TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 테스트용 초기 데이터 삽입
INSERT INTO public.test_records (title, content)
VALUES 
    ('Supabase 연결 성공!', 'SvelteKit과 Supabase가 직접 정상적으로 통신 중입니다.'),
    ('Speaking AI 연동 완료', 'Vercel 배포 환경에서도 안전하게 데이터를 저장하고 조회할 수 있습니다.');

-- 3. RLS(Row Level Security) 설정
ALTER TABLE public.test_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations for anon" 
ON public.test_records 
FOR ALL 
USING (true) 
WITH CHECK (true);`;

	async function fetchDbStatus() {
		loading = true;
		errorMessage = '';
		const startTime = performance.now();

		try {
			if (!isSupabaseConfigured) {
				dbStatus = {
					connected: false,
					error: 'PUBLIC_SUPABASE_URL 및 PUBLIC_SUPABASE_ANON_KEY 환경 변수가 설정되지 않았습니다.',
					masked_url: '미설정 (SUPABASE_ANON_KEY 필요)'
				};
				loading = false;
				return;
			}

			// Supabase test_records 쿼리 테스트
			const { data, error, count } = await supabase
				.from('test_records')
				.select('*', { count: 'exact' })
				.order('created_at', { ascending: false });

			const latency = Math.round(performance.now() - startTime);

			if (error) {
				if (error.code === '42P01' || error.message.includes('relation "public.test_records" does not exist')) {
					dbStatus = {
						connected: true,
						masked_url: supabaseUrl || 'https://supabase.co',
						latency_ms: latency,
						database_name: 'Supabase REST API (PostgreSQL)',
						has_test_records_table: false,
						test_records_count: 0
					};
					recordsData = { table_exists: false, count: 0, records: [] };
				} else {
					throw error;
				}
			} else {
				dbStatus = {
					connected: true,
					masked_url: supabaseUrl || 'https://supabase.co',
					latency_ms: latency,
					database_name: 'Supabase REST API (PostgreSQL)',
					has_test_records_table: true,
					test_records_count: count ?? data.length
				};
				recordsData = {
					table_exists: true,
					count: data.length,
					records: data
				};
			}
		} catch (err) {
			console.error('Supabase DB 상태 조회 에러:', err);
			dbStatus = {
				connected: false,
				masked_url: supabaseUrl || '미설정',
				error: err.message || 'Supabase 통신 오류'
			};
			errorMessage = err.message;
		} finally {
			loading = false;
		}
	}

	async function handleAddRecord(e) {
		e.preventDefault();
		if (!newTitle.trim()) return;

		isSubmitting = true;
		errorMessage = '';
		successMessage = '';

		try {
			const { data, error } = await supabase
				.from('test_records')
				.insert([
					{
						title: newTitle.trim(),
						content: newContent.trim()
					}
				])
				.select();

			if (error) {
				throw error;
			}

			newTitle = '';
			newContent = '';
			successMessage = '새 레코드가 Supabase에 성공적으로 저장되었습니다!';
			await fetchDbStatus();
			setTimeout(() => (successMessage = ''), 4000);
		} catch (err) {
			errorMessage = err.message || '데이터 저장에 실패했습니다.';
		} finally {
			isSubmitting = false;
		}
	}

	async function handleDeleteRecord(id) {
		if (!confirm('이 레코드를 삭제하시겠습니까?')) return;

		try {
			const { error } = await supabase.from('test_records').delete().eq('id', id);
			if (error) throw error;

			successMessage = '레코드가 삭제되었습니다.';
			await fetchDbStatus();
			setTimeout(() => (successMessage = ''), 3000);
		} catch (err) {
			errorMessage = err.message || '삭제 실패';
		}
	}

	async function handleInitTable() {
		isCreatingTable = true;
		errorMessage = '';
		successMessage = '';

		try {
			// 클라이언트 측에서는 SQL DDL(CREATE TABLE)을 직접 실행할 수 없으므로 기본 시드 데이터 삽입만 시도
			const { error } = await supabase
				.from('test_records')
				.insert([
					{
						title: 'Supabase 연결 성공!',
						content: 'SvelteKit 프론트엔드와 Supabase가 직접 정상적으로 통신 중입니다.'
					}
				]);

			if (error) {
				throw new Error('Supabase 대시보드의 SQL Editor에서 위의 SQL 쿼리를 먼저 실행해 주셔야 합니다: ' + error.message);
			}

			successMessage = '초기 테스트 데이터가 성공적으로 생성되었습니다!';
			await fetchDbStatus();
		} catch (err) {
			errorMessage = err.message;
		} finally {
			isCreatingTable = false;
		}
	}

	async function copySql() {
		try {
			await navigator.clipboard.writeText(sampleSql);
			copied = true;
			setTimeout(() => (copied = false), 2500);
		} catch (err) {
			console.error('클립보드 복사 실패:', err);
		}
	}

	onMount(() => {
		fetchDbStatus();
	});
</script>

<svelte:head>
	<title>Supabase PostgreSQL 연결 테스트 | Speaking AI</title>
</svelte:head>

<div class="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8 font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
	<div class="max-w-5xl mx-auto space-y-8">
		<!-- Header -->
		<header class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
			<div>
				<div class="flex items-center gap-3">
					<a href="/" class="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-slate-800" title="메인으로 돌아가기">
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
						</svg>
					</a>
					<div class="inline-flex items-center justify-center p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
						<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7M4 7c0-2 1-3 3-3h10c2 0 3 1 3 3M4 7h16m-8 4v6m-4-3h8" />
						</svg>
					</div>
					<h1 class="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
						Supabase DB 연결 테스트
					</h1>
				</div>
				<p class="text-slate-400 text-sm mt-1 ml-11">
					Supabase JS 클라이언트를 통한 PostgreSQL 통신 및 데이터 CRUD 테스트
				</p>
			</div>

			<div class="flex items-center gap-3">
				<button 
					onclick={fetchDbStatus} 
					disabled={loading}
					class="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-sm font-medium rounded-xl border border-slate-700 flex items-center gap-2 transition-all cursor-pointer shadow-sm active:scale-95"
				>
					<svg class="w-4 h-4 {loading ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
					</svg>
					새로고침
				</button>
				<a 
					href="/"
					class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-xl transition-all shadow-sm active:scale-95 flex items-center gap-2"
				>
					음성 에이전트 이동
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
					</svg>
				</a>
				<div class="pl-2 border-l border-slate-800">
					<UserNav />
				</div>
			</div>
		</header>

		<!-- Messages -->
		{#if errorMessage || (dbStatus && !dbStatus.connected && dbStatus.error)}
			{@const currentError = errorMessage || dbStatus.error}
			<div class="p-5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-200 flex flex-col gap-3">
				<div class="flex items-start gap-3">
					<svg class="w-5 h-5 text-rose-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					<div class="text-sm">
						<p class="font-bold text-rose-100">데이터베이스 연결/실행 실패 원인</p>
						<p class="mt-1 font-mono text-xs text-rose-300 bg-rose-950/50 p-2.5 rounded-lg border border-rose-800/40 select-all">{currentError}</p>
					</div>
				</div>

				<div class="bg-slate-900/80 p-4 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-2 mt-1">
					<p class="font-semibold text-amber-300 flex items-center gap-1.5">
						<span>💡 해결 가이드</span>
					</p>
					<ul class="list-disc list-inside space-y-1 text-slate-300">
						<li>
							<span class="text-slate-100 font-medium">환경변수 설정 확인:</span> <code class="text-emerald-400 bg-slate-950 px-1.5 py-0.5 rounded">PUBLIC_SUPABASE_URL</code> 및 <code class="text-emerald-400 bg-slate-950 px-1.5 py-0.5 rounded">PUBLIC_SUPABASE_ANON_KEY</code>가 <code class="text-slate-400">.env</code>에 등록되어 있는지 확인하세요.
						</li>
						<li>
							<span class="text-slate-100 font-medium">테이블 미존재 에러 발생 시:</span> 아래의 SQL 문구를 복사하여 <span class="text-teal-300">Supabase Dashboard &gt; SQL Editor</span>에 붙여넣고 실행하세요.
						</li>
						<li>
							<span class="text-slate-100 font-medium">RLS 정책 확인:</span> 데이터 조회/추가가 안 된다면 Supabase의 Row Level Security 정책이 허용되어 있는지 확인해 주세요.
						</li>
					</ul>
				</div>
			</div>
		{/if}

		{#if successMessage}
			<div class="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center gap-3">
				<svg class="w-5 h-5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
				</svg>
				<p class="text-sm font-medium">{successMessage}</p>
			</div>
		{/if}

		<!-- Connection Status Card -->
		<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
			<!-- Status Block 1 -->
			<div class="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm">
				<p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">연결 상태</p>
				<div class="mt-3 flex items-center gap-3">
					{#if loading}
						<div class="w-3.5 h-3.5 rounded-full bg-amber-400 animate-pulse"></div>
						<span class="text-lg font-bold text-amber-400">연결 확인 중...</span>
					{:else if dbStatus?.connected}
						<div class="w-3.5 h-3.5 rounded-full bg-emerald-400 ring-4 ring-emerald-400/20"></div>
						<span class="text-lg font-bold text-emerald-400">정상 연결됨 (Connected)</span>
					{:else}
						<div class="w-3.5 h-3.5 rounded-full bg-rose-400 ring-4 ring-rose-400/20"></div>
						<span class="text-lg font-bold text-rose-400">연결 실패 (Disconnected)</span>
					{/if}
				</div>
				{#if dbStatus?.latency_ms !== undefined}
					<p class="text-xs text-slate-400 mt-2">
						응답 지연시간: <span class="text-emerald-400 font-mono font-medium">{dbStatus.latency_ms} ms</span>
					</p>
				{/if}
			</div>

			<!-- Status Block 2 -->
			<div class="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm">
				<p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">연결 대상 엔드포인트</p>
				<p class="mt-3 text-sm font-mono text-slate-200 truncate" title={dbStatus?.masked_url || ''}>
					{dbStatus?.masked_url || 'SUPABASE_URL 미설정'}
				</p>
				<p class="text-xs text-slate-400 mt-2">
					엔진: <span class="text-slate-300 font-medium">{dbStatus?.database_name || '-'}</span>
				</p>
			</div>

			<!-- Status Block 3 -->
			<div class="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm">
				<p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">테이블 상태</p>
				<div class="mt-3 flex items-baseline gap-2">
					{#if dbStatus?.has_test_records_table}
						<span class="
