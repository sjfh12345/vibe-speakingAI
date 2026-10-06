<script>
	import { onMount, onDestroy } from 'svelte';
	import { formatTime, formatBytes } from '$lib/utils.js';
	import Icon from '$lib/components/Icon.svelte';
	import AudioVisualizer from '$lib/components/AudioVisualizer.svelte';

	let {
		recording = null, // { id, name, url, blob, duration, size, createdAt }
		onDelete = null
	} = $props();

	// Player State
	let isPlaying = $state(false);
	let currentTime = $state(0);
	let duration = $state(0);
	let volume = $state(1);
	let isMuted = $state(false);
	let playbackRate = $state(1);
	let isLooping = $state(false);
	let audioBuffer = $state(null);
	let isDecoding = $state(false);
	let playError = $state('');

	// HTML5 Audio Fallback Engine
	let audioElement = $state(null);

	// Web Audio API State
	let audioCtx = null;
	let sourceNode = null;
	let gainNode = null;
	let webAudioStartTime = 0;
	let webAudioStartOffset = 0;
	let animFrameId = null;
	let playMode = 'html5'; // 'webaudio' | 'html5'

	const speedOptions = [0.5, 0.75, 1, 1.25, 1.5, 2];

	// recording 변경 시
	$effect(() => {
		if (recording) {
			stopAllPlayback();
			currentTime = 0;
			webAudioStartOffset = 0;
			playError = '';
			duration = (isFinite(recording.duration) && recording.duration > 0) ? recording.duration : 0;

			// 파형 렌더링용 오디오 버퍼 디코딩 시도 (백그라운드)
			if (recording.blob) {
				tryDecodeAudioBuffer(recording.blob);
			}

			// HTML5 오디오 엘리먼트 소스 동기화
			if (audioElement && recording.url) {
				audioElement.src = recording.url;
			}
		} else {
			stopAllPlayback();
			audioBuffer = null;
			duration = 0;
			currentTime = 0;
		}
	});

	async function getOrCreateAudioContext() {
		if (typeof window === 'undefined') return null;
		try {
			if (!audioCtx || audioCtx.state === 'closed') {
				const AudioContextClass = window.AudioContext || window.webkitAudioContext;
				if (!AudioContextClass) return null;
				audioCtx = new AudioContextClass();
			}
			if (audioCtx && audioCtx.state === 'suspended') {
				await audioCtx.resume();
			}
			return audioCtx;
		} catch (e) {
			return null;
		}
	}

	async function tryDecodeAudioBuffer(blob) {
		try {
			isDecoding = true;
			const arrayBuffer = await blob.arrayBuffer();
			const ctx = await getOrCreateAudioContext();
			if (!ctx) {
				isDecoding = false;
				return;
			}

			// decodeAudioData 콜백/프로미스 호환 처리
			ctx.decodeAudioData(
				arrayBuffer.slice(0),
				(decoded) => {
					audioBuffer = decoded;
					if (decoded && decoded.duration > 0) {
						duration = decoded.duration;
					}
					isDecoding = false;
				},
				(err) => {
					// WebM의 경우 디코딩 실패해도 HTML5 Audio로 완벽히 재생 가능
					isDecoding = false;
				}
			);
		} catch (err) {
			isDecoding = false;
		}
	}

	async function togglePlay() {
		playError = '';
		if (isPlaying) {
			pauseAudio();
		} else {
			await playAudio();
		}
	}

	async function playAudio() {
		if (!recording) return;

		// 1순위: audioBuffer가 없으면 즉시 디코딩
		if (!audioBuffer && recording.blob) {
			try {
				const arrayBuffer = await recording.blob.arrayBuffer();
				const ctx = await getOrCreateAudioContext();
				if (ctx) {
					const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
					audioBuffer = decoded;
					if (decoded && decoded.duration > 0) {
						duration = decoded.duration;
					}
				}
			} catch (e) {
				console.warn('즉시 디코딩 폴백 진행:', e);
			}
		}

		// 2순위: audioBuffer로 고성능 Web Audio 재생
		if (audioBuffer) {
			try {
				const ctx = await getOrCreateAudioContext();
				if (ctx) {
					playWithWebAudio(ctx);
					return;
				}
			} catch (e) {
				console.warn('Web Audio 재생 실패, HTML5 Audio로 폴백:', e);
			}
		}

		// 3순위: HTML5 Audio 엘리먼트로 재생
		playWithHtml5Audio();
	}

	function playWithWebAudio(ctx) {
		playMode = 'webaudio';

		if (webAudioStartOffset >= duration && duration > 0) {
			webAudioStartOffset = 0;
			currentTime = 0;
		}

		// 기존 소스 정리
		if (sourceNode) {
			try {
				sourceNode.onended = null;
				sourceNode.stop();
				sourceNode.disconnect();
			} catch (e) {}
			sourceNode = null;
		}

		if (!gainNode) {
			gainNode = ctx.createGain();
			gainNode.connect(ctx.destination);
		}
		gainNode.gain.setValueAtTime(isMuted ? 0 : volume, ctx.currentTime);

		sourceNode = ctx.createBufferSource();
		sourceNode.buffer = audioBuffer;
		sourceNode.playbackRate.setValueAtTime(playbackRate, ctx.currentTime);
		sourceNode.loop = isLooping;
		sourceNode.connect(gainNode);

		webAudioStartTime = ctx.currentTime;
		const offset = Math.min(webAudioStartOffset, duration > 0 ? duration : 0);
		sourceNode.start(0, offset);

		isPlaying = true;

		sourceNode.onended = () => {
			if (!isLooping && isPlaying && playMode === 'webaudio') {
				const elapsed = (ctx.currentTime - webAudioStartTime) * playbackRate;
				if (webAudioStartOffset + elapsed >= duration - 0.1) {
					isPlaying = false;
					currentTime = 0;
					webAudioStartOffset = 0;
					cancelAnimationFrame(animFrameId);
				}
			}
		};

		trackWebAudioProgress(ctx);
	}

	function trackWebAudioProgress(ctx) {
		const update = () => {
			if (!isPlaying || playMode !== 'webaudio') return;
			const elapsed = (ctx.currentTime - webAudioStartTime) * playbackRate;
			const current = webAudioStartOffset + elapsed;

			if (duration > 0 && current >= duration) {
				if (isLooping) {
					webAudioStartTime = ctx.currentTime;
					webAudioStartOffset = 0;
					currentTime = 0;
				} else {
					currentTime = duration;
					isPlaying = false;
					webAudioStartOffset = 0;
					return;
				}
			} else {
				currentTime = Math.min(duration > 0 ? duration : 9999, current);
			}

			animFrameId = requestAnimationFrame(update);
		};

		cancelAnimationFrame(animFrameId);
		animFrameId = requestAnimationFrame(update);
	}

	function playWithHtml5Audio() {
		playMode = 'html5';
		if (!audioElement) return;

		try {
			if (audioElement.src !== recording.url) {
				audioElement.src = recording.url;
			}
			audioElement.volume = isMuted ? 0 : volume;
			audioElement.playbackRate = playbackRate;
			audioElement.loop = isLooping;

			if (currentTime >= duration && duration > 0) {
				audioElement.currentTime = 0;
				currentTime = 0;
			} else {
				audioElement.currentTime = currentTime;
			}

			const promise = audioElement.play();
			if (promise !== undefined) {
				promise
					.then(() => {
						isPlaying = true;
					})
					.catch((err) => {
						console.error('HTML5 Audio 재생 실패:', err);
						playError = `재생할 수 없습니다: ${err.message}`;
						isPlaying = false;
					});
			}
		} catch (err) {
			console.error('재생 실행 오류:', err);
			playError = `오디오 재생 실패: ${err.message}`;
			isPlaying = false;
		}
	}

	function pauseAudio() {
		isPlaying = false;
		cancelAnimationFrame(animFrameId);

		if (playMode === 'webaudio') {
			if (audioCtx) {
				const elapsed = (audioCtx.currentTime - webAudioStartTime) * playbackRate;
				webAudioStartOffset = Math.min(duration, webAudioStartOffset + elapsed);
				currentTime = webAudioStartOffset;
			}
			if (sourceNode) {
				try {
					sourceNode.onended = null;
					sourceNode.stop();
					sourceNode.disconnect();
				} catch (e) {}
				sourceNode = null;
			}
		} else {
			if (audioElement) {
				audioElement.pause();
				currentTime = audioElement.currentTime;
			}
		}
	}

	function stopAllPlayback() {
		isPlaying = false;
		cancelAnimationFrame(animFrameId);
		webAudioStartOffset = 0;
		currentTime = 0;

		if (sourceNode) {
			try {
				sourceNode.onended = null;
				sourceNode.stop();
				sourceNode.disconnect();
			} catch (e) {}
			sourceNode = null;
		}

		if (audioElement) {
			audioElement.pause();
			audioElement.currentTime = 0;
		}
	}

	function handleSeek(newTime) {
		if (!isFinite(newTime)) return;
		const total = getEffectiveDuration();
		const target = Math.max(0, Math.min(newTime, total > 0 ? total : 9999));
		currentTime = target;
		webAudioStartOffset = target;

		if (playMode === 'webaudio' && isPlaying) {
			if (audioCtx) playWithWebAudio(audioCtx);
		} else if (audioElement) {
			audioElement.currentTime = target;
		}
	}

	function handleSliderChange(e) {
		const targetTime = Number(e.target.value);
		handleSeek(targetTime);
	}

	function skipSeconds(seconds) {
		const total = getEffectiveDuration();
		const nextTime = Math.max(0, Math.min(currentTime + seconds, total));
		handleSeek(nextTime);
	}

	function toggleMute() {
		isMuted = !isMuted;
		if (audioElement) {
			audioElement.muted = isMuted;
		}
		if (gainNode && audioCtx) {
			gainNode.gain.setValueAtTime(isMuted ? 0 : volume, audioCtx.currentTime);
		}
	}

	function handleVolumeChange(e) {
		const val = Number(e.target.value);
		volume = val;
		if (val === 0) {
			isMuted = true;
		} else if (isMuted) {
			isMuted = false;
		}

		if (audioElement) {
			audioElement.volume = isMuted ? 0 : volume;
			audioElement.muted = isMuted;
		}
		if (gainNode && audioCtx) {
			gainNode.gain.setValueAtTime(isMuted ? 0 : volume, audioCtx.currentTime);
		}
	}

	function changePlaybackRate(rate) {
		playbackRate = rate;
		if (audioElement) {
			audioElement.playbackRate = rate;
		}
		if (sourceNode && audioCtx) {
			sourceNode.playbackRate.setValueAtTime(rate, audioCtx.currentTime);
		}
		if (isPlaying && playMode === 'webaudio' && audioCtx) {
			const elapsed = audioCtx.currentTime - webAudioStartTime;
			webAudioStartOffset = webAudioStartOffset + elapsed;
			webAudioStartTime = audioCtx.currentTime;
		}
	}

	function toggleLoop() {
		isLooping = !isLooping;
		if (audioElement) {
			audioElement.loop = isLooping;
		}
		if (sourceNode) {
			sourceNode.loop = isLooping;
		}
	}

	function downloadFile() {
		if (!recording?.url) return;
		const a = document.createElement('a');
		a.href = recording.url;
		const ext = recording.type?.includes('wav') ? 'wav' : recording.type?.includes('mp3') ? 'mp3' : 'webm';
		a.download = `${recording.name || 'recorded_voice'}.${ext}`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}

	function getEffectiveDuration() {
		if (isFinite(duration) && duration > 0) return duration;
		if (isFinite(recording?.duration) && recording.duration > 0) return recording.duration;
		if (audioBuffer && audioBuffer.duration > 0) return audioBuffer.duration;
		return 0;
	}

	onDestroy(() => {
		stopAllPlayback();
		if (audioCtx && audioCtx.state !== 'closed') {
			audioCtx.close().catch(() => {});
		}
	});
