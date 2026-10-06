<script>
	import { formatTime, formatBytes } from '$lib/utils.js';
	import Icon from '$lib/components/Icon.svelte';

	let { recording = null } = $props();
</script>

<div class="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
	<div class="flex items-center gap-2 pb-3 mb-4 border-b border-slate-800/80">
		<Icon name="info" size={18} class="text-purple-400" />
		<h3 class="font-bold text-slate-200 text-sm">녹음 음성 정보 및 진단</h3>
	</div>

	{#if recording}
		<div class="space-y-3">
			<div class="grid grid-cols-2 gap-2 text-xs">
				<div class="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60">
					<span class="text-slate-500 block text-[11px]">총 재생 시간</span>
					<span class="text-slate-200 font-mono font-semibold text-sm">
						{formatTime(recording.duration || 0, true)}
					</span>
				</div>
				<div class="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60">
					<span class="text-slate-500 block text-[11px]">파일 용량</span>
					<span class="text-slate-200 font-mono font-semibold text-sm">
						{formatBytes(recording.size || 0)}
					</span>
				</div>
				<div class="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60">
					<span class="text-slate-500 block text-[11px]">인코딩 포맷</span>
					<span class="text-indigo-300 font-medium truncate block">
						{recording.type || 'audio/webm'}
					</span>
				</div>
				<div class="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60">
					<span class="text-slate-500 block text-[11px]">입력 일시</span>
					<span class="text-slate-300 font-medium">
						{recording.createdAt ? new Date(recording.createdAt).toLocaleTimeString() : '-'}
					</span>
				</div>
			</div>

			<!-- 음성 상태 팁 -->
			<div class="bg-gradient-to-r from-indigo-950/40 to-purple-950/40 border border-indigo-800/40 rounded-xl p-3.5 mt-3">
				<div class="flex items-center gap-2 text-xs font-semibold text-indigo-300 mb-1.5">
					<Icon name="sparkles" size={14} />
					<span>음성 상태 진단 팁</span>
				</div>
				<p class="text-[11px] text-slate-300 leading-relaxed">
					{#if (recording.duration || 0) < 1.5}
						⚠️ 녹음 길이가 너무 짧습니다. 3초 이상 자연스럽게 말씀하시면 더 정확한 음성 확인이 가능합니다.
					{:else if (recording.duration || 0) > 60}
						ℹ️ 긴 녹음입니다. 파형을 클릭하여 원하는 구간으로 빠르게 이동하며 목소리를 확인하세요.
					{:else}
						✅ 적절한 길이의 음성입니다. 오디오 플레이어에서 파형과 함께 잡음 및 목소리 톤을 확인해보세요.
					{/if}
				</p>
			</div>
		</div>
	{:else}
		<div class="text-center py-6 text-slate-500 text-xs">
			목소리를 녹음하거나 선택하면 음성 세부 정보와 진단 결과가 표시됩니다.
		</div>
	{/if}
</div>
