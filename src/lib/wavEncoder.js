/**
 * Convert AudioBuffer to standard WAV Blob (16-bit PCM)
 * @param {AudioBuffer} audioBuffer
 * @returns {Blob}
 */
export function audioBufferToWavBlob(audioBuffer) {
	const numOfChan = audioBuffer.numberOfChannels;
	const length = audioBuffer.length * numOfChan * 2 + 44;
	const out = new DataView(new ArrayBuffer(length));
	const sampleRate = audioBuffer.sampleRate;
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

	// 1. RIFF identifier
	setUint32(0x46464952); // "RIFF"
	setUint32(length - 8);  // file length - 8
	setUint32(0x45564157); // "WAVE"

	// 2. format chunk identifier
	setUint32(0x20746d66); // "fmt "
	setUint32(16);          // format chunk length (16 for PCM)
	setUint16(1);           // sample format (1 = PCM)
	setUint16(numOfChan);   // channel count
	setUint32(sampleRate);  // sample rate
	setUint32(sampleRate * 2 * numOfChan); // byte rate (sampleRate * blockAlign)
	setUint16(numOfChan * 2);              // block align (channel count * bytes per sample)
	setUint16(16);          // bits per sample (16 bit)

	// 3. data chunk identifier
	setUint32(0x61746164); // "data"
	setUint32(length - pos - 4); // data chunk length

	// 4. Interleave & write PCM samples
	const channels = [];
	for (let i = 0; i < numOfChan; i++) {
		channels.push(audioBuffer.getChannelData(i));
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

/**
 * Convert Float32Array chunks to standard WAV Blob
 * @param {Float32Array[]} chunks
 * @param {number} sampleRate
 * @param {number} [channels=1]
 * @returns {Blob}
 */
export function pcmChunksToWavBlob(chunks, sampleRate, channels = 1) {
	let totalLength = 0;
	for (const chunk of chunks) {
		totalLength += chunk.length;
	}

	const merged = new Float32Array(totalLength);
	let offset = 0;
	for (const chunk of chunks) {
		merged.set(chunk, offset);
		offset += chunk.length;
	}

	const bufferLength = totalLength * 2 + 44;
	const out = new DataView(new ArrayBuffer(bufferLength));
	let pos = 0;

	function setUint16(data) {
		out.setUint16(pos, data, true);
		pos += 2;
	}
	function setUint32(data) {
		out.setUint32(pos, data, true);
		pos += 4;
	}

	// RIFF
	setUint32(0x46464952);
	setUint32(bufferLength - 8);
	setUint32(0x45564157); // WAVE

	// fmt
	setUint32(0x20746d66);
	setUint32(16);
	setUint16(1); // PCM
	setUint16(channels);
	setUint32(sampleRate);
	setUint32(sampleRate * 2 * channels);
	setUint16(channels * 2);
	setUint16(16);

	// data
	setUint32(0x61746164);
	setUint32(bufferLength - pos - 4);

	// Write 16-bit PCM samples
	for (let i = 0; i < totalLength; i++) {
		let s = Math.max(-1, Math.min(1, merged[i]));
		s = s < 0 ? s * 0x8000 : s * 0x7FFF;
		out.setInt16(pos, s, true);
		pos += 2;
	}

	return new Blob([out], { type: 'audio/wav' });
}
