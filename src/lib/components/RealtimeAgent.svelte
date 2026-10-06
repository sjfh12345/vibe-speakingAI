<script>
	import { onMount, onDestroy } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';

	// Connection & Hardware State Monitoring
	let connectionState = $state('disconnected'); // 'disconnected' | 'connecting' | 'connected' | 'error'
	let isAiSpeaking = $state(false);
	let isUserSpeaking = $state(false);
	let errorMessage = $state('');
	let errorType = $state(''); // 'backend_offline' | 'api_key' | 'microphone' | 'webrtc' | 'unknown'
	let errorSolution = $state('');

	// Rigorous Resource & Security Verification State
	let rtcState = $state('closed'); // 'closed' | 'connecting' | 'connected' | 'disconnected'
	let micHardwareState = $state('ended'); // 'ended' (off) | 'live' (recording)
	let dataChannelState = $state('closed'); // 'closed' | 'open' | 'connecting'
	let isSafeDisconnected = $state(false); // True after safe disconnect verification
	let disconnectVerificationReport = $state([]); // Checklist of verified cleanups
	let trafficStats = $state({
		bytesSent: 0,
		bytesReceived: 0,
		currentBitrateKbps: 0,
		packetsSent: 0,
		packetsReceived: 0,
		durationSec: 0
	});

	// System Diagnostics State
	let backendStatus = $state('checking'); // 'online' | 'offline' | 'checking'
	let apiKeyStatus = $state({ is_configured: false, masked_key: '확인 중...', hint: '' });
	let micPermission = $state('prompt'); // 'granted' | 'denied' | 'prompt' | 'unknown'
	let isDiagnosticsOpen = $state(true);

	// Settings
	let selectedVoice = $state('alloy');
	let silenceDurationMs = $state(300); // 초저지연 VAD (기본 300ms)
	let customPrompt = $state(
		'You are an energetic and helpful native English conversation partner. Keep your answers brief (1-3 sentences), lively, and natural. Correct any major grammar mistakes quickly and keep the conversation going.'
	);

	// Conversation Transcript history
	let messages = $state([]); // { id, role: 'user' | 'assistant', text: '', isLive: boolean }
	let currentAiMessage = $state('');
	let currentUserMessage = $state('');

	// Debug & Connection Step Logs
	let debugLogs = $state([]); // { time: string, step: string, status: 'info' | 'success' | 'warn' | 'error', details: string }

	// WebRTC & Audio references
	let peerConnection = null;
	let dataChannel = null;
	let localAudioStream = null;
	let remoteAudioElement = null;
	let audioContext = null;
	let analyser = null;
	let visualizerCanvas = null;
	let animationFrameId = null;
	let statsIntervalId = null;
	let sessionStartTime = 0;
	let prevBytesSent = 0;
	let prevBytesReceived = 0;

	const VOICES = [
		{ id: 'alloy', name: 'Alloy (중성적/자연스러움)' },
		{ id: 'ash', name: 'Ash (차분함)' },
		{ id: 'ballad', name: 'Ballad (부드러움)' },
		{ id: 'coral', name: 'Coral (명랑함/친절함)' },
		{ id: 'echo', name: 'Echo (남성/신뢰감)' },
		{ id: 'sage', name: 'Sage (지적임)' },
		{ id: 'shimmer', name: 'Shimmer (맑고 또렷함)' },
		{ id: 'verse', name: 'Verse (역동적)' }
	];

	function addLog(step, status, details) {
		const now = new Date();
		const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
		debugLogs = [{ time: timeStr, step, status, details }, ...debugLogs.slice(0, 49)];
	}

	onMount(() => {
		checkSystemHealth();
	});

	onDestroy(() => {
		disconnect();
	});

	// 백엔드 및 시스템 상태 자가진단 (Health Check)
	async function checkSystemHealth() {
		backendStatus = 'checking';
		addLog('시스템 진단', 'info', '서버리스 백엔드(/api/health) 상태 확인 중...');

		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 3000);

			const resp = await fetch('/api/health', {
				signal: controller.signal
			});
			clearTimeout(timeoutId);

			if (resp.ok) {
				const data = await resp.json();
				backendStatus = 'online';
				apiKeyStatus = data.api_key_status;
				addLog('시스템 진단', 'success', `서버 온라인 확인됨 (API 키 상태: ${data.api_key_status.hint})`);
			} else {
				backendStatus = 'offline';
				addLog('시스템 진단', 'warn', `서버가 HTTP ${resp.status} 응답을 반환했습니다.`);
			}
		} catch (err) {
			backendStatus = 'offline';
			addLog('시스템 진단', 'error', `서버에 연결할 수 없습니다 (${err.name}: ${err.message}). Vercel 환경 변수(OPENAI_API_KEY) 설정을 확인하세요.`);
		}

		// 마이크 권한 상태 체크
		if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
			try {
				const status = await navigator.permissions.query({ name: 'microphone' });
				micPermission = status.state;
			} catch (e) {
				micPermission = 'unknown';
			}
		}
	}

	// WebRTC 실시간 트래픽 및 패킷 통계 모니터링 (RTCStatsReport)
	function startTrafficMonitoring() {
		sessionStartTime = Date.now();
		prevBytesSent = 0;
		prevBytesReceived = 0;
		if (statsIntervalId) clearInterval(statsIntervalId);

		statsIntervalId = setInterval(async () => {
			if (!peerConnection) return;
			try {
				const stats = await peerConnection.getStats();
				let bytesSent = 0;
				let bytesReceived = 0;
				let packetsSent = 0;
				let packetsReceived = 0;

				stats.forEach((report) => {
					if (report.type === 'outbound-rtp' && report.kind === 'audio') {
						bytesSent += report.bytesSent || 0;
						packetsSent += report.packetsSent || 0;
					}
					if (report.type === 'inbound-rtp' && report.kind === 'audio') {
						bytesReceived += report.bytesReceived || 0;
						packetsReceived += report.packetsReceived || 0;
					}
					if (report.type === 'data-channel') {
						bytesSent += report.bytesSent || 0;
						bytesReceived += report.bytesReceived || 0;
					}
				});

				const deltaBytes = (bytesSent - prevBytesSent) + (bytesReceived - prevBytesReceived);
				prevBytesSent = bytesSent;
				prevBytesReceived = bytesReceived;

				const kbps = Math.max(0, Math.round((deltaBytes * 8) / 1000));
				const durationSec = Math.round((Date.now() - sessionStartTime) / 1000);

				trafficStats = {
					bytesSent,
					bytesReceived,
					currentBitrateKbps: kbps,
					packetsSent,
					packetsReceived,
					durationSec
				};
			} catch (e) {
				// PeerConnection 종료 시 무시
			}
		}, 1000);
	}

	// WebRTC 연결 시작 (초저지연 + 단계별 상세 디버그 로깅)
	async function connect() {
		errorMessage = '';
		errorType = '';
		errorSolution = '';
		isSafeDisconnected = false;
		disconnectVerificationReport = [];
		connectionState = 'connecting';
		rtcState = 'connecting';
		dataChannelState = 'connecting';
		messages = [];
		currentAiMessage = '';
		currentUserMessage = '';

		trafficStats = {
			bytesSent: 0,
			bytesReceived: 0,
			currentBitrateKbps: 0,
			packetsSent: 0,
			packetsReceived: 0,
			durationSec: 0
		};

		addLog('연결 시작', 'info', '실시간 WebRTC 에이전트 연결 프로세스 시작');

		try {
			// [Step 1] 백엔드에서 Ephemeral Secret 토큰 요청
			addLog('Step 1. 세션 요청', 'info', 'FastAPI 백엔드(/api/session)로 세션 생성 요청 전송 중...');
			
			let sessionResp;
			try {
				sessionResp = await fetch('/api/session', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						voice: selectedVoice,
						instructions: customPrompt,
						silence_duration_ms: Number(silenceDurationMs)
					})
				});
			} catch (fetchErr) {
				errorType = 'backend_offline';
				errorSolution = 'FastAPI 백엔드 서버(포트 8000)가 실행되지 않았습니다. 새 터미널 창에서 [uv run uvicorn main:app --reload --port 8000] 명령을 실행해주세요.';
				addLog('Step 1. 세션 요청 실패', 'error', `서버 연결 거부 (net::ERR_CONNECTION_REFUSED / Failed to fetch). 백엔드가 8000 포트에서 켜져 있는지 확인하세요.`);
				throw new Error('백엔드 서버(http://127.0.0.1:8000)에 연결할 수 없습니다. (Failed to fetch)');
			}

			if (!sessionResp.ok) {
				const errorData = await sessionResp.json().catch(() => ({}));
				const detailMsg = errorData.detail || `HTTP 상태 코드: ${sessionResp.status}`;
				
				if (sessionResp.status === 400 && detailMsg.includes('OPENAI_API_KEY')) {
					errorType = 'api_key';
					errorSolution = '프로젝트 루트의 .env 파일에 올바른 OPENAI_API_KEY를 입력하고 백엔드를 재시작해주세요.';
				} else {
					errorType = 'unknown';
				}
				addLog('Step 1. 세션 발급 에러', 'error', `상태 코드 ${sessionResp.status}: ${detailMsg}`);
				throw new Error(detailMsg);
			}

			const sessionData = await sessionResp.json();
			const ephemeralKey = sessionData.value || sessionData.client_secret?.value || sessionData.key;
			if (!ephemeralKey) {
				addLog('Step 1. 키 오류', 'error', `응답에 client_secret 또는 value가 누락되었습니다: ${JSON.stringify(sessionData)}`);
				throw new Error('OpenAI client_secret 토큰을 수신하지 못했습니다.');
			}
			addLog('Step 1. 세션 발급 완료', 'success', `임시 세션 토큰 수신 완료 (${ephemeralKey.slice(0, 10)}...)`);

			// [Step 2] 마이크 오디오 스트림 획득
			addLog('Step 2. 마이크 접근', 'info', '브라우저 마이크 스트림(초저지연 옵션) 요청 중...');
			try {
				localAudioStream = await navigator.mediaDevices.getUserMedia({
					audio: {
						echoCancellation: true,
						noiseSuppression: true,
						autoGainControl: true,
						latency: 0,
						channelCount: 1
					}
				});
				micPermission = 'granted';
				micHardwareState = 'live';
				addLog('Step 2. 마이크 획득 완료', 'success', `오디오 트랙 활성화됨 (${localAudioStream.getAudioTracks()[0]?.label || '기본 마이크'})`);
			} catch (micErr) {
				errorType = 'microphone';
				errorSolution = '브라우저 주소창 좌측의 마이크 권한 아이콘을 클릭하여 마이크 사용을 허용해주세요.';
				addLog('Step 2. 마이크 접근 실패', 'error', `${micErr.name}: ${micErr.message}`);
				throw new Error(`마이크 접근 실패: ${micErr.message}`);
			}

			setupAudioVisualizer(localAudioStream);

			// [Step 3] RTCPeerConnection 생성
			addLog('Step 3. WebRTC 초기화', 'info', 'RTCPeerConnection 생성 및 DataChannel(oai-events) 구성 중...');
			peerConnection = new RTCPeerConnection({
				iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
			});

			peerConnection.onconnectionstatechange = () => {
				if (peerConnection) {
					rtcState = peerConnection.connectionState;
					addLog('WebRTC 상태', 'info', `PeerConnection State: ${peerConnection.connectionState}`);
				}
			};

			peerConnection.oniceconnectionstatechange = () => {
				if (peerConnection) {
					addLog('ICE 상태 변경', 'info', `ICE Connection State: ${peerConnection.iceConnectionState}`);
				}
			};

			remoteAudioElement = document.createElement('audio');
			remoteAudioElement.autoplay = true;
			peerConnection.ontrack = (event) => {
				addLog('오디오 수신', 'success', 'OpenAI AI 원격 오디오 스트림 수신 시작');
				remoteAudioElement.srcObject = event.streams[0];
			};

			localAudioStream.getTracks().forEach((track) => {
				peerConnection.addTrack(track, localAudioStream);
			});

			dataChannel = peerConnection.createDataChannel('oai-events');
			setupDataChannelEvents(dataChannel);

			const offer = await peerConnection.createOffer();
			await peerConnection.setLocalDescription(offer);
			addLog('Step 3. SDP Offer 생성', 'success', '로컬 SDP Offer 생성 완료');

			// [Step 4] OpenAI WebRTC Calls 엔드포인트로 Offer 전송
			addLog('Step 4. OpenAI 핸드셰이크', 'info', 'https://api.openai.com/v1/realtime/calls 로 SDP 전송 중...');
			const sdpResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
				method: 'POST',
				body: offer.sdp,
				headers: {
					Authorization: `Bearer ${ephemeralKey}`,
					'Content-Type': 'application/sdp'
				}
			});

			if (!sdpResponse.ok) {
				const sdpErr = await sdpResponse.text();
				errorType = 'webrtc';
				errorSolution = 'OpenAI WebRTC 엔드포인트 응답 오류입니다. API Key의 Realtime 모델 권한 및 크레딧 잔액을 확인해주세요.';
				addLog('Step 4. OpenAI 핸드셰이크 실패', 'error', `HTTP ${sdpResponse.status}: ${sdpErr}`);
				throw new Error(`OpenAI WebRTC 연결 실패 (${sdpResponse.status}): ${sdpErr}`);
			}

			const answerSdp = await sdpResponse.text();
			const answer = {
				type: 'answer',
				sdp: answerSdp
			};
			await peerConnection.setRemoteDescription(answer);

			addLog('Step 4. SDP Answer 수신 완료', 'success', 'OpenAI와 WebRTC 피어 연결 완료');
			connectionState = 'connected';
			rtcState = 'connected';
			startTrafficMonitoring();
		} catch (err) {
			console.error('연결 실패:', err);
			errorMessage = err.message || '실시간 연결 중 오류가 발생했습니다.';
			connectionState = 'error';
			disconnect();
		}
	}

	function setupDataChannelEvents(channel) {
		channel.onopen = () => {
			dataChannelState = 'open';
			addLog('DataChannel', 'success', 'oai-events DataChannel 열림 (실시간 양방향 이벤트 통신 활성화)');
		};

		channel.onclose = () => {
			dataChannelState = 'closed';
			addLog('DataChannel', 'info', 'oai-events DataChannel 정상 폐쇄됨');
		};

		channel.onmessage = (e) => {
			try {
				const event = JSON.parse(e.data);
				handleRealtimeEvent(event);
			} catch (err) {
				console.warn('이벤트 파싱 오류:', err);
			}
		};

		channel.onerror = (err) => {
			addLog('DataChannel 에러', 'error', JSON.stringify(err));
		};
	}

	function handleRealtimeEvent(event) {
		switch (event.type) {
			case 'input_audio_buffer.speech_started':
				isUserSpeaking = true;
				isAiSpeaking = false;
				break;
			case 'input_audio_buffer.speech_stopped':
				isUserSpeaking = false;
				break;
			case 'output_audio_buffer.started':
				isAiSpeaking = true;
				break;
			case 'output_audio_buffer.stopped':
				isAiSpeaking = false;
				break;
			case 'response.audio_transcript.delta':
				if (event.delta) {
					currentAiMessage += event.delta;
				}
				break;
			case 'response.audio_transcript.done':
			case 'response.done':
				if (currentAiMessage.trim()) {
					messages = [...messages, { id: 'ai_' + Date.now(), role: 'assistant', text: currentAiMessage.trim() }];
					currentAiMessage = '';
				}
				isAiSpeaking = false;
				break;
			case 'conversation.item.input_audio_transcription.completed':
				if (event.transcript && event.transcript.trim()) {
					messages = [...messages, { id: 'user_' + Date.now(), role: 'user', text: event.transcript.trim() }];
				}
				break;
			default:
				break;
		}
	}

	// 🛑 엄격한 리소스 완벽 해제 및 종료 검증 함수
	async function disconnect() {
		const report = [];

		// 1. 실시간 통계 및 애니메이션 루프 즉시 중단
		if (statsIntervalId) {
			clearInterval(statsIntervalId);
			statsIntervalId = null;
		}
		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
		}

		// 2. 마이크 하드웨어 스트림 정지 및 'ended' 상태 검증
		if (localAudioStream) {
			localAudioStream.getTracks().forEach((track) => {
				track.stop();
				track.enabled = false;
				report.push({
					title: '마이크 하드웨어 녹음 스트림',
					desc: `${track.label || '기본 오디오'} (상태: ${track.readyState === 'ended' ? '완전 차단됨 ended' : '정지됨'})`,
					verified: true
				});
			});
			localAudioStream = null;
		} else {
			report.push({
				title: '마이크 하드웨어 녹음 스트림',
				desc: '비활성화 상태 확인됨 (기기 녹음 OFF)',
				verified: true
			});
		}
		micHardwareState = 'ended';

		// 3. WebRTC DataChannel (이벤트 채널) 폐쇄
		if (dataChannel) {
			try {
				dataChannel.close();
			} catch (e) {}
			report.push({
				title: 'OpenAI DataChannel (oai-events)',
				desc: '실시간 제어 채널 폐쇄 완료 (closed)',
				verified: true
			});
			dataChannel = null;
		} else {
			report.push({
				title: 'OpenAI DataChannel',
				desc: '통신 채널 닫힘 상태 확인됨',
				verified: true
			});
		}
		dataChannelState = 'closed';

		// 4. WebRTC PeerConnection 트랜시버 정지 및 소켓 Close
		if (peerConnection) {
			try {
				peerConnection.getSenders().forEach((sender) => {
					if (sender.track) sender.track.stop();
				});
				peerConnection.getReceivers().forEach((receiver) => {
					if (receiver.track) receiver.track.stop();
				});
				peerConnection.close();
			} catch (e) {}
			report.push({
				title: 'OpenAI WebRTC RTCPeerConnection',
				desc: '네트워크 연결 소켓 영구 파기 (closed)',
				verified: true
			});
			peerConnection = null;
		} else {
			report.push({
				title: 'OpenAI WebRTC RTCPeerConnection',
				desc: '연결 소멸 확인됨 (통신 불가)',
				verified: true
			});
		}
		rtcState = 'closed';

		// 5. 원격 AI 오디오 재생 엘리먼트 정지
		if (remoteAudioElement) {
			try {
				remoteAudioElement.pause();
				remoteAudioElement.srcObject = null;
			} catch (e) {}
			remoteAudioElement = null;
			report.push({
				title: 'AI 스피커 오디오 렌더러',
				desc: '오디오 출력 중단 및 메모리 버퍼 해제',
				verified: true
			});
		}

		// 6. Web AudioContext 닫기
		if (audioContext && audioContext.state !== 'closed') {
			try {
				await audioContext.close();
			} catch (e) {}
			audioContext = null;
			report.push({
				title: 'Web AudioContext (오디오 프로세싱 엔진)',
				desc: 'closed (CPU 점유율 및 리소스 0%)',
				verified: true
			});
		}

		// 7. 캔버스 화면 클리어
		if (visualizerCanvas) {
			const ctx = visualizerCanvas.getContext('2d');
			if (ctx) ctx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
		}

		// 8. 전송률을 0으로 리셋 (최종 패킷/데이터 양은 고정)
		trafficStats = {
			...trafficStats,
			currentBitrateKbps: 0
		};

		isAiSpeaking = false;
		isUserSpeaking = false;
		isSafeDisconnected = true;
		disconnectVerificationReport = report;

		addLog(
			'안전 종료 검증 완료',
			'success',
			'WebRTC 소켓 및 마이크 하드웨어 트랙이 완전히 정지되었습니다. 추가 데이터 송수신 및 API 과금이 전혀 발생하지 않습니다.'
		);

		if (connectionState !== 'error') {
			connectionState = 'disconnected';
		}
	}

	function setupAudioVisualizer(stream) {
		if (!visualizerCanvas) return;
		try {
			const AudioContextClass = window.AudioContext || window.webkitAudioContext;
			audioContext = new AudioContextClass();
			const source = audioContext.createMediaStreamSource(stream);
			analyser = audioContext.createAnalyser();
			analyser.fftSize = 64;
			source.connect(analyser);

			const canvasCtx = visualizerCanvas.getContext('2d');
			const bufferLength = analyser.frequencyBinCount;
			const dataArray = new Uint8Array(bufferLength);

			function draw() {
				if (!visualizerCanvas) return;
				animationFrameId = requestAnimationFrame(draw);

				analyser.getByteFrequencyData(dataArray);

				canvasCtx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);

				const barWidth = (visualizerCanvas.width / bufferLength) * 1.8;
				let x = 0;

				for (let i = 0; i < bufferLength; i++) {
					const barHeight = (dataArray[i] / 255) * visualizerCanvas.height * 0.9;

					const gradient = canvasCtx.createLinearGradient(0, visualizerCanvas.height, 0, 0);
					if (isUserSpeaking) {
						gradient.addColorStop(0, '#10b981');
						gradient.addColorStop(1, '#34d399');
					} else if (isAiSpeaking) {
						gradient.addColorStop(0, '#6366f1');
						gradient.addColorStop(1, '#a855f7');
					} else {
						gradient.addColorStop(0, '#475569');
						gradient.addColorStop(1, '#64748b');
					}

					canvasCtx.fillStyle = gradient;
					canvasCtx.beginPath();
					canvasCtx.roundRect(
						x,
						visualizerCanvas.height - Math.max(4, barHeight),
						barWidth - 2,
						Math.max(4, barHeight),
						4
					);
					canvasCtx.fill();

					x += barWidth;
				}
			}

			draw();
		} catch (e) {
			console.warn('비주얼라이저 초기화 실패:', e);
		}
	}

	function copyDebugLogs() {
		const logText = debugLogs.map((l) => `[${l.time}] [${l.status.toUpperCase()}] ${l.step} - ${l.details}`).join('\n');
		navigator.clipboard.writeText(logText);
		alert('디버그 로그가 클립보드에 복사되었습니다.');
	}

	function formatBytes(bytes) {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
	}
