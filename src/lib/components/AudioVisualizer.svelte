<script>
	import { onMount, onDestroy } from 'svelte';

	let {
		stream = null,
		audioBuffer = null,
		isPlaying = false,
		currentTime = 0,
		duration = 0,
		onSeek = null,
		height = 100,
		barColor = '#6366f1',
		activeColor = '#a855f7'
	} = $props();

	let canvasRef = $state(null);
	let animationFrameId = null;
	let audioContext = null;
	let analyser = null;
	let sourceNode = null;

	// 실시간 마이크 비주얼라이저 설정
	function setupLiveVisualizer() {
		cleanupLiveVisualizer();
		if (!stream || !canvasRef || typeof window === 'undefined') return;

		try {
			const AudioContextClass = window.AudioContext || window.webkitAudioContext;
			if (!AudioContextClass) return;
			audioContext = new AudioContextClass();
			if (audioContext.state === 'suspended') {
				audioContext.resume().catch(() => {});
			}
			analyser = audioContext.createAnalyser();
			analyser.fftSize = 128;
			analyser.smoothingTimeConstant = 0.8;

			sourceNode = audioContext.createMediaStreamSource(stream);
			sourceNode.connect(analyser);

			const bufferLength = analyser.frequencyBinCount;
			const dataArray = new Uint8Array(bufferLength);

			const draw = () => {
				if (!canvasRef) return;
				const canvas = canvasRef;
				const ctx = canvas.getContext('2d');
				if (!ctx) return;

				const width = canvas.width;
				const height = canvas.height;

				analyser.getByteFrequencyData(dataArray);

				ctx.clearRect(0, 0, width, height);

				const barCount = 32;
				const barWidth = (width / barCount) * 0.7;
				const barSpacing = (width / barCount) * 0.3;

				for (let i = 0; i < barCount; i++) {
					const dataIdx = Math.floor((i / barCount) * (bufferLength * 0.7));
					const value = dataArray[dataIdx] || 0;
					const percent = value / 255;
					const barHeight = Math.max(4, percent * (height * 0.85));

					const x = i * (barWidth + barSpacing) + barSpacing / 2;
					const y = (height - barHeight) / 2;

					// 그라데이션 색상
					const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
					gradient.addColorStop(0, '#ec4899');
					gradient.addColorStop(0.5, '#8b5cf6');
					gradient.addColorStop(1, '#3b82f6');

					ctx.fillStyle = gradient;
					ctx.beginPath();
					ctx.roundRect(x, y, barWidth, barHeight, 4);
					ctx.fill();
				}

				animationFrameId = requestAnimationFrame(draw);
			};

			draw();
		} catch (err) {
			console.error('실시간 비주얼라이저 초기화 실패:', err);
		}
	}

	function cleanupLiveVisualizer() {
		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
		}
		if (sourceNode) {
			sourceNode.disconnect();
			sourceNode = null;
		}
		if (audioContext && audioContext.state !== 'closed') {
			audioContext.close().catch(() => {});
			audioContext = null;
		}
	}

	// 정적 파형(Waveform) 그리기
	function drawWaveform() {
		if (!canvasRef) return;
		const canvas = canvasRef;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const width = canvas.width;
		const height = canvas.height;
		ctx.clearRect(0, 0, width, height);

		if (!audioBuffer) {
			// 오디오 버퍼가 없을 때 가상 파형 렌더링
			const barCount = 48;
			const barWidth = width / barCount - 2;
			for (let i = 0; i < barCount; i++) {
				const x = i * (barWidth + 2);
				const defaultH = 6;
				ctx.fillStyle = '#374151';
				ctx.beginPath();
				ctx.roundRect(x, (height - defaultH) / 2, barWidth, defaultH, 2);
				ctx.fill();
			}
			return;
		}

		const rawData = audioBuffer.getChannelData(0);
		const barCount = 60;
		const blockSize = Math.floor(rawData.length / barCount);
		const barWidth = (width / barCount) * 0.7;
		const barSpacing = (width / barCount) * 0.3;

		const progressPercent = duration > 0 ? currentTime / duration : 0;
		const currentBarIndex = Math.floor(progressPercent * barCount);

		for (let i = 0; i < barCount; i++) {
			let sum = 0;
			for (let j = 0; j < blockSize; j++) {
				sum += Math.abs(rawData[i * blockSize + j] || 0);
			}
			const avg = sum / blockSize;
			const normalizedHeight = Math.min(height, Math.max(6, avg * height * 2.8));
			const x = i * (barWidth + barSpacing) + barSpacing / 2;
			const y = (height - normalizedHeight) / 2;

			// 재생 이전 영역과 이후 영역 색상 차별화
			if (i <= currentBarIndex) {
				const gradient = ctx.createLinearGradient(0, y, 0, y + normalizedHeight);
				gradient.addColorStop(0, '#818cf8');
				gradient.addColorStop(1, '#c084fc');
				ctx.fillStyle = gradient;
			} else {
				ctx.fillStyle = '#4b5563';
			}

			ctx.beginPath();
			ctx.roundRect(x, y, barWidth, normalizedHeight, 3);
			ctx.fill();
		}
	}

	function handleCanvasClick(event) {
		if (!onSeek || !canvasRef || !duration) return;
		const rect = canvasRef.getBoundingClientRect();
		const clickX = event.clientX - rect.left;
		const percent = Math.max(0, Math.min(1, clickX / rect.width));
		onSeek(percent * duration);
	}

	$effect(() => {
		if (stream) {
			setupLiveVisualizer();
		} else {
			cleanupLiveVisualizer();
			drawWaveform();
		}
	});

	$effect(() => {
		if (!stream && audioBuffer) {
			drawWaveform();
		}
	});

	$effect(() => {
		// 재생 위치 또는 시간 변경 시 재렌더링
		if (!stream && audioBuffer) {
			currentTime;
			duration;
			drawWaveform();
		}
	});

	onDestroy(() => {
		cleanupLiveVisualizer();
	});
</script>

<div class="relative w-full overflow-hidden rounded-xl bg-slate-950/80 p-2 border border-slate-800 shadow-inner">
	<canvas
		bind:this={canvasRef}
		width="600"
		height={height}
		class="w-full h-full block cursor-pointer transition-all"
		onclick={handleCanvasClick}
	></canvas>
	
	{#if !stream && !audioBuffer}
		<div class="absolute inset-0 flex items-center justify-center text-xs text-slate-500 font-medium">
			오디오 파형 표시 대기 중...
		</div>
	{/if}
</div>
