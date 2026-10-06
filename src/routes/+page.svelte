<script>
	import AudioRecorder from '$lib/components/AudioRecorder.svelte';
	import AudioPlayer from '$lib/components/AudioPlayer.svelte';
	import RecordingsList from '$lib/components/RecordingsList.svelte';
	import AudioInfoPanel from '$lib/components/AudioInfoPanel.svelte';
	import RealtimeAgent from '$lib/components/RealtimeAgent.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import UserNav from '$lib/components/UserNav.svelte';

	let activeTab = $state('realtime'); // 'realtime' | 'studio'
	let recordings = $state([]);
	let selectedRecording = $state(null);

	// 녹음 완료 또는 파일 업로드 시
	function handleRecordComplete(newRecord) {
		recordings = [newRecord, ...recordings];
		selectedRecording = newRecord;
	}

	// 녹음 선택
	function handleSelectRecording(rec) {
		selectedRecording = rec;
	}

	// 녹음 삭제
	function handleDeleteRecording(id) {
		recordings = recordings.filter((r) => r.id !== id);
		if (selectedRecording?.id === id) {
			selectedRecording = recordings.length > 0 ? recordings[0] : null;
		}
	}

	// 녹음 이름 변경
	function handleRenameRecording(id, newName) {
		recordings = recordings.map((r) => {
			if (r.id === id) {
				return { ...r, name: newName };
			}
			return r;
		});
		if (selectedRecording?.id === id) {
			selectedRecording.name = newName;
		}
	}

	// 전체 삭제
	function handleClearAll() {
		if (confirm('저장된 모든 녹음 항목을 삭제하시겠습니까?')) {
			recordings.forEach((r) => {
				if (r.url && r.url.startsWith('blob:')) {
					URL.revokeObjectURL(r.url);
				}
			});
			recordings = [];
			selectedRecording = null;
		}
	}

	// 데모용 샘플 사운드 생성 (초기 테스트용)
	async function generateSampleVoice() {
		if (typeof window === 'undefined') return;
		try {
			const AudioContextClass = window.AudioContext || window.webkitAudioContext;
			if (!AudioContextClass) return;
			const ctx = new AudioContextClass();
			const sampleRate = ctx.sampleRate;
			const duration = 3.5;
			const numFrames = sampleRate * duration;
			const audioBuffer = ctx.createBuffer(1, numFrames, sampleRate);
			const channelData = audioBuffer.getChannelData(0);

			for (let i = 0; i < numFrames; i++) {
				const t = i / sampleRate;
				const freq1 = 220 + 40 * Math.sin(2 * Math.PI * 1.5 * t);
				const freq2 = freq1 * 2;
				const freq3 = freq1 * 3;
				const modulation = 0.5 + 0.5 * Math.sin(2 * Math.PI * 3 * t);

				const env = Math.min(1, t * 4) * Math.min(1, (duration - t) * 2);
				const sample =
					(0.5 * Math.sin(2 * Math.PI * freq1 * t) +
						0.3 * Math.sin(2 * Math.PI * freq2 * t) +
						0.2 * Math.sin(2 * Math.PI * freq3 * t)) *
					modulation *
					env *
					0.4;

				channelData[i] = sample;
			}

			const wavBlob = audioBufferToWav(audioBuffer);
			const url = URL.createObjectURL(wavBlob);

			const sampleRec = {
				id: 'sample_' + Date.now(),
				name: '샘플 목소리 데모 (테스트용)',
				url: url,
				blob: wavBlob,
				duration: duration,
				size: wavBlob.size,
				type: 'audio/wav',
				createdAt: new Date().toISOString()
			};

			handleRecordComplete(sampleRec);
			ctx.close();
		} catch (e) {
			console.error('샘플 생성 실패:', e);
		}
	}

	function audioBufferToWav(buffer) {
		const numOfChan = buffer.numberOfChannels;
		const length = buffer.length * numOfChan * 2 + 44;
		const out = new DataView(new ArrayBuffer(length));
		let pos = 0;
		let offset = 0;

		function setUint16(data) {
			out.setUint16(pos, data, true);
			pos += 2;
		}
		function setUint32(data) {
			out.setUint32(pos, data, true);
			pos += 4;
		}

		setUint32(0x46464952); // "RIFF"
		setUint32(length - 8);
		setUint32(0x45564157); // "WAVE"
		setUint32(0x20746d66); // "fmt "
		setUint32(16);
		setUint16(1); // PCM
		setUint16(numOfChan);
		setUint32(buffer.sampleRate);
		setUint32(buffer.sampleRate * 2 * numOfChan);
		setUint16(numOfChan * 2);
		setUint16(16);
		setUint32(0x61746164); // "data"
		setUint32(length - pos - 4);

		const channels = [];
		for (let i = 0; i < buffer.numberOfChannels; i++) {
			channels.push(buffer.getChannelData(i));
		}

		while (pos < length) {
			for (let i = 0; i < numOfChan; i++) {
				let sample = Math.max(-1, Math.min(1, channels[i][offset]));
				sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
				out.setInt16(pos, sample, true);
				pos += 2;
			}
			offset++;
		}

		return new Blob([out], { type: 'audio/wav' });
	}
</script>

