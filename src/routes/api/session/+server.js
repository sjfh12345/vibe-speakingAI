import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

/**
 * OpenAI Realtime WebRTC 임시 세션 토큰 발급 API
 * Vercel 서버리스 및 로컬 SvelteKit 서버에서 동작하여 백엔드 없이도 동작
 */
export async function POST({ request }) {
	const apiKey = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';

	if (!apiKey || apiKey === 'your_openai_api_key_here') {
		return json(
			{
				error: 'OPENAI_API_KEY가 설정되지 않았습니다. Vercel 환경 변수 또는 .env 파일에 OpenAI API Key를 등록해주세요.'
			},
			{ status: 400 }
		);
	}

	let body = {};
	try {
		body = await request.json();
	} catch {
		body = {};
	}

	const voice = body.voice || 'alloy';
	const silenceDuration = body.silence_duration_ms || 300;
	const defaultInstructions =
		'You are an encouraging, friendly, and natural native English tutor. ' +
		'Engage in ultra-responsive, realistic spoken conversation. ' +
		'Keep your spoken replies concise, conversational, and energetic (1-3 sentences) ' +
		'so the flow of conversation feels fast and natural. ' +
		'If the user makes a clear grammatical mistake, gently provide the correct phrasing before continuing the topic.';
	const instructions = body.instructions || defaultInstructions;

	const url = 'https://api.openai.com/v1/realtime/client_secrets';
	const payload = {
		session: {
			type: 'realtime',
			model: 'gpt-realtime-2.1',
			audio: {
				input: {
					format: {
						type: 'audio/pcm',
						rate: 24000
					},
					turn_detection: {
						type: 'server_vad',
						threshold: 0.5,
						prefix_padding_ms: 200,
						silence_duration_ms: silenceDuration,
						create_response: true
					}
				},
				output: {
					format: {
						type: 'audio/pcm',
						rate: 24000
					},
					voice: voice
				}
			},
			instructions: instructions
		}
	};

	try {
		const res = await fetch(url, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(payload)
		});

		const data = await res.json();
		if (!res.ok) {
			const errorMsg = data.error?.message || 'OpenAI API 호출 실패';
			return json({ error: errorMsg }, { status: res.status });
		}

		if (data && data.value && !data.client_secret) {
			data.client_secret = { value: data.value };
		}

		return json(data);
	} catch (err) {
		return json(
			{ error: `OpenAI 서버 통신 실패: ${err.message}` },
			{ status: 502 }
		);
	}
}
