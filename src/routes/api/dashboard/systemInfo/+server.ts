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

import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import os from 'os';
import osu from 'node-os-utils';
import { exec } from 'child_process';
import { promisify } from 'util';
import { performance } from 'perf_hooks';

// Permissions

// System Logger
import { logger } from '@utils/logger.svelte';

const { cpu, drive, mem, netstat } = osu;
const execAsync = promisify(exec);

// Configuration
const MAX_DATA_POINTS = 100;
const CACHE_DURATION = 1000; // 1 second cache to prevent hammering
const PROCESS_LIMIT = 10; // Number of top processes to return

// Cache storage
type CacheEntry = {
	timestamp: number;
	data: unknown;
};

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
	return cache[type].data;
};

// Fetches detailed CPU usage information and tracks it over time
const fetchCPUInfo = async () => {
	const cpuUsage = await cpu.usage();
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
		if (!cpuCoreData[index]) cpuCoreData[index] = [];
		cpuCoreData[index].push(usage);
		if (cpuCoreData[index].length > MAX_DATA_POINTS) cpuCoreData[index].shift();

		return {
			model: core.model,
			speed: core.speed,
			usage: usage,
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
	const rootDiskUsage = await drive.info('/');

	// Try to get all mount points on Linux/Unix systems
	let allMounts = [];
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
						totalGb: parseFloat((parseInt(parts[1]) / 1024 / 1024).toFixed(2)),
						usedGb: parseFloat((parseInt(parts[2]) / 1024 / 1024).toFixed(2)),
						freeGb: parseFloat((parseInt(parts[3]) / 1024 / 1024).toFixed(2)),
						usedPercentage: parseFloat(parts[4].replace('%', '')),
						freePercentage: 100 - parseFloat(parts[4].replace('%', ''))
					};
				});
		} else {
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

	// Get I/O statistics if available (Linux only)
	let diskIO = null;
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
					reads: parseInt(parts[5]),
					writes: parseInt(parts[9]),
					readBytes: parseInt(parts[5]) * 512, // Assuming 512 byte sectors
					writeBytes: parseInt(parts[9]) * 512 // Assuming 512 byte sectors
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
	const memoryInfo = await mem.info();

	// Get swap information if available
	let swapInfo = null;
	try {
		if (os.platform() !== 'win32') {
			const { stdout } = await execAsync('free -b');
			const lines = stdout.trim().split('\n');
			const swapLine = lines.find((line) => line.startsWith('Swap:'));
			if (swapLine) {
				const parts = swapLine.split(/\s+/);
				swapInfo = {
					totalSwapMb: parseFloat((parseInt(parts[1]) / 1024 / 1024).toFixed(2)),
					usedSwapMb: parseFloat((parseInt(parts[2]) / 1024 / 1024).toFixed(2)),
					freeSwapMb: parseFloat((parseInt(parts[3]) / 1024 / 1024).toFixed(2)),
					usedSwapPercentage: parseFloat(((parseInt(parts[2]) / parseInt(parts[1])) * 100).toFixed(2)),
					freeSwapPercentage: parseFloat(((parseInt(parts[3]) / parseInt(parts[1])) * 100).toFixed(2))
				};
			}
		} else {
			// Windows - use os.totalmem() and os.freemem()
			const { stdout } = await execAsync('wmic pagefile get AllocatedBaseSize, CurrentUsage');
			const lines = stdout.trim().split('\n');
			if (lines.length > 1) {
				const parts = lines[1].trim().split(/\s+/);
				const totalSwap = parseInt(parts[0]);
				const usedSwap = parseInt(parts[1]);
				swapInfo = {
					totalSwapMb: totalSwap,
					usedSwapMb: usedSwap,
					freeSwapMb: totalSwap - usedSwap,
					usedSwapPercentage: parseFloat(((usedSwap / totalSwap) * 100).toFixed(2)),
					freeSwapPercentage: parseFloat((((totalSwap - usedSwap) / totalSwap) * 100).toFixed(2))
				};
			}
		}
	} catch (error) {
		logger.warn('Failed to get swap info:', error instanceof Error ? error.message : String(error));
	}

	return {
		total: {
			totalMemMb: memoryInfo.totalMemMb,
			usedMemMb: memoryInfo.usedMemMb,
			freeMemMb: memoryInfo.freeMemMb,
			usedMemPercentage: memoryInfo.usedMemPercentage,
			freeMemPercentage: memoryInfo.freeMemPercentage
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
	const networkStats = await netstat.stats();
	const networkInterfaces = os.networkInterfaces();

	// Process interface information
	const interfaces = Object.entries(networkInterfaces)
		.map(([name, info]) => {
			if (!info) return null;

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
const fetchProcessInfo = async () => {
	let processes = [];

	try {
		if (os.platform() === 'win32') {
			// Windows - use wmic
			const { stdout } = await execAsync(`wmic process get ProcessId,Name,WorkingSetSize,UserModeTime,KernelModeTime /format:csv`);
			const lines = stdout
				.trim()
				.split('\n')
				.filter((line) => line.length > 0);

			// Process CSV format (skip header)
			if (lines.length > 1) {
				const processData = lines.slice(1).map((line) => {
					const parts = line.split(',');
					const totalTime = (parseInt(parts[4] || '0') + parseInt(parts[3] || '0')) / 10000000; // Convert 100ns to seconds
					return {
						pid: parseInt(parts[1] || '0'),
						name: parts[2],
						cpu: totalTime,
						memory: parseInt(parts[5] || '0') / (1024 * 1024) // Convert bytes to MB
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
						pid: parseInt(parts[0]),
						name: parts[1],
						cpu: parseFloat(parts[2]),
						memory: parseFloat(parts[3]),
						rss: parseInt(parts[4]) / 1024 // Convert KB to MB
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
		if (type === 'cpu') return { cpuInfo: await getCachedOrFresh('cpu', fetchCPUInfo) };
		if (type === 'disk') return { diskInfo: await getCachedOrFresh('disk', fetchDiskInfo) };
		if (type === 'memory') return { memoryInfo: await getCachedOrFresh('memory', fetchMemoryInfo) };
		if (type === 'network') return { networkInfo: await getCachedOrFresh('network', fetchNetworkInfo) };
		if (type === 'process') return { processInfo: await getCachedOrFresh('process', fetchProcessInfo) };

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
export const GET: RequestHandler = async ({ url, locals }) => {
	try {
		// Authentication is handled by hooks.server.ts
		if (!locals.user) {
			logger.warn('Unauthorized attempt to access system info');
			throw error(401, 'Unauthorized');
		}

		// Check if specific type of information is requested
		const type = url.searchParams.get('type') || 'all';

		// Fetch system information
		const systemInfo = await getSystemInfo(type);
		logger.info(`System information (${type}) fetched successfully`, {
			userId: locals.user?._id,
			userEmail: locals.user?.email
		});

		// Return the system information as a JSON response
		return new Response(JSON.stringify(systemInfo), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'no-cache, no-store, must-revalidate'
			}
		});
	} catch (err) {
		const httpError = err as { status?: number; body?: { message?: string }; message?: string };
		const status = httpError.status || 500;
		const message = httpError.body?.message || httpError.message || 'Internal Server Error';
		logger.error('Error fetching system info:', { error: message, status });

		// Return an error response in case of failure
		return new Response(JSON.stringify({ error: message }), {
			status,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