<svelte:head>
	<title>Speaking AI - 초저지연 실시간 영어회화</title>
</svelte:head>

<div class="min-h-screen bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white font-sans antialiased">
	<!-- Top Navigation / Header -->
	<header class="border-b border-slate-800/80 bg-slate-900/50 backdrop-blur-md sticky top-0 z-30">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
			<div class="flex items-center gap-3">
				<div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
					<Icon name="waveform" size={20} />
				</div>
				<div>
					<h1 class="text-base sm:text-lg font-bold bg-gradient-to-r from-slate-100 via-indigo-200 to-purple-300 bg-clip-text text-transparent leading-tight">
						Speaking AI Live Studio
					</h1>
					<p class="text-[11px] text-slate-400 font-medium">초저지연 Realtime 회화 및 음성 스튜디오</p>
				</div>
			</div>

			<!-- Tab Selector & Actions -->
			<div class="flex items-center gap-3">
				<nav class="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
					<button
						type="button"
						onclick={() => (activeTab = 'realtime')}
						class="px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5
						{activeTab === 'realtime'
							? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/20'
							: 'text-slate-400 hover:text-slate-200'}"
					>
						<Icon name="mic" size={14} />
						<span>실시간 회화 (Live)</span>
					</button>

					<button
						type="button"
						onclick={() => (activeTab = 'studio')}
						class="px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5
						{activeTab === 'studio'
							? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/20'
							: 'text-slate-400 hover:text-slate-200'}"
					>
						<Icon name="disc" size={14} />
						<span>녹음 스튜디오</span>
					</button>

					<a
						href="/db-test"
						class="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-all flex items-center gap-1.5"
						title="Supabase PostgreSQL 통신 테스트"
					>
						<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
						<span>DB 테스트</span>
					</a>
				</nav>

					{#if activeTab === 'studio'}
						<button
							type="button"
							onclick={generateSampleVoice}
							class="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white border border-slate-700/60 transition-all cursor-pointer"
						>
							<Icon name="sparkles" size={14} class="text-indigo-400" />
							<span>샘플 생성</span>
						</button>
					{/if}

					<!-- 사용자 프로필 / 로그인 / 회원가입 UI -->
					<div class="ml-1 pl-2 border-l border-slate-800">
						<UserNav />
					</div>
				</div>
			</div>
	</header>

	<!-- Main Content Area -->
	<main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
		{#if activeTab === 'realtime'}
			<!-- Realtime Speech Agent Tab -->
			<div class="max-w-3xl mx-auto">
				<RealtimeAgent />
			</div>
		{:else}
			<!-- Voice Recording & Player Studio Tab -->
			<!-- Intro Banner -->
			<div class="mb-8 p-6 rounded-2xl bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-slate-900 border border-indigo-900/30 shadow-xl relative overflow-hidden">
				<div class="relative z-10 max-w-2xl">
					<h2 class="text-xl sm:text-2xl font-bold text-white mb-2 tracking-tight">
						내 목소리를 녹음하고 즉시 확인해보세요
					</h2>
					<p class="text-sm text-slate-300 leading-relaxed">
						마이크를 켜고 자연스럽게 말씀해보세요. 실시간 파형을 보며 녹음하고, 세부 플레이어를 통해 언제든 음성을 듣고 특정 구간을 탐색하며 품질을 점검할 수 있습니다.
					</p>
				</div>
				<div class="absolute -right-10 -bottom-10 w-64 h-64 rounded-full bg-indigo-600/10 blur-3xl pointer-events-none"></div>
			</div>

			<!-- Grid Layout -->
			<div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
				<!-- Left Column: Voice Recording & Active Player (7 cols) -->
				<div class="lg:col-span-7 space-y-6">
					<section>
						<AudioRecorder onRecordComplete={handleRecordComplete} />
					</section>

					<section>
						<div class="flex items-center justify-between mb-3 px-1">
							<h2 class="text-sm font-bold text-slate-300 flex items-center gap-2">
								<Icon name="waveform" size={16} class="text-indigo-400" />
								녹음본 재생 및 확인
							</h2>
							{#if selectedRecording}
								<span class="text-xs text-indigo-400 font-medium">
									파형을 클릭하여 원하는 시점으로 즉시 이동할 수 있습니다.
								</span>
							{/if}
						</div>
						<AudioPlayer
							recording={selectedRecording}
							onDelete={handleDeleteRecording}
						/>
					</section>
				</div>

				<!-- Right Column: Recordings History Library & Voice Info (5 cols) -->
				<div class="lg:col-span-5 space-y-6">
					<section>
						<RecordingsList
							{recordings}
							selectedId={selectedRecording?.id}
							onSelect={handleSelectRecording}
							onDelete={handleDeleteRecording}
							onRename={handleRenameRecording}
							onClearAll={handleClearAll}
						/>
					</section>

					<section>
						<AudioInfoPanel recording={selectedRecording} />
					</section>
				</div>
			</div>
		{/if}
	</main>

	<!-- Footer -->
	<footer class="mt-16 border-t border-slate-900 py-6 text-center text-xs text-slate-500">
		<div class="max-w-7xl mx-auto px-4">
			Speaking AI Voice Interface • OpenAI Realtime WebRTC & Ultra-Low Latency VAD
		</div>
	</footer>
</div>
