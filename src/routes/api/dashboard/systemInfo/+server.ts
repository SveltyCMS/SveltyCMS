/**
 * @file src/routes/api/dashboard/systemInfo/+server.ts
 * @description Enhanced API endpoint for fetching comprehensive system information.
 *
 * This module provides functionality to:
 * - Fetch and track CPU usage over time with core-specific data
 * - Retrieve detailed disk usage information for multiple mount points
 * - Get memory usage details with swap information
 * - Monitor network usage statistics
 * - Track process information including top processes by CPU and memory
 * - Collect overall system information including OS details
 * - Provide system uptime and load averages
 *
 * Features:
 * - Real-time CPU usage tracking with historical data
 * - Disk space utilization reporting across multiple drives
 * - Memory usage statistics with detailed breakdown
 * - Network interface monitoring
 * - OS information collection
 * - Process monitoring
 * - Error handling and logging
 * - Response caching to reduce system load
 *
 * Usage:
 * GET /api/dashboard/systemInfo - Full system information
 * GET /api/dashboard/systemInfo?type=cpu - Only CPU information
 * GET /api/dashboard/systemInfo?type=disk - Only disk information
 * GET /api/dashboard/systemInfo?type=memory - Only memory information
 * GET /api/dashboard/systemInfo?type=network - Only network information
 * GET /api/dashboard/systemInfo?type=os - Only OS information
 * GET /api/dashboard/systemInfo?type=process - Only process information
 *
 * Returns: JSON object with requested system information
 *
 * Note: This endpoint may expose sensitive system information.
 * Ensure proper access controls are in place.
 */

import { exec } from 'node:child_process';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { promisify } from 'node:util';
import { json } from '@sveltejs/kit';
import { createOSUtils } from 'node-os-utils';

// Permissions

// System Logger
import { logger } from '@utils/logger.server';

// Create OSUtils instance
const osUtils = createOSUtils();
const execAsync = promisify(exec);

// Configuration
const MAX_DATA_POINTS = 100;
const CACHE_DURATION = 1000; // 1 second cache to prevent hammering
const PROCESS_LIMIT = 10; // Number of top processes to return

// Cache storage
interface CacheEntry {
	data: unknown;
	timestamp: number;
}

const cache: Record<string, CacheEntry> = {
	cpu: { timestamp: 0, data: null },
	disk: { timestamp: 0, data: null },
	memory: { timestamp: 0, data: null },
	network: { timestamp: 0, data: null },
	os: { timestamp: 0, data: null },
	process: { timestamp: 0, data: null },
	all: { timestamp: 0, data: null }
};

// Historical data storage
const cpuData: number[] = [];
const cpuCoreData: number[][] = [];
const timeStamps: string[] = [];
let networkBaseline: { rx: number; tx: number; timestamp: number } | null = null;

// Initialize core data array
const initCoreDatas = () => {
	const cpuCount = os.cpus().length;
	for (let i = 0; i < cpuCount; i++) {
		cpuCoreData[i] = [];
	}
};
initCoreDatas();

// Check if data is stale and needs refresh
const isStale = (type: string): boolean => {
	const now = performance.now();
	return now - (cache[type]?.timestamp || 0) > CACHE_DURATION;
};

// Get data from cache or fetch fresh
const getCachedOrFresh = async <T>(type: string, fetchFunction: () => Promise<T>): Promise<T> => {
	if (isStale(type)) {
		try {
			const data = await fetchFunction();
			cache[type] = { timestamp: performance.now(), data };
		} catch (error) {
			logger.error(`Error fetching ${type} info:`, error instanceof Error ? error.message : String(error));
			// If we had previous data, keep using it even if stale
			if (!cache[type]?.data) {
				throw new Error(`Failed to fetch ${type} information`);
			}
		}
	}
	return cache[type].data as T;
};

