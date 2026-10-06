<script>
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { updateSupabaseConfig } from '$lib/supabaseClient.js';
	import { auth } from '$lib/auth.svelte.js';

	let { data, children } = $props();

	$effect(() => {
		if (data?.supabaseUrl && data?.supabaseAnonKey) {
			updateSupabaseConfig(data.supabaseUrl, data.supabaseAnonKey);
			auth.init();
		}
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
