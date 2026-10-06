/**
 * Format seconds into mm:ss or mm:ss.ms
 * @param {number} seconds
 * @param {boolean} [includeMs=false]
 * @returns {string}
 */
export function formatTime(seconds, includeMs = false) {
	if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) seconds = 0;
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	const formattedMins = String(mins).padStart(2, '0');
	const formattedSecs = String(secs).padStart(2, '0');

	if (includeMs) {
		const ms = Math.floor((seconds % 1) * 10);
		return `${formattedMins}:${formattedSecs}.${ms}`;
	}
	return `${formattedMins}:${formattedSecs}`;
}

/**
 * Format bytes into human readable string (KB, MB)
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
	if (bytes === 0) return '0 Bytes';
	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
