<script>
	import { onDestroy } from 'svelte';
	import { formatTime, formatBytes } from '$lib/utils.js';
	import { pcmChunksToWavBlob } from '$lib/wavEncoder.js';
	import Icon from '$lib/components/Icon.svelte';
	import AudioVisualizer from '$lib/components/AudioVisualizer.svelte';

	let { onRecordComplete = null } = $props();

	// State
	let recordingState = $state('idle'); // 'idle' | 'recording' | 'paused'
	let recordingTime = $state(0);
	let timerInterval = null;
	let mediaStream = $state(null);
	let errorMessage = $state('');
	let isDragOver = $state(false);
	let fileInputRef = $state(null);
	let selectedDevice = $state('');
	let audioDevices = $state([]);

	// Web Audio PCM Recording Nodes
	let recAudioCtx = null;
	let sourceNode = null;
	let processorNode = null;
	let pcmChunks = [];
	let recordingStartTime = 0;

	async function getAudioDevices() {
		try {
			if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
				const devices = await navigator.mediaDevices.enumerateDevices();
				audioDevices = devices.filter(d => d.kind === 'audioinput');
			}
		} catch (e) {
			console.warn('마이크 장치 목록 조회 불가:', e);
		}
	}

	async function startRecording() {
		errorMessage = '';
		pcmChunks = [];
		recordingTime = 0;

		try {
			const constraints = {
				audio: {
					deviceId: selectedDevice ? { exact: selectedDevice } : undefined,
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true
				}
			};

			const stream = await navigator.mediaDevices.getUserMedia(constraints);
			mediaStream = stream;

			// 장치 목록 업데이트
			getAudioDevices();

			// Web Audio PCM 파이프라인 생성
			const AudioContextClass = window.AudioContext || window.webkitAudioContext;
			recAudioCtx = new AudioContextClass();
			if (recAudioCtx.state === 'suspended') {
				await recAudioCtx.resume();
			}

			sourceNode = recAudioCtx.createMediaStreamSource(stream);
			
			// ScriptProcessor로 버퍼 크기 4096 (안정적인 PCM 수집)
			const bufferSize = 4096;
			processorNode = recAudioCtx.createScriptProcessor(bufferSize, 1, 1);

			processorNode.onaudioprocess = (e) => {
				if (recordingState === 'recording') {
					const inputData = e.inputBuffer.getChannelData(0);
					// Clone input data
					pcmChunks.push(new Float32Array(inputData));
				}
			};

			sourceNode.connect(processorNode);
			processorNode.connect(recAudioCtx.destination);

			recordingState = 'recording';
			recordingStartTime = Date.now();

			// 타이머 시작 (100ms)
			timerInterval = setInterval(() => {
				if (recordingState === 'recording') {
					recordingTime = (Date.now() - recordingStartTime) / 1000;
				}
			}, 100);
		} catch (err) {
			console.error('마이크 접근 오류:', err);
			recordingState = 'idle';
			if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
				errorMessage = '마이크 접근 권한이 거부되었습니다. 브라우저 설정에서 마이크 권한을 허용해주세요.';
			} else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
				errorMessage = '연결된 마이크 장치를 찾을 수 없습니다.';
			} else {
				errorMessage = `녹음을 시작할 수 없습니다: ${err.message || '알 수 없는 오류'}`;
			}
		}
	}

	function pauseRecording() {
		if (recordingState === 'recording') {
			recordingState = 'paused';
		}
	}

	function resumeRecording() {
		if (recordingState === 'paused') {
			recordingState = 'recording';
		}
	}

	function stopRecording() {
		if (recordingState === 'idle') return;

		const sampleRate = recAudioCtx ? recAudioCtx.sampleRate : 44100;
		const finalDuration = Math.max(0.1, recordingTime);

		// Stop processing
		cleanupAudioPipeline();
		recordingState = 'idle';

		if (timerInterval) {
			clearInterval(timerInterval);
			timerInterval = null;
		}

		if (pcmChunks.length === 0) {
			errorMessage = '녹음된 오디오 데이터가 없습니다. 다시 녹음해주세요.';
			return;
		}

		// 100% 브라우저 호환 표준 16-bit PCM WAV 파일 생성
		const wavBlob = pcmChunksToWavBlob(pcmChunks, sampleRate, 1);
		const audioUrl = URL.createObjectURL(wavBlob);
		const date = new Date();
		const defaultName = `녹음_${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}_${date.getHours().toString().padStart(2, '0')}${date.getMinutes().toString().padStart(2, '0')}${date.getSeconds().toString().padStart(2, '0')}`;

		if (onRecordComplete) {
			onRecordComplete({
				id: 'rec_' + Date.now(),
				name: defaultName,
				url: audioUrl,
				blob: wavBlob,
				duration: finalDuration,
				size: wavBlob.size,
				type: 'audio/wav',
				createdAt: date.toISOString()
			});
		}

		pcmChunks = [];
	}

	function cancelRecording() {
		cleanupAudioPipeline();
		recordingState = 'idle';
		recordingTime = 0;
		pcmChunks = [];
		if (timerInterval) {
			clearInterval(timerInterval);
			timerInterval = null;
		}
	}

	function cleanupAudioPipeline() {
		if (processorNode) {
			try {
				processorNode.disconnect();
			} catch (e) {}
			processorNode = null;
		}
		if (sourceNode) {
			try {
				sourceNode.disconnect();
			} catch (e) {}
			sourceNode = null;
		}
		if (recAudioCtx && recAudioCtx.state !== 'closed') {
			try {
				recAudioCtx.close();
			} catch (e) {}
			recAudioCtx = null;
		}
		if (mediaStream) {
			mediaStream.getTracks().forEach(track => track.stop());
			mediaStream = null;
		}
	}

	// 오디오 파일 업로드 처리
	async function handleAudioFiles(files) {
		if (!files || files.length === 0) return;
		const file = files[0];

		if (!file.type.startsWith('audio/') && !file.name.match(/\.(mp3|wav|ogg|m4a|aac|webm|flac)$/i)) {
			errorMessage = '오디오 파일(.mp3, .wav, .m4a, .webm 등)만 등록할 수 있습니다.';
			return;
		}

		errorMessage = '';

		try {
			const objectUrl = URL.createObjectURL(file);
			const tempAudio = new Audio(objectUrl);

			tempAudio.onloadedmetadata = () => {
				const duration = isFinite(tempAudio.duration) ? tempAudio.duration : 0;
				if (onRecordComplete) {
					onRecordComplete({
						id: 'file_' + Date.now(),
						name: file.name.replace(/\.[^/.]+$/, ''),
						url: objectUrl,
						blob: file,
						duration: duration,
						size: file.size,
						type: file.type || 'audio/wav',
						createdAt: new Date().toISOString()
					});
				}
			};

			tempAudio.onerror = () => {
				if (onRecordComplete) {
					onRecordComplete({
						id: 'file_' + Date.now(),
						name: file.name.replace(/\.[^/.]+$/, ''),
						url: objectUrl,
						blob: file,
						duration: 0,
						size: file.size,
						type: file.type || 'audio/wav',
						createdAt: new Date().toISOString()
					});
				}
			};
		} catch (err) {
			console.error('파일 로드 실패:', err);
			errorMessage = '오디오 파일을 로드하는 중 오류가 발생했습니다.';
		}
	}

	function handleDrop(e) {
		e.preventDefault();
		isDragOver = false;
		if (e.dataTransfer && e.dataTransfer.files) {
			handleAudioFiles(e.dataTransfer.files);
		}
	}

	function handleFileInput(e) {
		if (e.target.files) {
			handleAudioFiles(e.target.files);
			e.target.value = '';
		}
	}

	onDestroy(() => {
		cleanupAudioPipeline();
		if (timerInterval) clearInterval(timerInterval);
	});