// Fetches detailed CPU usage information and tracks it over time
const fetchCPUInfo = async () => {
	const cpuUsageResult = await osUtils.cpu.usage();
	// node-os-utils v2.x returns MonitorResult<number>
	const cpuUsage = cpuUsageResult.success ? cpuUsageResult.data : 0;
	const cpuCount = os.cpus().length;
	const timeStamp = new Date().toISOString();

	// Store the overall CPU usage and timestamp
	cpuData.push(cpuUsage);
	timeStamps.push(timeStamp);

	// Maintain a fixed size for the data arrays
	if (cpuData.length > MAX_DATA_POINTS) {
		cpuData.shift();
		timeStamps.shift();
	}

	// Get per-core information
	const coreInfo = os.cpus().map((core, index) => {
		const total = Object.values(core.times).reduce((acc, time) => acc + time, 0);
		const idle = core.times.idle;
		const usage = ((total - idle) / total) * 100;

		// Store historical core data
		if (!cpuCoreData[index]) {
			cpuCoreData[index] = [];
		}
		cpuCoreData[index].push(usage);
		if (cpuCoreData[index].length > MAX_DATA_POINTS) {
			cpuCoreData[index].shift();
		}

		return {
			model: core.model,
			speed: core.speed,
			usage,
			times: core.times
		};
	});

	return {
		currentLoad: cpuUsage,
		historicalLoad: {
			usage: cpuData,
			timestamps: timeStamps
		},
		cores: {
			count: cpuCount,
			perCore: coreInfo,
			historicalPerCore: cpuCoreData
		}
	};
};

// Fetches detailed disk usage information for multiple mount points
const fetchDiskInfo = async () => {
	// Get the root drive info
	const rootDiskUsageResult = await osUtils.disk.info();
	// node-os-utils v2.x returns { success, data, timestamp, cached, platform }
	// data is an array of disk objects with nested byte values
	let rootDiskUsage: { totalGb: number; usedGb: number; freeGb: number; usedPercentage: number; freePercentage: number } | undefined;

	if (rootDiskUsageResult.success && 'data' in rootDiskUsageResult && Array.isArray(rootDiskUsageResult.data)) {
		// v2.x format - find the main filesystem
		const diskData =
			rootDiskUsageResult.data.find((d: { filesystem: string }) => d.filesystem.includes('/dev/')) ||
			rootDiskUsageResult.data[1] ||
			rootDiskUsageResult.data[0];

		if (diskData) {
			// Convert v2.x format to expected format
			rootDiskUsage = {
				totalGb: Number.parseFloat((diskData.total.bytes / 1024 / 1024 / 1024).toFixed(2)),
				usedGb: Number.parseFloat((diskData.used.bytes / 1024 / 1024 / 1024).toFixed(2)),
				freeGb: Number.parseFloat((diskData.available.bytes / 1024 / 1024 / 1024).toFixed(2)),
				usedPercentage: Number.parseFloat(diskData.usagePercentage.toFixed(2)),
				freePercentage: Number.parseFloat((100 - diskData.usagePercentage).toFixed(2))
			};
		}
	}

	// Try to get all mount points on Linux/Unix systems
	let allMounts: Array<{
		filesystem: string;
		mountpoint: string;
		totalGb: number;
		usedGb: number;
		freeGb: number;
		usedPercentage: number;
		freePercentage: number;
	}> = [];
	try {
		if (os.platform() !== 'win32') {
			const { stdout } = await execAsync('df -kP | grep -v Filesystem');
			allMounts = stdout
				.trim()
				.split('\n')
				.map((line) => {
					const parts = line.split(/\s+/);
					return {
						filesystem: parts[0],
						mountpoint: parts[5],
						totalGb: Number.parseFloat((Number.parseInt(parts[1], 10) / 1024 / 1024).toFixed(2)),
						usedGb: Number.parseFloat((Number.parseInt(parts[2], 10) / 1024 / 1024).toFixed(2)),
						freeGb: Number.parseFloat((Number.parseInt(parts[3], 10) / 1024 / 1024).toFixed(2)),
						usedPercentage: Number.parseFloat(parts[4].replace('%', '')),
						freePercentage: 100 - Number.parseFloat(parts[4].replace('%', ''))
					};
				});
		} else if (rootDiskUsage) {
			// Windows - fallback to just root disk for now
			allMounts = [
				{
					filesystem: 'C:',
					mountpoint: 'C:',
					totalGb: rootDiskUsage.totalGb,
					usedGb: rootDiskUsage.usedGb,
					freeGb: rootDiskUsage.freeGb,
					usedPercentage: rootDiskUsage.usedPercentage,
					freePercentage: rootDiskUsage.freePercentage
				}
			];
		}
	} catch (error) {
		logger.warn('Failed to get detailed mount points, falling back to root:', error instanceof Error ? error.message : String(error));
		// Fallback to just root disk
		if (rootDiskUsage) {
			allMounts = [
				{
					filesystem: '/',
					mountpoint: '/',
					totalGb: rootDiskUsage.totalGb,
					usedGb: rootDiskUsage.usedGb,
					freeGb: rootDiskUsage.freeGb,
					usedPercentage: rootDiskUsage.usedPercentage,
					freePercentage: rootDiskUsage.freePercentage
				}
			];
		}
	}

	// Get I/O statistics if available (Linux only)
	let diskIO: any = null;
	try {
		if (os.platform() === 'linux') {
			const { stdout } = await execAsync('cat /proc/diskstats');
			const diskstats = stdout.trim().split('\n');

			// Process the most important disk (usually sda or nvme0n1)
			const mainDisk = diskstats.find((line) => line.includes('sda') || line.includes('nvme0n1'));
			if (mainDisk) {
				const parts = mainDisk.trim().split(/\s+/);
				diskIO = {
					device: parts[2],
					reads: Number.parseInt(parts[5], 10),
					writes: Number.parseInt(parts[9], 10),
					readBytes: Number.parseInt(parts[5], 10) * 512, // Assuming 512 byte sectors
					writeBytes: Number.parseInt(parts[9], 10) * 512 // Assuming 512 byte sectors
				};
			}
		}
	} catch (error) {
		logger.warn('Failed to get disk I/O stats:', error instanceof Error ? error.message : String(error));
	}

	return {
		root: rootDiskUsage,
		mounts: allMounts,
		io: diskIO
	};
};

