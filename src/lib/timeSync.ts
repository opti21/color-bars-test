// Time synchronization with NIST time servers
// Uses worldtimeapi.org as a proxy since time.gov doesn't have a public API

interface TimeData {
	serverTime: Date;
	offset: number; // Difference between local and server time in ms
	lastSync: Date;
	synced: boolean;
}

let timeData: TimeData = {
	serverTime: new Date(),
	offset: 0,
	lastSync: new Date(0),
	synced: false
};

let syncInProgress = false;

export async function syncTime(): Promise<TimeData> {
	if (syncInProgress) {
		return timeData;
	}

	syncInProgress = true;

	try {
		// Measure round trip time for accuracy
		const requestStart = Date.now();

		// Use worldtimeapi.org which returns NIST-synchronized time
		const response = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');

		if (!response.ok) {
			throw new Error('Time sync failed');
		}

		const requestEnd = Date.now();
		const data = await response.json();

		// Estimate one-way latency as half of round trip
		const latency = (requestEnd - requestStart) / 2;

		// Parse the ISO timestamp and adjust for latency
		const serverTimestamp = new Date(data.utc_datetime).getTime() + latency;
		const localTimestamp = Date.now();

		timeData = {
			serverTime: new Date(serverTimestamp),
			offset: serverTimestamp - localTimestamp,
			lastSync: new Date(),
			synced: true
		};

		console.log(`Time synced. Offset: ${timeData.offset}ms`);
	} catch (error) {
		console.warn('Time sync failed, using local time:', error);
		timeData.synced = false;
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
