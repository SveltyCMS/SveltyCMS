import type { RequestHandler } from '@sveltejs/kit';
import osu from 'node-os-utils';

// System Logs
import {logger} from '@src/utils/logger';

const { cpu, drive, mem, os } = osu;

const cpuData: number[] = [];
const timeStamps: string[] = [];

// Function to fetch CPU usage information
const fetchCPUInfo = async () => {
	try {
		const cpuUsage = await cpu.usage();
		const timeStamp = new Date().toISOString();

		// Store the CPU usage and timestamp
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
		logger.error('Error fetching CPU info:', error);
		throw new Error('Failed to fetch CPU information');
	}
};

// Function to fetch disk usage information
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
		logger.error('Error fetching disk info:', error);
		throw new Error('Failed to fetch disk information');
	}
};

// Function to fetch memory usage information
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
		logger.error('Error fetching memory info:', error);
		throw new Error('Failed to fetch memory information');
	}
};

// Function to fetch overall system information
const getSystemInfo = async () => {
	try {
		const [cpuInfo, diskInfo, memoryInfo] = await Promise.all([fetchCPUInfo(), fetchDiskInfo(), fetchMemoryInfo()]);

		// Fetch OS information
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
	} catch (error) {
		logger.error('Error fetching system info:', error);
		throw new Error('Failed to fetch system information');
	}
};

// Define the GET request handler
export const GET: RequestHandler = async () => {
	try {
		// Fetch system information
		const systemInfo = await getSystemInfo();
		logger.info('System information fetched successfully');

		// Return the system information as a JSON response
		return new Response(JSON.stringify(systemInfo), {
			status: 200,
			headers: {
				'Content-Type': 'application/json'
			}
		});
	} catch (error) {
		logger.error('Error fetching system info:', error);

		// Return an error response in case of failure
		return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
			status: 500,
			headers: {
				'Content-Type': 'application/json'
			}
		});
	}
};