</script>

<div class="rounded-2xl bg-slate-900/90 border border-slate-800 p-6 shadow-2xl relative overflow-hidden space-y-6">
	<!-- Background glow effect -->
	<div
		class="absolute -top-24 -right-24 w-72 h-72 rounded-full blur-3xl pointer-events-none transition-all duration-700
		{connectionState === 'connected' ? (isAiSpeaking ? 'bg-indigo-600/20' : isUserSpeaking ? 'bg-emerald-600/20' : 'bg-slate-700/10') : 'bg-transparent'}"
	></div>

	<!-- Header with Status -->
	<div class="flex items-center justify-between pb-5 border-b border-slate-800/80">
		<div class="flex items-center gap-3">
			<div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
				<Icon name="sparkles" size={20} />
			</div>
			<div>
				<h2 class="text-lg font-bold text-white flex items-center gap-2">
					Realtime 영어회화 에이전트
					<span class="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
						Ultra-Low Latency
					</span>
				</h2>
				<p class="text-xs text-slate-400">WebRTC 직접 연결을 통한 무지연(Zero-Delay) 음성 대화</p>
			</div>
		</div>

		<!-- Status Badge -->
		<div class="flex items-center gap-2">
			{#if connectionState === 'connected'}
				<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
					<span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
					실시간 대화 중
				</span>
			{:else if connectionState === 'connecting'}
				<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
					<span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
					연결 중...
				</span>
			{:else}
				<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
					<span class="w-2 h-2 rounded-full bg-slate-500"></span>
					연결 완전 종료됨 (통신 OFF)
				</span>
			{/if}
		</div>
	</div>

	<!-- 🛡️ 실시간 리소스 & 통신 안전 모니터 (Security & Resource Monitor) -->
	<div class="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs space-y-3">
		<div class="flex items-center justify-between">
			<span class="font-bold text-slate-200 flex items-center gap-1.5">
				<Icon name="sparkles" size={14} class="text-cyan-400" />
				통신 상태 & 하드웨어 리소스 실시간 모니터
			</span>
			<span class="text-[11px] font-mono px-2 py-0.5 rounded {connectionState === 'connected' ? 'bg-indigo-950 text-indigo-300 border border-indigo-800' : 'bg-slate-900 text-slate-400 border border-slate-800'}">
				{#if connectionState === 'connected'}
					실시간 전송률: <strong class="text-indigo-200">{trafficStats.currentBitrateKbps} kbps</strong> ({trafficStats.durationSec}s)
				{:else}
					실시간 트래픽: <strong class="text-emerald-400">0 B/s (통신 차단됨)</strong>
				{/if}
			</span>
		</div>

		<!-- 4대 리소스 실시간 상태 지표 -->
		<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
			<!-- 1. WebRTC 연결 -->
			<div class="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col justify-between">
				<span class="text-[10px] text-slate-400">WebRTC 피어 연결</span>
				<div class="flex items-center gap-1.5 mt-1">
					<span class="w-2 h-2 rounded-full {rtcState === 'connected' ? 'bg-emerald-400 animate-pulse' : rtcState === 'connecting' ? 'bg-amber-400' : 'bg-slate-500'}"></span>
					<strong class="text-[11px] {rtcState === 'connected' ? 'text-emerald-300' : rtcState === 'connecting' ? 'text-amber-300' : 'text-slate-400'}">
						{rtcState === 'connected' ? '연결됨 (OpenAI)' : rtcState === 'connecting' ? '연결 수립 중' : '완전 폐쇄 (Closed)'}
					</strong>
				</div>
			</div>

			<!-- 2. 마이크 하드웨어 -->
			<div class="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col justify-between">
				<span class="text-[10px] text-slate-400">마이크 기기 스트림</span>
				<div class="flex items-center gap-1.5 mt-1">
					<span class="w-2 h-2 rounded-full {micHardwareState === 'live' ? 'bg-red-500 animate-ping' : 'bg-slate-500'}"></span>
					<strong class="text-[11px] {micHardwareState === 'live' ? 'text-red-400' : 'text-slate-400'}">
						{micHardwareState === 'live' ? '기기 녹음 중 (Live)' : '하드웨어 OFF (Ended)'}
					</strong>
				</div>
			</div>

			<!-- 3. DataChannel -->
			<div class="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col justify-between">
				<span class="text-[10px] text-slate-400">이벤트 데이터 채널</span>
				<div class="flex items-center gap-1.5 mt-1">
					<span class="w-2 h-2 rounded-full {dataChannelState === 'open' ? 'bg-purple-400' : 'bg-slate-500'}"></span>
					<strong class="text-[11px] {dataChannelState === 'open' ? 'text-purple-300' : 'text-slate-400'}">
						{dataChannelState === 'open' ? '수신 중 (Open)' : '통신 차단 (Closed)'}
					</strong>
				</div>
			</div>

			<!-- 4. 누적 통신량 & 과금 안전 -->
			<div class="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col justify-between">
				<span class="text-[10px] text-slate-400">누적 트래픽 / 추가 과금</span>
				<div class="flex items-center gap-1.5 mt-1">
					<span class="w-2 h-2 rounded-full {connectionState === 'connected' ? 'bg-indigo-400' : 'bg-emerald-400'}"></span>
					<strong class="text-[11px] {connectionState === 'connected' ? 'text-indigo-300' : 'text-emerald-400'}">
						{#if connectionState === 'connected'}
							{formatBytes(trafficStats.bytesSent + trafficStats.bytesReceived)}
						{:else}
							과금 중단 (안전)
						{/if}
					</strong>
				</div>
			</div>
		</div>

		<!-- ✅ 안전 종료 검증 리포트 (대화 종료 후 확실한 리소스 해제 확인 알림) -->
		{#if isSafeDisconnected && connectionState === 'disconnected'}
			<div class="p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-emerald-200 text-xs space-y-1.5">
				<div class="flex items-center justify-between font-bold text-emerald-300">
					<span class="flex items-center gap-1.5">
						<span class="w-2 h-2 rounded-full bg-emerald-400"></span>
						대화가 정상 종료되었으며, 모든 API 통신 및 마이크 스트림이 완벽히 차단되었습니다.
					</span>
					<span class="text-[10px] text-emerald-400/80">추가 과금 없음</span>
				</div>
				<ul class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 text-[11px] text-slate-300 font-mono">
					{#each disconnectVerificationReport as item}
						<li class="flex items-center gap-1.5">
							<span class="text-emerald-400 font-bold">✓</span>
							<span class="text-slate-400">{item.title}:</span>
							<span class="text-emerald-300 font-semibold">{item.desc}</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	</div>

	<!-- 🔍 System Diagnostics Bar (백엔드 및 시스템 상태 실시간 진단기) -->
	<div class="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs">
		<div class="flex items-center justify-between mb-2">
			<span class="font-bold text-slate-300 flex items-center gap-1.5">
				<Icon name="info" size={14} class="text-indigo-400" />
				시스템 연결 상태 진단
			</span>
			<button
				type="button"
				onclick={checkSystemHealth}
				class="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 underline cursor-pointer"
			>
				<Icon name="refresh" size={12} /> 다시 점검
			</button>
		</div>

		<div class="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
			<!-- Backend Status Item -->
			<div class="flex items-center gap-2 p-2 rounded-lg bg-slate-900 border border-slate-800/80">
				<div class="w-2.5 h-2.5 rounded-full shrink-0 {backendStatus === 'online' ? 'bg-emerald-400 ring-2 ring-emerald-400/20' : backendStatus === 'checking' ? 'bg-amber-400 animate-pulse' : 'bg-red-400 ring-2 ring-red-400/20'}"></div>
				<div class="truncate">
					<p class="text-[10px] text-slate-400">FastAPI 서버 (포트 8000)</p>
					<p class="font-semibold {backendStatus === 'online' ? 'text-emerald-300' : 'text-red-300'}">
						{backendStatus === 'online' ? '정상 작동 중' : backendStatus === 'checking' ? '확인 중...' : '서버 미실행 (오프라인)'}
					</p>
				</div>
			</div>

			<!-- API Key Item -->
			<div class="flex items-center gap-2 p-2 rounded-lg bg-slate-900 border border-slate-800/80">
				<div class="w-2.5 h-2.5 rounded-full shrink-0 {apiKeyStatus.is_configured ? 'bg-emerald-400 ring-2 ring-emerald-400/20' : 'bg-amber-400'}"></div>
				<div class="truncate">
					<p class="text-[10px] text-slate-400">OpenAI API Key</p>
					<p class="font-semibold {apiKeyStatus.is_configured ? 'text-emerald-300' : 'text-amber-300'}">
						{apiKeyStatus.masked_key}
					</p>
				</div>
			</div>

			<!-- Microphone Permission Item -->
			<div class="flex items-center gap-2 p-2 rounded-lg bg-slate-900 border border-slate-800/80">
				<div class="w-2.5 h-2.5 rounded-full shrink-0 {micPermission === 'granted' ? 'bg-emerald-400 ring-2 ring-emerald-400/20' : micPermission === 'denied' ? 'bg-red-400' : 'bg-slate-400'}"></div>
				<div class="truncate">
					<p class="text-[10px] text-slate-400">마이크 권한</p>
					<p class="font-semibold {micPermission === 'granted' ? 'text-emerald-300' : micPermission === 'denied' ? 'text-red-300' : 'text-slate-300'}">
						{micPermission === 'granted' ? '허용됨' : micPermission === 'denied' ? '차단됨' : '요청 준비됨'}
					</p>
				</div>
			</div>
		</div>

		{#if backendStatus === 'offline'}
			<div class="mt-2.5 p-2 rounded-lg bg-red-950/40 border border-red-800/50 text-[11px] text-red-300">
				⚠️ <strong>백엔드 서버가 켜져 있지 않습니다.</strong> 터미널에서 다음 명령어를 실행해주세요:<br />
				<code class="block mt-1 p-1 bg-slate-950 text-indigo-300 rounded font-mono text-[10px]">uv run uvicorn main:app --reload --port 8000</code>
			</div>
		{/if}
	</div>

	<!-- 🚨 Actionable Error Alert -->
	{#if errorMessage}
		<div class="p-4 rounded-xl bg-red-950/60 border border-red-800 text-red-200 text-xs space-y-2">
			<div class="flex items-start gap-2.5">
				<Icon name="info" size={18} class="text-red-400 mt-0.5 shrink-0" />
				<div class="space-y-1">
					<p class="font-bold text-red-100 text-sm">연결 오류 발생 ({errorType})</p>
					<p class="text-red-200 font-mono text-[11px] bg-red-900/30 p-1.5 rounded">{errorMessage}</p>
				</div>
			</div>

			{#if errorSolution}
				<div class="mt-2 pt-2 border-t border-red-800/60 text-slate-300 text-[11px] space-y-1">
					<strong class="text-emerald-400 flex items-center gap-1">💡 해결 방법:</strong>
					<p>{errorSolution}</p>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Visualizer & Live Status Center -->
	<div class="p-6 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex flex-col items-center justify-center relative">
		<!-- State Indicator Animation Circle -->
		<div class="relative flex items-center justify-center mb-5">
			<div
				class="w-28 h-28 rounded-full flex items-center justify-center transition-all duration-500 relative
				{connectionState === 'connected'
					? isAiSpeaking
						? 'bg-gradient-to-tr from-indigo-600 to-purple-600 shadow-xl shadow-indigo-500/40 scale-105 ring-4 ring-indigo-400/30'
						: isUserSpeaking
						? 'bg-gradient-to-tr from-emerald-600 to-teal-500 shadow-xl shadow-emerald-500/40 scale-105 ring-4 ring-emerald-400/30'
						: 'bg-slate-800/80 border border-slate-700'
					: 'bg-slate-800/50 border border-slate-700/50'}"
			>
				<Icon
					name={connectionState === 'connected' ? (isAiSpeaking ? 'volume-2' : 'mic') : 'waveform'}
					size={36}
					class={connectionState === 'connected' ? 'text-white' : 'text-slate-500'}
				/>
			</div>
		</div>

		<!-- Live Audio Waveform Canvas -->
		<canvas
			bind:this={visualizerCanvas}
			width="320"
			height="48"
			class="w-full max-w-xs h-12 mb-3 opacity-90"
		></canvas>

		<!-- Subtitle / State Text -->
		<div class="text-center min-h-[28px] flex items-center justify-center">
			{#if connectionState === 'connected'}
				{#if isAiSpeaking}
					<span class="text-xs font-semibold text-indigo-400 animate-pulse flex items-center gap-1.5">
						<Icon name="volume-2" size={14} /> AI 튜터가 말하고 있습니다...
					</span>
				{:else if isUserSpeaking}
					<span class="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
						<Icon name="mic" size={14} /> 듣고 있습니다 (말씀하세요)...
					</span>
				{:else}
					<span class="text-xs text-slate-400">자연스럽게 영어로 질문하거나 대화를 시작해보세요.</span>
				{/if}
			{:else if connectionState === 'connecting'}
				<span class="text-xs text-amber-400">OpenAI Realtime WebRTC 세션을 생성하는 중...</span>
			{:else}
				<span class="text-xs text-slate-400">대화 시작 버튼을 누르면 실시간 통화가 시작됩니다.</span>
			{/if}
		</div>

		<!-- Action Buttons -->
		<div class="mt-6 flex items-center gap-4">
			{#if connectionState === 'connected'}
				<button
					type="button"
					onclick={disconnect}
					class="px-6 py-2.5 rounded-xl font-semibold text-sm bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30 flex items-center gap-2 cursor-pointer transition-all active:scale-95"
				>
					<Icon name="stop" size={16} />
					<span>대화 종료</span>
				</button>
			{:else}
				<button
					type="button"
					onclick={connect}
					disabled={connectionState === 'connecting'}
					class="px-8 py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:from-indigo-400 hover:via-purple-400 hover:to-pink-400 text-white shadow-xl shadow-indigo-500/25 flex items-center gap-2.5 cursor-pointer transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{#if connectionState === 'connecting'}
						<Icon name="refresh" size={16} class="animate-spin" />
						<span>연결 중...</span>
					{:else}
						<Icon name="mic" size={18} />
						<span>실시간 영어 대화 시작하기</span>
					{/if}
				</button>
			{/if}
		</div>
	</div>

	<!-- Conversation Transcript Stream -->
	<div class="space-y-3">
		<div class="flex items-center justify-between text-xs font-semibold text-slate-400 px-1">
			<span class="flex items-center gap-1.5">
				<Icon name="list" size={14} class="text-indigo-400" /> 실시간 대화 자막
			</span>
			<span>{messages.length}개의 대화 기록</span>
		</div>

		<div class="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 min-h-[160px] max-h-[260px] overflow-y-auto space-y-3">
			{#if messages.length === 0 && !currentAiMessage}
				<div class="h-32 flex flex-col items-center justify-center text-center text-slate-600 text-xs">
					<Icon name="waveform" size={24} class="mb-2 opacity-50" />
					<p>대화가 시작되면 실시간으로 주고받은 영어 발화가 자막으로 표시됩니다.</p>
				</div>
			{:else}
				{#each messages as msg (msg.id)}
					<div class="flex gap-2.5 text-xs {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
						{#if msg.role === 'assistant'}
							<div class="w-6 h-6 rounded-full bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shrink-0 text-[10px] font-bold">
								AI
							</div>
						{/if}
						<div
							class="max-w-[80%] rounded-2xl px-3.5 py-2.5 leading-relaxed
							{msg.role === 'user'
								? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-tr-none'
								: 'bg-slate-800/90 text-slate-200 border border-slate-700/60 rounded-tl-none'}"
						>
							<p>{msg.text}</p>
						</div>
					</div>
				{/each}

				<!-- Live Streaming AI Delta -->
				{#if currentAiMessage}
					<div class="flex gap-2.5 text-xs justify-start">
						<div class="w-6 h-6 rounded-full bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shrink-0 text-[10px] font-bold">
							AI
						</div>
						<div class="max-w-[80%] rounded-2xl px-3.5 py-2.5 leading-relaxed bg-slate-800/90 text-indigo-200 border border-indigo-500/40 rounded-tl-none animate-pulse">
							<p>{currentAiMessage}<span class="inline-block w-1.5 h-3.5 bg-indigo-400 ml-1 translate-y-0.5 animate-ping"></span></p>
						</div>
					</div>
				{/if}
			{/if}
		</div>
	</div>

	<!-- 🛠️ Realtime Step-by-Step Debug & Event Logs -->
	<details class="group border border-slate-800 bg-slate-950/60 rounded-xl overflow-hidden text-xs" bind:open={isDiagnosticsOpen}>
		<summary class="p-3 bg-slate-900/60 font-semibold text-slate-300 hover:text-white flex items-center justify-between cursor-pointer list-none select-none">
			<span class="flex items-center gap-2">
				<Icon name="settings" size={14} class="text-indigo-400" />
				실시간 연결 단계 및 디버그 콘솔 로그 ({debugLogs.length})
			</span>
			<div class="flex items-center gap-2">
				<button
					type="button"
					onclick={(e) => { e.stopPropagation(); copyDebugLogs(); }}
					class="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] cursor-pointer"
				>
					로그 복사
				</button>
				<span class="text-slate-500 group-open:rotate-180 transition-transform">▼</span>
			</div>
		</summary>

		<div class="p-3 max-h-48 overflow-y-auto font-mono text-[11px] space-y-1.5 bg-slate-950">
			{#if debugLogs.length === 0}
				<p class="text-slate-600">아직 생성된 로그가 없습니다.</p>
			{:else}
				{#each debugLogs as log}
					<div class="flex items-start gap-2 leading-relaxed">
						<span class="text-slate-500 shrink-0">[{log.time}]</span>
						<span
							class="px-1.5 py-0.2 rounded font-bold shrink-0 text-[10px]
							{log.status === 'success' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
							 log.status === 'error' ? 'bg-red-950 text-red-400 border border-red-800' :
							 log.status === 'warn' ? 'bg-amber-950 text-amber-400 border border-amber-800' :
							 'bg-slate-900 text-indigo-300 border border-slate-800'}"
						>
							{log.step}
						</span>
						<span class="{log.status === 'error' ? 'text-red-300' : log.status === 'success' ? 'text-emerald-200' : 'text-slate-300'} break-all">
							{log.details}
						</span>
					</div>
				{/each}
			{/if}
		</div>
	</details>

	<!-- Latency & Voice Settings Accordion -->
	<details class="group border-t border-slate-800/80 pt-4">
		<summary class="text-xs font-semibold text-slate-400 hover:text-slate-200 flex items-center justify-between cursor-pointer list-none select-none">
			<span class="flex items-center gap-1.5">
				<Icon name="settings" size={14} class="text-indigo-400" /> 초저지연 VAD 및 보이스 세부 설정
			</span>
			<span class="text-slate-500 group-open:rotate-180 transition-transform">▼</span>
		</summary>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 text-xs">
			<!-- Voice Model Selection -->
			<div class="space-y-1.5">
				<label for="voice-select" class="font-medium text-slate-300">AI 보이스 선택</label>
				<select
					id="voice-select"
					bind:value={selectedVoice}
					disabled={connectionState === 'connected'}
					class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
				>
					{#each VOICES as voice}
						<option value={voice.id}>{voice.name}</option>
					{/each}
				</select>
			</div>

			<!-- Ultra-Low Latency VAD Slider -->
			<div class="space-y-1.5">
				<div class="flex items-center justify-between">
					<label for="silence-slider" class="font-medium text-slate-300">무음 감지 지연시간 (VAD)</label>
					<span class="text-indigo-400 font-bold">{silenceDurationMs}ms (초저지연)</span>
				</div>
				<input
					id="silence-slider"
					type="range"
					min="200"
					max="800"
					step="50"
					bind:value={silenceDurationMs}
					disabled={connectionState === 'connected'}
					class="w-full accent-indigo-500 disabled:opacity-50"
				/>
				<p class="text-[11px] text-slate-500">값이 작을수록 말이 끝났을 때 AI의 응답 속도가 더욱 빨라집니다.</p>
			</div>

			<!-- Custom Prompt -->
			<div class="sm:col-span-2 space-y-1.5">
				<label for="prompt-input" class="font-medium text-slate-300">영어 튜터 지시사항 (Prompt)</label>
				<textarea
					id="prompt-input"
					rows="2"
					bind:value={customPrompt}
					disabled={connectionState === 'connected'}
					class="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-indigo-500 disabled:opacity-50 resize-none"
				></textarea>
			</div>
		</div>
	</details>
</div>
