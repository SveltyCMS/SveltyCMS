/**
 * @file src/routes/api/systemInfo/+server.ts
 * @description API endpoint for fetching system information.
 *
 * This module provides functionality to:
 * - Fetch and track CPU usage over time
 * - Retrieve disk usage information
 * - Get memory usage details
 * - Collect overall system information including OS details
 *
 * Features:
 * - Real-time CPU usage tracking with historical data
 * - Disk space utilization reporting
 * - Memory usage statistics
 * - OS information collection
 * - Error handling and logging
 *
 * Usage:
 * GET /api/systemInfo
 * Returns: JSON object with CPU, disk, memory, and OS information
 *
 * Note: This endpoint may expose sensitive system information.
 * Ensure proper access controls are in place.
 */

import type { RequestHandler } from '@sveltejs/kit';
import osu from 'node-os-utils';

// System Logger
import { logger } from '@utils/logger';

const { cpu, drive, mem, os } = osu;

const MAX_DATA_POINTS = 100;
const cpuData: number[] = [];
const timeStamps: string[] = [];

// Fetches CPU usage information and tracks it over time
const fetchCPUInfo = async () => {
	try {
		const cpuUsage = await cpu.usage();
		const timeStamp = new Date().toISOString();

		// Store the CPU usage and timestamp
		cpuData.push(cpuUsage);
		timeStamps.push(timeStamp);

		// Maintain a fixed size for the data arrays
		if (cpuData.length > MAX_DATA_POINTS) {
			cpuData.shift();
			timeStamps.shift();
		}

		return { cpuUsage: cpuData, timeStamps };
	} catch (error) {
		logger.error('Error fetching CPU info:', error instanceof Error ? error.message : String(error));
		throw new Error('Failed to fetch CPU information');
	}
};

// Fetches disk usage information
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
		logger.error('Error fetching disk info:', error instanceof Error ? error.message : String(error));
		throw new Error('Failed to fetch disk information');
	}
};

// Fetches memory usage information
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
		logger.error('Error fetching memory info:', error instanceof Error ? error.message : String(error));
		throw new Error('Failed to fetch memory information');
	}
};

//Collects overall system information including CPU, disk, memory, and OS details.
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

		return { cpuInfo, diskInfo, memoryInfo, osInfo };
	} catch (error) {
		logger.error('Error fetching system info:', error instanceof Error ? error.message : String(error));
		throw new Error('Failed to fetch system information');
	}
};

// Fetches and returns system information including CPU, disk, memory, and OS details.
export const GET: RequestHandler = async () => {
	try {
		// Fetch system information
		const systemInfo = await getSystemInfo();
		logger.info('System information fetched successfully');

		// Return the system information as a JSON response
		return new Response(JSON.stringify(systemInfo), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		logger.error('Error fetching system info:', error instanceof Error ? error.message : String(error));

		// Return an error response in case of failure
		return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