// Fetches detailed memory usage information
const fetchMemoryInfo = async () => {
	const memoryInfoResult = await osUtils.memory.info();
	// node-os-utils v2.x returns { success, data: { total: {bytes}, used: {bytes}, ... }, timestamp, cached, platform }
	let memoryInfo: { totalMemMb: number; usedMemMb: number; freeMemMb: number; usedMemPercentage: number; freeMemPercentage: number } | undefined;

	if (memoryInfoResult.success && 'data' in memoryInfoResult && memoryInfoResult.data) {
		// v2.x format - convert to expected format
		const memData = memoryInfoResult.data;
		memoryInfo = {
			totalMemMb: Number.parseFloat((memData.total.bytes / 1024 / 1024).toFixed(2)),
			usedMemMb: Number.parseFloat((memData.used.bytes / 1024 / 1024).toFixed(2)),
			freeMemMb: Number.parseFloat((memData.free.bytes / 1024 / 1024).toFixed(2)),
			usedMemPercentage: Number.parseFloat(memData.usagePercentage.toFixed(2)),
			freeMemPercentage: Number.parseFloat((100 - memData.usagePercentage).toFixed(2))
		};
	}

	// Get swap information if available
	let swapInfo: any = null;
	try {
		if (os.platform() !== 'win32') {
			const { stdout } = await execAsync('free -b');
			const lines = stdout.trim().split('\n');
			const swapLine = lines.find((line) => line.startsWith('Swap:'));
			if (swapLine) {
				const parts = swapLine.split(/\s+/);
				swapInfo = {
					totalSwapMb: Number.parseFloat((Number.parseInt(parts[1], 10) / 1024 / 1024).toFixed(2)),
					usedSwapMb: Number.parseFloat((Number.parseInt(parts[2], 10) / 1024 / 1024).toFixed(2)),
					freeSwapMb: Number.parseFloat((Number.parseInt(parts[3], 10) / 1024 / 1024).toFixed(2)),
					usedSwapPercentage: Number.parseFloat(((Number.parseInt(parts[2], 10) / Number.parseInt(parts[1], 10)) * 100).toFixed(2)),
					freeSwapPercentage: Number.parseFloat(((Number.parseInt(parts[3], 10) / Number.parseInt(parts[1], 10)) * 100).toFixed(2))
				};
			}
		} else {
			// Windows - use os.totalmem() and os.freemem()
			const { stdout } = await execAsync('wmic pagefile get AllocatedBaseSize, CurrentUsage');
			const lines = stdout.trim().split('\n');
			if (lines.length > 1) {
				const parts = lines[1].trim().split(/\s+/);
				const totalSwap = Number.parseInt(parts[0], 10);
				const usedSwap = Number.parseInt(parts[1], 10);
				swapInfo = {
					totalSwapMb: totalSwap,
					usedSwapMb: usedSwap,
					freeSwapMb: totalSwap - usedSwap,
					usedSwapPercentage: Number.parseFloat(((usedSwap / totalSwap) * 100).toFixed(2)),
					freeSwapPercentage: Number.parseFloat((((totalSwap - usedSwap) / totalSwap) * 100).toFixed(2))
				};
			}
		}
	} catch (error) {
		logger.warn('Failed to get swap info:', error instanceof Error ? error.message : String(error));
	}

	return {
		total: memoryInfo
			? {
					totalMemMb: memoryInfo.totalMemMb,
					usedMemMb: memoryInfo.usedMemMb,
					freeMemMb: memoryInfo.freeMemMb,
					usedMemPercentage: memoryInfo.usedMemPercentage,
					freeMemPercentage: memoryInfo.freeMemPercentage
				}
			: {
					totalMemMb: 0,
					usedMemMb: 0,
					freeMemMb: 0,
					usedMemPercentage: 0,
					freeMemPercentage: 0
				},
		swap: swapInfo,
		// Memory breakdown (if available)
		breakdown: {
			buffers: null,
			cached: null,
			available: null,
			active: null,
			inactive: null
		}
	};
};

