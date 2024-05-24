import type { RequestHandler } from '@sveltejs/kit';
import osu from 'node-os-utils';

const { cpu, drive, mem, os } = osu;

const cpuData: number[] = [];
const timeStamps: string[] = [];

const fetchCPUInfo = async () => {
	try {
		const cpuUsage = await cpu.usage();
		const timeStamp = new Date().toISOString();

		cpuData.push(cpuUsage);
		timeStamps.push(timeStamp);

		// Limit the size of the arrays to avoid using too much memory
		if (cpuData.length > 100) {
			cpuData.shift();
			timeStamps.shift();
		}

		return {
			cpuUsage: cpuData,
			timeStamps: timeStamps
		};
	} catch (error) {
		console.error('Error fetching CPU info:', error);
		throw new Error('Internal Server Error');
	}
};

const fetchDiskInfo = async () => {
	try {
		const diskUsage = await drive.info('/');
		if (diskUsage && typeof diskUsage === 'object') {
			return {
				totalGb: diskUsage.totalGb,
				usedGb: diskUsage.usedGb,
				freeGb: diskUsage.freeGb,
				usedPercentage: diskUsage.usedPercentage,
				freePercentage: diskUsage.freePercentage
			};
		} else {
			throw new Error('Disk usage information is not available');
		}
	} catch (error) {
		console.error('Error fetching disk info:', error);
		throw new Error('Internal Server Error');
	}
};

const fetchMemoryInfo = async () => {
	try {
		const memoryInfo = await mem.info();
		return {
			totalMemMb: memoryInfo.totalMemMb,
			usedMemMb: memoryInfo.usedMemMb,
			freeMemMb: memoryInfo.freeMemMb,
			usedMemPercentage: memoryInfo.usedMemPercentage,
			freeMemPercentage: memoryInfo.freeMemPercentage
		};
	} catch (error) {
		console.error('Error fetching memory info:', error);
		throw new Error('Internal Server Error');
	}
};

const getSystemInfo = async () => {
	const cpuInfo = await fetchCPUInfo();
	const diskInfo = await fetchDiskInfo();
	const memoryInfo = await fetchMemoryInfo();
	const osInfo = {
		platform: os.platform(),
		uptime: os.uptime(),
		hostname: os.hostname(),
		type: os.type(),
		arch: os.arch()
	};

	return {
		cpuInfo,
		diskInfo,
		memoryInfo,
		osInfo
	};
};

export const GET: RequestHandler = async () => {
	try {
		const systemInfo = await getSystemInfo();

		return new Response(JSON.stringify(systemInfo), {
			status: 200,
			headers: {
				'Content-Type': 'application/json'
			}
		});
	} catch (error) {
		console.error('Error fetching system info:', error);

		return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
			status: 500,
			headers: {
				'Content-Type': 'application/json'
			}
		});
	}
};