</script>

<div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-7 shadow-xl">
	<!-- Top Section: Mode Info & Device selection -->
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 mb-5 border-b border-slate-800/80">
		<div>
			<h2 class="text-lg font-bold text-slate-100 flex items-center gap-2">
				<span class="w-2.5 h-2.5 rounded-full {recordingState === 'recording' ? 'bg-red-500 animate-pulse' : recordingState === 'paused' ? 'bg-amber-400' : 'bg-indigo-500'}"></span>
				목소리 녹음 및 입력
			</h2>
			<p class="text-xs text-slate-400 mt-1">
				마이크를 사용해 직접 목소리를 녹음하거나 기존 오디오 파일을 등록할 수 있습니다.
			</p>
		</div>

		{#if audioDevices.length > 1 && recordingState === 'idle'}
			<div class="flex items-center gap-2">
				<label for="mic-select" class="text-xs text-slate-400 whitespace-nowrap">마이크:</label>
				<select
					id="mic-select"
					bind:value={selectedDevice}
					class="bg-slate-800 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 border border-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer max-w-[180px] truncate"
				>
					<option value="">기본 마이크</option>
					{#each audioDevices as device}
						<option value={device.deviceId}>{device.label || `마이크 ${device.deviceId.slice(0, 5)}`}</option>
					{/each}
				</select>
			</div>
		{/if}
	</div>

	<!-- Error Alert -->
	{#if errorMessage}
		<div class="mb-5 p-3.5 bg-red-950/40 border border-red-800/60 rounded-xl text-red-300 text-xs flex items-start gap-2.5">
			<div class="mt-0.5 shrink-0"><Icon name="alert-circle" size={16} /></div>
			<div class="flex-1 font-medium">{errorMessage}</div>
			<button
				type="button"
				onclick={() => (errorMessage = '')}
				class="text-red-400 hover:text-red-200 cursor-pointer"
			>
				&times;
			</button>
		</div>
	{/if}

	<!-- Live Visualizer During Recording -->
	<div class="mb-6">
		<AudioVisualizer
			stream={mediaStream}
			height={100}
		/>
	</div>

	<!-- Timer Display -->
	<div class="text-center mb-6">
		<div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-950 border border-slate-800">
			{#if recordingState === 'recording'}
				<span class="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
				<span class="text-xs font-semibold text-red-400">녹음 중</span>
			{:else if recordingState === 'paused'}
				<span class="w-2 h-2 rounded-full bg-amber-400"></span>
				<span class="text-xs font-semibold text-amber-400">일시 정지됨</span>
			{:else}
				<span class="w-2 h-2 rounded-full bg-slate-500"></span>
				<span class="text-xs font-semibold text-slate-400">녹음 대기</span>
			{/if}
			<span class="text-slate-600">|</span>
			<span class="font-mono text-sm font-bold text-slate-200 tracking-wider">
				{formatTime(recordingTime, true)}
			</span>
		</div>
	</div>

	<!-- Recording Controls -->
	<div class="flex items-center justify-center gap-4 mb-6">
		{#if recordingState === 'idle'}
			<!-- Start Recording Button -->
			<button
				type="button"
				onclick={startRecording}
				class="flex items-center gap-2.5 px-6 py-3 rounded-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-semibold shadow-lg shadow-red-600/30 transition-all transform active:scale-95 cursor-pointer"
			>
				<Icon name="mic" size={20} />
				<span>녹음 시작</span>
			</button>
		{:else}
			<!-- Cancel Button -->
			<button
				type="button"
				onclick={cancelRecording}
				class="p-3 text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700/80 rounded-full transition-colors cursor-pointer"
				title="녹음 취소"
			>
				<Icon name="trash" size={20} />
			</button>

			<!-- Pause / Resume Button -->
			{#if recordingState === 'recording'}
				<button
					type="button"
					onclick={pauseRecording}
					class="p-3 text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-full transition-colors cursor-pointer"
					title="일시 정지"
				>
					<Icon name="pause" size={20} />
				</button>
			{:else if recordingState === 'paused'}
				<button
					type="button"
					onclick={resumeRecording}
					class="p-3 text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-full transition-colors cursor-pointer"
					title="녹음 재개"
				>
					<Icon name="mic" size={20} />
				</button>
			{/if}

			<!-- Stop & Save Button -->
			<button
				type="button"
				onclick={stopRecording}
				class="flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold shadow-lg shadow-indigo-500/25 transition-all transform active:scale-95 cursor-pointer"
			>
				<Icon name="stop" size={20} />
				<span>녹음 완료 및 확인</span>
			</button>
		{/if}
	</div>

	<!-- File Upload / Dropzone Alternative -->
	<div class="mt-6 pt-5 border-t border-slate-800/80">
		<input
			type="file"
			accept="audio/*,.mp3,.wav,.ogg,.m4a,.webm,.aac"
			bind:this={fileInputRef}
			onchange={handleFileInput}
			class="hidden"
		/>

		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="border-2 border-dashed rounded-xl p-5 text-center transition-all cursor-pointer {isDragOver ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-800 hover:border-slate-700 bg-slate-950/40 hover:bg-slate-950/70'}"
			ondragover={(e) => { e.preventDefault(); isDragOver = true; }}
			ondragleave={() => (isDragOver = false)}
			ondrop={handleDrop}
			onclick={() => fileInputRef?.click()}
		>
			<div class="flex flex-col items-center justify-center gap-2 text-slate-400">
				<div class="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-indigo-400">
					<Icon name="upload" size={16} />
				</div>
				<p class="text-xs font-medium text-slate-300">
					또는 <span class="text-indigo-400 underline underline-offset-2">오디오 파일 업로드</span> (드래그 & 드롭)
				</p>
				<p class="text-[11px] text-slate-500">
					WAV, MP3, M4A, WEBM, OGG 형식 지원 (100% 무손실 고음질)
				</p>
			</div>
		</div>
	</div>
</div>
