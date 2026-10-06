<script>
	import { onMount } from 'svelte';
	import UserNav from '$lib/components/UserNav.svelte';
	import { supabase, isSupabaseConfigured } from '$lib/supabaseClient.js';

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
					error: 'PUBLIC_SUPABASE_URL 또는 PUBLIC_SUPABASE_ANON_KEY가 .env 파일(또는 Vercel 환경 변수)에 설정되지 않았습니다.',
					masked_url: '미설정 (API Key 필요)'
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
						masked_url: 'https://iwsvipldfphknjzyrvoj.supabase.co',
						latency_ms: latency,
						database_name: 'postgres (Supabase)',
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
					masked_url: 'https://iwsvipldfphknjzyrvoj.supabase.co',
					latency_ms: latency,
					database_name: 'postgres (Supabase)',
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
				masked_url: 'https://iwsvipldfphknjzyrvoj.supabase.co',
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
			// 초기 레코드 삽입 시도 (테이블이 있을 때)
			const { error } = await supabase
				.from('test_records')
				.insert([
					{
						title: 'Supabase 연결 성공!',
						content: 'Vercel 프론트엔드와 Supabase가 직접 정상적으로 통신 중입니다.'
					}
				]);

			if (error) {
				throw new Error('Supabase SQL Editor에서 위의 CREATE TABLE 쿼리를 먼저 1회 실행해주세요: ' + error.message);
			}

			successMessage = '테이블 데이터가 준비되었습니다!';
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
					FastAPI 백엔드를 통한 Supabase PostgreSQL 통신 및 데이터 입출력 테스트
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
						<p class="font-bold text-rose-100">데이터베이스 연결 실패 원인</p>
						<p class="mt-1 font-mono text-xs text-rose-300 bg-rose-950/50 p-2.5 rounded-lg border border-rose-800/40 select-all">{currentError}</p>
					</div>
				</div>

				<div class="bg-slate-900/80 p-4 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-2 mt-1">
					<p class="font-semibold text-amber-300 flex items-center gap-1.5">
						<span>💡 해결 가이드</span>
					</p>
					<ul class="list-disc list-inside space-y-1 text-slate-300">
						<li>
							<span class="text-slate-100 font-medium">URL 형태 확인:</span> <code class="text-emerald-400 bg-slate-950 px-1.5 py-0.5 rounded">https://...</code>(REST API)가 아니라 <code class="text-emerald-400 bg-slate-950 px-1.5 py-0.5 rounded">postgresql://postgres.[ref]:[PASSWORD]@...</code> 형태여야 합니다.
						</li>
						<li>
							<span class="text-slate-100 font-medium">Supabase 확인 위치:</span> Supabase 대시보드 &gt; 프로젝트 &gt; <span class="text-teal-300">Connect 버튼</span> &gt; <span class="text-teal-300">Connection string &gt; URI</span>를 복사하세요.
						</li>
						<li>
							<span class="text-slate-100 font-medium">비밀번호 변경:</span> <code class="text-amber-400">[YOUR-PASSWORD]</code> 자리에 Supabase 프로젝트 생성 시 설정한 실제 DB 비밀번호를 입력해야 합니다.
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
				<p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">연결 대상 DB</p>
				<p class="mt-3 text-sm font-mono text-slate-200 truncate" title={dbStatus?.masked_url || ''}>
					{dbStatus?.masked_url || 'SUPABASE_DB_URL 미설정'}
				</p>
				<p class="text-xs text-slate-400 mt-2">
					데이터베이스: <span class="text-slate-300 font-medium">{dbStatus?.database_name || '-'}</span>
				</p>
			</div>

			<!-- Status Block 3 -->
			<div class="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm">
				<p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Public 테이블 현황</p>
				<div class="mt-3 flex items-baseline gap-2">
					<span class="text-2xl font-bold text-slate-100">
						{dbStatus?.public_tables ? dbStatus.public_tables.length : 0}
					</span>
					<span class="text-xs text-slate-400">개 테이블 감지됨</span>
				</div>
				<div class="mt-2 text-xs text-slate-400 truncate">
					{#if dbStatus?.public_tables && dbStatus.public_tables.length > 0}
						목록: <span class="text-teal-300">{dbStatus.public_tables.join(', ')}</span>
					{:else}
						<span class="text-amber-300/80">현재 public 스키마에 테이블이 없습니다.</span>
					{/if}
				</div>
			</div>
		</div>

		<!-- SQL 안내 및 원클릭 생성 섹션 -->
		<div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
			<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
				<div>
					<h2 class="text-lg font-semibold text-slate-100 flex items-center gap-2">
						<svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
						</svg>
						테이블 생성 SQL 쿼리 (Supabase SQL Editor 실행용)
					</h2>
					<p class="text-xs text-slate-400 mt-0.5">
						Supabase Dashboard &gt; SQL Editor에 복사하여 붙여넣거나, 아래 원클릭 버튼으로 즉시 생성할 수 있습니다.
					</p>
				</div>
				<div class="flex items-center gap-2 shrink-0">
					<button 
						onclick={copySql}
						class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
					>
						{#if copied}
							<svg class="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
							</svg>
							<span class="text-emerald-400">복사 완료!</span>
						{:else}
							<svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
							</svg>
							<span>SQL 복사하기</span>
						{/if}
					</button>

					<button 
						onclick={handleInitTable}
						disabled={isCreatingTable || !dbStatus?.connected}
						class="px-3 py-1.5 bg-emerald-600/90 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
					>
						{#if isCreatingTable}
							<svg class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
							</svg>
							<span>생성 중...</span>
						{:else}
							<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
							</svg>
							<span>여기서 테이블 즉시 생성</span>
						{/if}
					</button>
				</div>
			</div>

			<pre class="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs font-mono text-emerald-300 overflow-x-auto leading-relaxed selection:bg-emerald-500/40"><code>{sampleSql}</code></pre>
		</div>

		<!-- CRUD Test Section -->
		<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
			<!-- Form: 새 레코드 추가 -->
			<div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 lg:col-span-1 space-y-4">
				<h3 class="text-base font-semibold text-slate-100 flex items-center gap-2">
					<svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
					</svg>
					새 테스트 데이터 추가
				</h3>
				<p class="text-xs text-slate-400">
					DB 쓰기(INSERT) 테스트를 위해 제목과 내용을 입력하고 저장해 보세요.
				</p>

				<form onsubmit={handleAddRecord} class="space-y-3 pt-2">
					<div>
						<label for="record-title" class="block text-xs font-medium text-slate-300 mb-1">제목 (Title)</label>
						<input 
							id="record-title"
							type="text" 
							bind:value={newTitle} 
							placeholder="예: 첫 번째 통신 테스트" 
							required
							class="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
						/>
					</div>
					<div>
						<label for="record-content" class="block text-xs font-medium text-slate-300 mb-1">내용 (Content)</label>
						<textarea 
							id="record-content"
							bind:value={newContent} 
							rows="3" 
							placeholder="예: Supabase PostgreSQL과 FastAPI 간의 통신이 원활하게 작동합니다." 
							class="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 resize-none"
						></textarea>
					</div>
					<button 
						type="submit" 
						disabled={isSubmitting || !dbStatus?.connected || !newTitle.trim()}
						class="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium text-sm rounded-xl transition-all cursor-pointer shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2"
					>
						{#if isSubmitting}
							<svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
							</svg>
							저장 중...
						{:else}
							<span>데이터베이스에 저장</span>
						{/if}
					</button>
				</form>
			</div>

			<!-- List: 레코드 목록 조회 -->
			<div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 lg:col-span-2 space-y-4">
				<div class="flex items-center justify-between">
					<h3 class="text-base font-semibold text-slate-100 flex items-center gap-2">
						<svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
						</svg>
						저장된 데이터 목록 (test_records)
					</h3>
					<span class="text-xs text-slate-400 bg-slate-800 px-2.5 py-1 rounded-full border border-slate-700">
						총 {recordsData?.records ? recordsData.records.length : 0}건
					</span>
				</div>

				{#if !recordsData?.table_exists}
					<div class="p-6 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/40">
						<p class="text-slate-400 text-sm">
							아직 <code class="text-emerald-400 font-mono">public.test_records</code> 테이블이 생성되지 않았습니다.
						</p>
						<p class="text-xs text-slate-500 mt-1">
							위의 SQL 쿼리를 Supabase에서 실행하거나 [여기서 테이블 즉시 생성] 버튼을 눌러주세요.
						</p>
					</div>
				{:else if recordsData.records.length === 0}
					<div class="p-6 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/40">
						<p class="text-slate-400 text-sm">저장된 테스트 레코드가 없습니다.</p>
						<p class="text-xs text-slate-500 mt-1">왼쪽 폼에서 첫 번째 데이터를 추가해보세요!</p>
					</div>
				{:else}
					<div class="space-y-3 max-h-[420px] overflow-y-auto pr-1">
						{#each recordsData.records as record (record.id)}
							<div class="p-4 bg-slate-950/70 border border-slate-800/80 rounded-xl hover:border-slate-700 transition-all flex items-start justify-between gap-4 group">
								<div class="space-y-1 min-w-0">
									<h4 class="text-sm font-semibold text-slate-200 truncate">{record.title}</h4>
									{#if record.content}
										<p class="text-xs text-slate-400 whitespace-pre-wrap leading-relaxed">{record.content}</p>
									{/if}
									<div class="flex items-center gap-3 pt-1 text-[11px] text-slate-500">
										<span class="font-mono">{record.id.slice(0, 8)}...</span>
										<span>•</span>
										<span>{record.created_at ? new Date(record.created_at).toLocaleString() : ''}</span>
									</div>
								</div>
								<button 
									onclick={() => handleDeleteRecord(record.id)}
									class="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors opacity-80 group-hover:opacity-100 cursor-pointer"
									title="삭제"
								>
									<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
									</svg>
								</button>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