// Fetches network usage statistics
const fetchNetworkInfo = async () => {
	const networkStats = await osUtils.network.stats();
	const networkInterfaces = os.networkInterfaces();

	// Process interface information
	const interfaces = Object.entries(networkInterfaces)
		.map(([name, info]) => {
			if (!info) {
				return null;
			}

			return {
				name,
				addresses: info.map((addr) => ({
					address: addr.address,
					netmask: addr.netmask,
					family: addr.family,
					mac: addr.mac,
					internal: addr.internal,
					cidr: addr.cidr
				}))
			};
		})
		.filter(Boolean);

	// Calculate network throughput
	const now = {
		rx: networkStats.rx_bytes || 0,
		tx: networkStats.tx_bytes || 0,
		timestamp: Date.now()
	};

	let throughput = {
		rx: 0,
		tx: 0,
		rxPerSec: 0,
		txPerSec: 0
	};

	if (networkBaseline) {
		const timeDiffSecs = (now.timestamp - networkBaseline.timestamp) / 1000;
		if (timeDiffSecs > 0) {
			throughput = {
				rx: now.rx - networkBaseline.rx,
				tx: now.tx - networkBaseline.tx,
				rxPerSec: (now.rx - networkBaseline.rx) / timeDiffSecs,
				txPerSec: (now.tx - networkBaseline.tx) / timeDiffSecs
			};
		}
	}

	// Update baseline for next calculation
	networkBaseline = now;

	return {
		stats: networkStats,
		interfaces,
		throughput
	};
};

// Fetches process information including top CPU and memory consumers
const fetchProcessInfo = async (): Promise<{
	processes: Array<{
		pid: number;
		name: string;
		cpu: number;
		memory: number;
		rss?: number;
	}>;
}> => {
	let processes: Array<{ pid: number; name: string; cpu: number; memory: number; rss?: number }> = [];

	try {
		if (os.platform() === 'win32') {
			// Windows - use wmic
			const { stdout } = await execAsync('wmic process get ProcessId,Name,WorkingSetSize,UserModeTime,KernelModeTime /format:csv');
			const lines = stdout
				.trim()
				.split('\n')
				.filter((line) => line.length > 0);

			// Process CSV format (skip header)
			if (lines.length > 1) {
				const processData = lines.slice(1).map((line) => {
					const parts = line.split(',');
					const totalTime = (Number.parseInt(parts[4] || '0', 10) + Number.parseInt(parts[3] || '0', 10)) / 10_000_000; // Convert 100ns to seconds
					return {
						pid: Number.parseInt(parts[1] || '0', 10),
						name: parts[2],
						cpu: totalTime,
						memory: Number.parseInt(parts[5] || '0', 10) / (1024 * 1024) // Convert bytes to MB
					};
				});

				// Sort by CPU usage and take top processes
				processes = processData
					.filter((p) => p.pid > 0)
					.sort((a, b) => b.cpu - a.cpu)
					.slice(0, PROCESS_LIMIT);
			}
		} else {
			// Linux/Unix - use ps
			const { stdout } = await execAsync(`ps -eo pid,comm,%cpu,%mem,rss --sort=-%cpu | head -n ${PROCESS_LIMIT + 1}`);
			const lines = stdout.trim().split('\n');

			// Process each line (skip header)
			if (lines.length > 1) {
				processes = lines.slice(1).map((line) => {
					const parts = line.trim().split(/\s+/);
					return {
						pid: Number.parseInt(parts[0], 10),
						name: parts[1],
						cpu: Number.parseFloat(parts[2]),
						memory: Number.parseFloat(parts[3]),
						rss: Number.parseInt(parts[4], 10) / 1024 // Convert KB to MB
					};
				});
			}
		}
	} catch (error) {
		logger.warn('Failed to get process info:', error instanceof Error ? error.message : String(error));
	}

	return { processes };
};