</script>

{#if recording}
	<div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
		<!-- Hidden Audio Element for Reliable Playback Fallback -->
		<audio
			bind:this={audioElement}
			src={recording.url}
			preload="auto"
			onplay={() => { if (playMode === 'html5') isPlaying = true; }}
			onpause={() => { if (playMode === 'html5') isPlaying = false; }}
			ontimeupdate={() => {
				if (playMode === 'html5' && audioElement) {
					currentTime = audioElement.currentTime;
				}
			}}
			onloadedmetadata={() => {
				if (audioElement && isFinite(audioElement.duration) && audioElement.duration > 0) {
					duration = audioElement.duration;
				}
			}}
			onended={() => {
				if (playMode === 'html5') {
					isPlaying = false;
					currentTime = 0;
				}
			}}
		></audio>

		<!-- Header Info -->
		<div class="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-800/80">
			<div class="flex items-center gap-3">
				<div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
					<Icon name="waveform" size={22} />
				</div>
				<div>
					<h3 class="font-semibold text-slate-100 text-base flex items-center gap-2">
						{recording.name}
						<span class="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-normal">
							선택됨
						</span>
					</h3>
					<p class="text-xs text-slate-400 mt-0.5">
						{recording.size ? formatBytes(recording.size) : ''} • {recording.createdAt ? new Date(recording.createdAt).toLocaleTimeString() : ''}
					</p>
				</div>
			</div>

			<div class="flex items-center gap-2">
				<button
					type="button"
					onclick={downloadFile}
					class="p-2 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
					title="다운로드"
				>
					<Icon name="download" size={18} />
				</button>
				{#if onDelete}
					<button
						type="button"
						onclick={() => onDelete(recording.id)}
						class="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
						title="삭제"
					>
						<Icon name="trash" size={18} />
					</button>
				{/if}
			</div>
		</div>

		<!-- Error Message Alert -->
		{#if playError}
			<div class="mb-4 p-3 bg-red-950/40 border border-red-800/60 rounded-xl text-xs text-red-300 flex items-center justify-between">
				<span>{playError}</span>
				<button
					type="button"
					onclick={() => (playError = '')}
					class="text-red-400 hover:text-red-200 cursor-pointer font-bold px-1"
				>
					&times;
				</button>
			</div>
		{/if}

		<!-- Waveform Visualizer -->
		<div class="mb-4">
			<AudioVisualizer
				{audioBuffer}
				{isPlaying}
				{currentTime}
				duration={getEffectiveDuration()}
				onSeek={handleSeek}
				height={80}
			/>
		</div>

		<!-- Progress Bar & Timers -->
		<div class="space-y-1.5 mb-5">
			<div class="relative flex items-center">
				<input
					type="range"
					min="0"
					max={getEffectiveDuration() > 0 ? getEffectiveDuration() : 1}
					step="0.05"
					value={currentTime}
					oninput={handleSliderChange}
					class="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 focus:outline-none"
				/>
			</div>
			<div class="flex justify-between text-xs text-slate-400 font-mono px-0.5">
				<span>{formatTime(currentTime, true)}</span>
				<span>{formatTime(getEffectiveDuration(), true)}</span>
			</div>
		</div>

		<!-- Player Controls -->
		<div class="flex flex-wrap items-center justify-between gap-4">
			<!-- Playback Buttons -->
			<div class="flex items-center gap-2">
				<!-- Skip -5s -->
				<button
					type="button"
					onclick={() => skipSeconds(-5)}
					class="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-all text-xs font-semibold cursor-pointer"
					title="-5초"
				>
					-5s
				</button>

				<!-- Main Play/Pause Button -->
				<button
					type="button"
					onclick={togglePlay}
					class="w-12 h-12 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white flex items-center justify-center shadow-lg shadow-indigo-500/25 transition-all transform active:scale-95 cursor-pointer"
					title={isPlaying ? '일시정지' : '재생'}
				>
					<Icon name={isPlaying ? 'pause' : 'play'} size={22} />
				</button>

				<!-- Skip +5s -->
				<button
					type="button"
					onclick={() => skipSeconds(5)}
					class="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-all text-xs font-semibold cursor-pointer"
					title="+5초"
				>
					+5s
				</button>

				<!-- Loop toggle -->
				<button
					type="button"
					onclick={toggleLoop}
					class="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer {isLooping ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40' : 'text-slate-400 hover:bg-slate-800'}"
					title="반복 재생"
				>
					반복
				</button>
			</div>

			<!-- Speed & Volume Controls -->
			<div class="flex items-center gap-4">
				<!-- Playback Speed -->
				<div class="flex items-center gap-1 bg-slate-800/80 rounded-lg p-1 border border-slate-700/50">
					{#each speedOptions as speed}
						<button
							type="button"
							onclick={() => changePlaybackRate(speed)}
							class="px-2 py-1 text-xs rounded transition-all cursor-pointer {playbackRate === speed ? 'bg-indigo-600 text-white font-medium shadow-sm' : 'text-slate-400 hover:text-slate-200'}"
						>
							{speed}x
						</button>
					{/each}
				</div>

				<!-- Volume Control -->
				<div class="flex items-center gap-2">
					<button
						type="button"
						onclick={toggleMute}
						class="text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
						title={isMuted ? '음소거 해제' : '음소거'}
					>
						<Icon name={isMuted || volume === 0 ? 'volume-x' : 'volume-2'} size={18} />
					</button>
					<input
						type="range"
						min="0"
						max="1"
						step="0.05"
						value={isMuted ? 0 : volume}
						oninput={handleVolumeChange}
						class="w-16 sm:w-20 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400"
					/>
				</div>
			</div>
		</div>
	</div>
{:else}
	<div class="bg-slate-900/50 border border-slate-800/60 rounded-2xl p-8 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
		<div class="w-12 h-12 rounded-full bg-slate-800/80 flex items-center justify-center text-slate-400">
			<Icon name="waveform" size={24} />
		</div>
		<p class="text-sm font-medium">선택된 녹음이 없습니다.</p>
		<p class="text-xs text-slate-500">마이크로 목소리를 녹음하거나 음성 파일을 등록하여 직접 확인해보세요.</p>
	</div>
{/if}
