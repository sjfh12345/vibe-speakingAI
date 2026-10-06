// src/routes/api/db/status/+server.js
import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

export async function GET() {
	const url = env.SUPABASE_URL || PUBLIC_SUPABASE_URL;
	const key = env.SUPABASE_ANON_KEY || PUBLIC_SUPABASE_ANON_KEY;

	if (!url || !key) {
		return json(
			{
				connected: false,
				error: 'Supabase URL 또는 Key가 설정되지 않았습니다.'
			},
			{ status: 500 }
		);
	}

	const supabase = createClient(url, key);
	const startTime = performance.now();

	try {
		const { data, error, count } = await supabase
			.from('test_records')
			.select('*', { count: 'exact' });

		const latency = Math.round(performance.now() - startTime);

		if (error && error.code !== '42P01') {
			throw error;
		}

		return json({
			connected: true,
			latency_ms: latency,
			database_name: 'Supabase PostgreSQL',
			has_test_records_table: !error,
			test_records_count: count ?? 0,
			records: data || []
		});
	} catch (err) {
		return json(
			{
				connected: false,
				error: err.message
			},
			{ status: 500 }
		);
	}
}