// Collects overall system information including CPU, disk, memory, and OS details.
const getSystemInfo = async (type?: string) => {
	try {
		// If specific type requested, only fetch that info
		if (type === 'cpu') {
			return { cpuInfo: await getCachedOrFresh('cpu', fetchCPUInfo) };
		}
		if (type === 'disk') {
			return { diskInfo: await getCachedOrFresh('disk', fetchDiskInfo) };
		}
		if (type === 'memory') {
			return { memoryInfo: await getCachedOrFresh('memory', fetchMemoryInfo) };
		}
		if (type === 'network') {
			return { networkInfo: await getCachedOrFresh('network', fetchNetworkInfo) };
		}
		if (type === 'process') {
			return { processInfo: await getCachedOrFresh('process', fetchProcessInfo) };
		}

		// For OS info, we don't need to cache as it rarely changes
		if (type === 'os') {
			return {
				osInfo: {
					platform: os.platform(),
					release: os.release(),
					type: os.type(),
					arch: os.arch(),
					hostname: os.hostname(),
					uptime: os.uptime(),
					loadavg: os.loadavg()
				}
			};
		}

		// If no specific type requested or 'all', fetch all info
		return await getCachedOrFresh('all', async () => {
			const [cpuInfo, diskInfo, memoryInfo, networkInfo, processInfo] = await Promise.all([
				fetchCPUInfo(),
				fetchDiskInfo(),
				fetchMemoryInfo(),
				fetchNetworkInfo(),
				fetchProcessInfo()
			]);

			const osInfo = {
				platform: os.platform(),
				release: os.release(),
				type: os.type(),
				arch: os.arch(),
				hostname: os.hostname(),
				uptime: os.uptime(),
				loadavg: os.loadavg()
			};

			return { cpuInfo, diskInfo, memoryInfo, networkInfo, osInfo, processInfo };
		});
	} catch (error) {
		logger.error('Error fetching system info:', error instanceof Error ? error.message : String(error));
		throw new Error('Failed to fetch system information');
	}
};

// Fetches and returns system information including CPU, disk, memory, and OS details.
// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';

// Fetches and returns system information including CPU, disk, memory, and OS details.
export const GET = apiHandler(async ({ url, locals }) => {
	// Authentication is handled by hooks.server.ts
	if (!locals.user) {
		logger.warn('Unauthorized attempt to access system info');
		throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
	}

	// Check if specific type of information is requested
	const type = url.searchParams.get('type') || 'all';

	try {
		// Fetch system information
		const systemInfo = await getSystemInfo(type);

		// Debug logging for memory type
		if (type === 'memory') {
			logger.info('System info memory fetched:', {
				hasMemoryInfo: !!(systemInfo as any).memoryInfo,
				keys: Object.keys(systemInfo)
			});
		}
		logger.info(`System information (${type}) fetched successfully`, {
			userId: locals.user?._id,
			userEmail: locals.user?.email
		});

		// Return the system information as a JSON response
		// using json helper from SvelteKit which sets appropriate headers
		return json(systemInfo, {
			headers: {
				'Cache-Control': 'no-cache, no-store, must-revalidate'
			}
		});
	} catch (error) {
		logger.error('Error fetching system info:', error instanceof Error ? error.message : String(error));
		throw new AppError('Failed to fetch system information', 500, 'SYSTEM_INFO_ERROR');
	}
});
