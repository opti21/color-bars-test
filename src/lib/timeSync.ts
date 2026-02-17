// Time synchronization for broadcast environments
// Default: trusts OS system clock (assumed NTP/PTP-synced to facility grandmaster)
// Fallback: optional sync via worldtimeapi.org for non-broadcast use

type SyncMode = 'system' | 'ntp-api';

interface TimeData {
	offset: number; // Difference between local and reference time in ms
	lastSync: Date;
	synced: boolean;
	mode: SyncMode;
}

let timeData: TimeData = {
	offset: 0,
	lastSync: new Date(),
	synced: true,
	mode: 'system'
};

let syncInProgress = false;

/**
 * Initialize time sync.
 * 'system' mode (default): zero offset, trusts OS clock is NTP-synced.
 * 'ntp-api' mode: queries worldtimeapi.org as a fallback for non-broadcast setups.
 */
export async function syncTime(mode: SyncMode = 'system'): Promise<TimeData> {
	timeData.mode = mode;

	if (mode === 'system') {
		timeData = {
			offset: 0,
			lastSync: new Date(),
			synced: true,
			mode: 'system'
		};
		console.log('Time sync: using OS system clock (NTP/PTP assumed)');
		return timeData;
	}

	// ntp-api fallback
	if (syncInProgress) return timeData;
	syncInProgress = true;

	try {
		const requestStart = Date.now();
		const response = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');

		if (!response.ok) throw new Error('Time sync failed');

		const requestEnd = Date.now();
		const data = await response.json();
		const latency = (requestEnd - requestStart) / 2;
		const serverTimestamp = new Date(data.utc_datetime).getTime() + latency;
		const localTimestamp = Date.now();

		timeData = {
			offset: serverTimestamp - localTimestamp,
			lastSync: new Date(),
			synced: true,
			mode: 'ntp-api'
		};

		console.log(`Time synced via API. Offset: ${timeData.offset}ms, RTT: ${requestEnd - requestStart}ms`);
	} catch (error) {
		console.warn('API time sync failed, falling back to system clock:', error);
		timeData = { offset: 0, lastSync: new Date(), synced: true, mode: 'system' };
	} finally {
		syncInProgress = false;
	}

	return timeData;
}

export function getSyncedTime(): Date {
	return new Date(Date.now() + timeData.offset);
}

export function getTimeData(): TimeData {
	return { ...timeData };
}

export function formatTime(date: Date, includeMs = false): string {
	const hours = date.getUTCHours().toString().padStart(2, '0');
	const minutes = date.getUTCMinutes().toString().padStart(2, '0');
	const seconds = date.getUTCSeconds().toString().padStart(2, '0');

	if (includeMs) {
		const ms = date.getUTCMilliseconds().toString().padStart(3, '0');
		return `${hours}:${minutes}:${seconds}.${ms}`;
	}

	return `${hours}:${minutes}:${seconds}`;
}

export function formatDate(date: Date): string {
	const year = date.getUTCFullYear();
	const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
	const day = date.getUTCDate().toString().padStart(2, '0');
	return `${year}-${month}-${day}`;
}
