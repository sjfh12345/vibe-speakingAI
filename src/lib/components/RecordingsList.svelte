<script>
	import { formatTime, formatBytes } from '$lib/utils.js';
	import Icon from '$lib/components/Icon.svelte';

	let {
		recordings = [],
		selectedId = null,
		onSelect = null,
		onDelete = null,
		onRename = null,
		onClearAll = null
	} = $props();

	let editingId = $state(null);
	let editNameValue = $state('');

	function startEdit(rec, event) {
		event.stopPropagation();
		editingId = rec.id;
		editNameValue = rec.name;
	}

	function saveEdit(id) {
		if (editNameValue.trim() && onRename) {
			onRename(id, editNameValue.trim());
		}
		editingId = null;
	}

	function handleKeyDown(e, id) {
		if (e.key === 'Enter') {
			saveEdit(id);
		} else if (e.key === 'Escape') {
			editingId = null;
		}
	}

	function focusInput(node) {
		node.focus();
		node.select();
	}
</script>

<div class="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col h-full">
	<div class="flex items-center justify-between pb-3.5 mb-3 border-b border-slate-800/80">
		<div class="flex items-center gap-2">
			<Icon name="list" size={18} class="text-indigo-400" />
			<h3 class="font-bold text-slate-200 text-sm">
				녹음 보관함
				<span class="ml-1 px-2 py-0.5 text-xs bg-slate-800 text-slate-300 rounded-full font-normal">
					{recordings.length}
				</span>
			</h3>
		</div>

		{#if recordings.length > 0 && onClearAll}
			<button
				type="button"
				onclick={onClearAll}
				class="text-[11px] text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
			>
				전체 삭제
			</button>
		{/if}
	</div>

	{#if recordings.length === 0}
		<div class="flex-1 min-h-[180px] flex flex-col items-center justify-center text-center p-6 text-slate-500">
			<div class="w-10 h-10 rounded-full bg-slate-800/60 flex items-center justify-center text-slate-400 mb-2">
				<Icon name="disc" size={20} />
			</div>
			<p class="text-xs font-medium text-slate-400">보관된 녹음이 없습니다</p>
			<p class="text-[11px] text-slate-600 mt-1">
				위의 녹음 버튼을 눌러 목소리를 녹음해보세요.
			</p>
		</div>
	{:else}
		<div class="space-y-2 overflow-y-auto max-h-[380px] pr-1 custom-scrollbar flex-1">
			{#each recordings as rec (rec.id)}
				{@const isSelected = selectedId === rec.id}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="group relative flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer {isSelected ? 'bg-indigo-600/15 border-indigo-500/50 shadow-sm shadow-indigo-500/10' : 'bg-slate-950/50 border-slate-800/70 hover:border-slate-700 hover:bg-slate-800/40'}"
					onclick={() => onSelect && onSelect(rec)}
				>
					<div class="flex items-center gap-3 min-w-0 flex-1">
						<!-- Play / Wave Indicator -->
						<div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors {isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 group-hover:text-slate-200'}">
							<Icon name={isSelected ? 'waveform' : 'play'} size={15} />
						</div>

						<!-- Details -->
						<div class="min-w-0 flex-1">
							{#if editingId === rec.id}
								<input
									type="text"
									bind:value={editNameValue}
									onblur={() => saveEdit(rec.id)}
									onkeydown={(e) => handleKeyDown(e, rec.id)}
									onclick={(e) => e.stopPropagation()}
									class="w-full bg-slate-800 text-slate-100 text-xs px-2 py-1 rounded border border-indigo-500 focus:outline-none"
									use:focusInput
								/>
							{:else}
								<p class="text-xs font-medium text-slate-200 truncate {isSelected ? 'text-indigo-300 font-semibold' : ''}">
									{rec.name}
								</p>
							{/if}
							
							<div class="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
								<span>{formatTime(rec.duration || 0)}</span>
								<span>•</span>
								<span>{formatBytes(rec.size || 0)}</span>
								<span>•</span>
								<span>{new Date(rec.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
							</div>
						</div>
					</div>

					<!-- Actions -->
					<div class="flex items-center gap-1 opacity-80 group-hover:opacity-100 shrink-0 ml-2">
						{#if editingId !== rec.id}
							<button
								type="button"
								onclick={(e) => startEdit(rec, e)}
								class="p-1.5 text-slate-500 hover:text-slate-300 rounded hover:bg-slate-800 transition-colors cursor-pointer"
								title="이름 수정"
							>
								<Icon name="edit" size={13} />
							</button>
						{/if}
						{#if onDelete}
							<button
								type="button"
								onclick={(e) => { e.stopPropagation(); onDelete(rec.id); }}
								class="p-1.5 text-slate-500 hover:text-red-400 rounded hover:bg-slate-800 transition-colors cursor-pointer"
								title="삭제"
							>
								<Icon name="trash" size={13} />
							</button>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.custom-scrollbar::-webkit-scrollbar {
		width: 4px;
	}
	.custom-scrollbar::-webkit-scrollbar-track {
		background: transparent;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb {
		background: #334155;
		border-radius: 4px;
	}
</style>
