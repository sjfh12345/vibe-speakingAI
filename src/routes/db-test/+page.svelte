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

	// 🚨 핵심 수정 부분: /api/db/status fetch 제거 및 Supabase 직접 호출
	async function fetchDbStatus() {
		loading = true;
		errorMessage = '';
		const startTime = performance.now();

		try {
			if (!isSupabaseConfigured) {
				dbStatus = {
					connected: false,
					error: 'PUBLIC_SUPABASE_URL 및 PUBLIC_SUPABASE_ANON_KEY 환경 변수가 설정되지 않았습니다.',
					masked_url: '미설정'
				};
				loading = false;
				return;
			}

			// /api/db/status를 fetch 하지 않고 Supabase로 직접 쿼리
			const { data, error, count } = await supabase
				.from('test_records')
				.select('*', { count: 'exact' })
				.order('created_at', { ascending: false });

			const latency = Math.round(performance.now() - startTime);

			if (error) {
				// 테이블이 없는 경우 (PostgreSQL error 42P01)
				if (error.code === '42P01' || error.message.includes('does not exist')) {
					dbStatus = {
						connected: true,
						masked_url: supabaseUrl || 'https://supabase.co',
						latency_ms: latency,
						database_name: 'Supabase PostgreSQL',
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
					database_name: 'Supabase PostgreSQL',
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
			const { error } = await supabase
				.from('test_records')
				.insert([{ title: newTitle.trim(), content: newContent.trim() }]);

			if (error) throw error;

			newTitle = '';
			newContent = '';
			successMessage = '새 레코드가 Supabase에 저장되었습니다!';
			await fetchDbStatus();
			setTimeout(() => (successMessage = ''), 4000);
		} catch (err) {
			errorMessage = err.message || '데이터 저장 실패';
		} finally {
			isSubmitting = false;
		}
	}

	async function handleDeleteRecord(id) {
		if (!confirm('삭제하시겠습니까?')) return;

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

	async function copySql() {
		try {
			await navigator.clipboard.writeText(sampleSql);
			copied = true;
			setTimeout(() => (copied = false), 2500);
		} catch (err) {
			console.error('복사 실패:', err);
		}
	}

	onMount(() => {
		fetchDbStatus();
	});
</script>

<svelte:head>
	<title>Supabase 연결 테스트 | Speaking AI</title>
</svelte:head>

<div class="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8 font-sans">
	<div class="max-w-5xl mx-auto space-y-8">
		<!-- Header -->
		<header class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
			<div>
				<h1 class="text-2xl sm:text-3xl font-bold text-emerald-400">
					Supabase DB 연결 테스트
				</h1>
				<p class="text-slate-400 text-sm mt-1">
					Supabase JS 클라이언트 직접 통신 방식
				</p>
			</div>

			<div class="flex items-center gap-3">
				<button 
					onclick={fetchDbStatus} 
					disabled={loading}
					class="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-sm rounded-xl border border-slate-700"
				>
					{loading ? '조회 중...' : '새로고침'}
				</button>
				<UserNav />
			</div>
		</header>

		<!-- Messages -->
		{#if errorMessage || (dbStatus && !dbStatus.connected && dbStatus.error)}
			<div class="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-sm">
				<p class="font-bold">연결 에러:</p>
				<p class="font-mono mt-1">{errorMessage || dbStatus?.error}</p>
			</div>
		{/if}

		{#if successMessage}
			<div class="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm">
				{successMessage}
			</div>
		{/if}

		<!-- Status Cards -->
		<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
			<div class="bg-slate-900 border border-slate-800 rounded-2xl p-5">
				<p class="text-xs text-slate-400 uppercase">연결 상태</p>
				<p class="text-lg font-bold mt-2 {dbStatus?.connected ? 'text-emerald-400' : 'text-rose-400'}">
					{loading ? '확인 중...' : dbStatus?.connected ? '연결됨' : '연결 실패'}
				</p>
				{#if dbStatus?.latency_ms}
					<p class="text-xs text-slate-400 mt-1">지연시간: {dbStatus.latency_ms}ms</p>
				{/if}
			</div>

			<div class="bg-slate-900 border border-slate-800 rounded-2xl p-5">
				<p class="text-xs text-slate-400 uppercase">엔드포인트</p>
				<p class="text-sm font-mono text-slate-200 mt-2 truncate">{dbStatus?.masked_url || '-'}</p>
			</div>

			<div class="bg-slate-900 border border-slate-800 rounded-2xl p-5">
				<p class="text-xs text-slate-400 uppercase">테이블 상태</p>
				<p class="text-lg font-bold mt-2 {dbStatus?.has_test_records_table ? 'text-emerald-400' : 'text-amber-400'}">
					{dbStatus?.has_test_records_table ? '존재함' : '미생성'}
				</p>
				<p class="text-xs text-slate-400 mt-1">레코드 수: {dbStatus?.test_records_count ?? 0}개</p>
			</div>
		</div>

		<!-- SQL 안내 -->
		<div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3">
			<div class="flex justify-between items-center">
				<h2 class="text-base font-semibold text-slate-100">Supabase SQL Editor 실행용 쿼리</h2>
				<button onclick={copySql} class="px-3 py-1 bg-slate-800 text-xs rounded border border-slate-700">
					{copied ? '복사됨!' : 'SQL 복사'}
				</button>
			</div>
			<pre class="bg-slate-950 p-4 rounded-xl text-xs font-mono text-emerald-300 overflow-x-auto"><code>{sampleSql}</code></pre>
		</div>

		<!-- CRUD -->
		<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
			<!-- Form -->
			<div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
				<h3 class="text-base font-semibold">데이터 추가</h3>
				<form onsubmit={handleAddRecord} class="space-y-3">
					<div>
						<label for="title-input" class="text-xs text-slate-400 block mb-1">제목</label>
						<input id="title-input" type="text" bind:value={newTitle} required class="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-sm" />
					</div>
					<div>
						<label for="content-input" class="text-xs text-slate-400 block mb-1">내용</label>
						<textarea id="content-input" bind:value={newContent} rows="3" class="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-sm resize-none"></textarea>
					</div>
					<button type="submit" disabled={isSubmitting || !dbStatus?.connected} class="w-full py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium">
						{isSubmitting ? '저장 중...' : '저장'}
					</button>
				</form>
			</div>

			<!-- List -->
			<div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 lg:col-span-2 space-y-4">
				<h3 class="text-base font-semibold">데이터 목록</h3>
				{#if !recordsData?.table_exists}
					<p class="text-sm text-slate-400">`test_records` 테이블이 존재하지 않습니다. 위의 SQL을 Supabase에서 실행해 주세요.</p>
				{:else if recordsData.records.length === 0}
					<p class="text-sm text-slate-400">데이터가 없습니다.</p>
				{:else}
					<div class="space-y-2 max-h-80 overflow-y-auto">
						{#each recordsData.records as record (record.id)}
							<div class="p-3 bg-slate-950 border border-slate-800 rounded-lg flex justify-between items-start">
								<div>
									<h4 class="text-sm font-semibold">{record.title}</h4>
									<p class="text-xs text-slate-400 mt-1">{record.content}</p>
								</div>
								<button onclick={() => handleDeleteRecord(record.id)} class="text-xs text-rose-400 hover:underline">삭제</button>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
