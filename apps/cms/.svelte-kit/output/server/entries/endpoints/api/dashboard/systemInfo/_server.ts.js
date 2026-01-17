import { error } from '@sveltejs/kit';
import os from 'os';
import { createOSUtils } from 'node-os-utils';
import { exec } from 'child_process';
import { promisify } from 'util';
import { performance } from 'perf_hooks';
import { l as logger } from '../../../../../chunks/logger.server.js';
const osUtils = createOSUtils();
const execAsync = promisify(exec);
const MAX_DATA_POINTS = 100;
const CACHE_DURATION = 1e3;
const PROCESS_LIMIT = 10;
const cache = {
	cpu: { timestamp: 0, data: null },
	disk: { timestamp: 0, data: null },
	memory: { timestamp: 0, data: null },
	network: { timestamp: 0, data: null },
	os: { timestamp: 0, data: null },
	process: { timestamp: 0, data: null },
	all: { timestamp: 0, data: null }
};
const cpuData = [];
const cpuCoreData = [];
const timeStamps = [];
let networkBaseline = null;
const initCoreDatas = () => {
	const cpuCount = os.cpus().length;
	for (let i = 0; i < cpuCount; i++) {
		cpuCoreData[i] = [];
	}
};
initCoreDatas();
const isStale = (type) => {
	const now = performance.now();
	return now - (cache[type]?.timestamp || 0) > CACHE_DURATION;
};
const getCachedOrFresh = async (type, fetchFunction) => {
	if (isStale(type)) {
		try {
			const data = await fetchFunction();
			cache[type] = { timestamp: performance.now(), data };
		} catch (error2) {
			logger.error(`Error fetching ${type} info:`, error2 instanceof Error ? error2.message : String(error2));
			if (!cache[type]?.data) {
				throw new Error(`Failed to fetch ${type} information`);
			}
		}
	}
	return cache[type].data;
};
const fetchCPUInfo = async () => {
	const cpuUsageResult = await osUtils.cpu.usage();
	const cpuUsage = cpuUsageResult.success ? cpuUsageResult.data : 0;
	const cpuCount = os.cpus().length;
	const timeStamp = /* @__PURE__ */ new Date().toISOString();
	cpuData.push(cpuUsage);
	timeStamps.push(timeStamp);
	if (cpuData.length > MAX_DATA_POINTS) {
		cpuData.shift();
		timeStamps.shift();
	}
	const coreInfo = os.cpus().map((core, index) => {
		const total = Object.values(core.times).reduce((acc, time) => acc + time, 0);
		const idle = core.times.idle;
		const usage = ((total - idle) / total) * 100;
		if (!cpuCoreData[index]) cpuCoreData[index] = [];
		cpuCoreData[index].push(usage);
		if (cpuCoreData[index].length > MAX_DATA_POINTS) cpuCoreData[index].shift();
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
const fetchDiskInfo = async () => {
	const rootDiskUsageResult = await osUtils.disk.info();
	let rootDiskUsage;
	if (rootDiskUsageResult.success && 'data' in rootDiskUsageResult && Array.isArray(rootDiskUsageResult.data)) {
		const diskData =
			rootDiskUsageResult.data.find((d) => d.filesystem.includes('/dev/')) || rootDiskUsageResult.data[1] || rootDiskUsageResult.data[0];
		if (diskData) {
			rootDiskUsage = {
				totalGb: parseFloat((diskData.total.bytes / 1024 / 1024 / 1024).toFixed(2)),
				usedGb: parseFloat((diskData.used.bytes / 1024 / 1024 / 1024).toFixed(2)),
				freeGb: parseFloat((diskData.available.bytes / 1024 / 1024 / 1024).toFixed(2)),
				usedPercentage: parseFloat(diskData.usagePercentage.toFixed(2)),
				freePercentage: parseFloat((100 - diskData.usagePercentage).toFixed(2))
			};
		}
	}
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
		} else if (rootDiskUsage) {
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
	} catch (error2) {
		logger.warn('Failed to get detailed mount points, falling back to root:', error2 instanceof Error ? error2.message : String(error2));
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
	let diskIO = null;
	try {
		if (os.platform() === 'linux') {
			const { stdout } = await execAsync('cat /proc/diskstats');
			const diskstats = stdout.trim().split('\n');
			const mainDisk = diskstats.find((line) => line.includes('sda') || line.includes('nvme0n1'));
			if (mainDisk) {
				const parts = mainDisk.trim().split(/\s+/);
				diskIO = {
					device: parts[2],
					reads: parseInt(parts[5]),
					writes: parseInt(parts[9]),
					readBytes: parseInt(parts[5]) * 512,
					// Assuming 512 byte sectors
					writeBytes: parseInt(parts[9]) * 512
					// Assuming 512 byte sectors
				};
			}
		}
	} catch (error2) {
		logger.warn('Failed to get disk I/O stats:', error2 instanceof Error ? error2.message : String(error2));
	}
	return {
		root: rootDiskUsage,
		mounts: allMounts,
		io: diskIO
	};
};
const fetchMemoryInfo = async () => {
	const memoryInfoResult = await osUtils.memory.info();
	let memoryInfo;
	if (memoryInfoResult.success && 'data' in memoryInfoResult && memoryInfoResult.data) {
		const memData = memoryInfoResult.data;
		memoryInfo = {
			totalMemMb: parseFloat((memData.total.bytes / 1024 / 1024).toFixed(2)),
			usedMemMb: parseFloat((memData.used.bytes / 1024 / 1024).toFixed(2)),
			freeMemMb: parseFloat((memData.free.bytes / 1024 / 1024).toFixed(2)),
			usedMemPercentage: parseFloat(memData.usagePercentage.toFixed(2)),
			freeMemPercentage: parseFloat((100 - memData.usagePercentage).toFixed(2))
		};
	}
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
	} catch (error2) {
		logger.warn('Failed to get swap info:', error2 instanceof Error ? error2.message : String(error2));
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
const fetchNetworkInfo = async () => {
	const networkStats = await osUtils.network.stats();
	const networkInterfaces = os.networkInterfaces();
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
		const timeDiffSecs = (now.timestamp - networkBaseline.timestamp) / 1e3;
		if (timeDiffSecs > 0) {
			throughput = {
				rx: now.rx - networkBaseline.rx,
				tx: now.tx - networkBaseline.tx,
				rxPerSec: (now.rx - networkBaseline.rx) / timeDiffSecs,
				txPerSec: (now.tx - networkBaseline.tx) / timeDiffSecs
			};
		}
	}
	networkBaseline = now;
	return {
		stats: networkStats,
		interfaces,
		throughput
	};
};
const fetchProcessInfo = async () => {
	let processes = [];
	try {
		if (os.platform() === 'win32') {
			const { stdout } = await execAsync(`wmic process get ProcessId,Name,WorkingSetSize,UserModeTime,KernelModeTime /format:csv`);
			const lines = stdout
				.trim()
				.split('\n')
				.filter((line) => line.length > 0);
			if (lines.length > 1) {
				const processData = lines.slice(1).map((line) => {
					const parts = line.split(',');
					const totalTime = (parseInt(parts[4] || '0') + parseInt(parts[3] || '0')) / 1e7;
					return {
						pid: parseInt(parts[1] || '0'),
						name: parts[2],
						cpu: totalTime,
						memory: parseInt(parts[5] || '0') / (1024 * 1024)
						// Convert bytes to MB
					};
				});
				processes = processData
					.filter((p) => p.pid > 0)
					.sort((a, b) => b.cpu - a.cpu)
					.slice(0, PROCESS_LIMIT);
			}
		} else {
			const { stdout } = await execAsync(`ps -eo pid,comm,%cpu,%mem,rss --sort=-%cpu | head -n ${PROCESS_LIMIT + 1}`);
			const lines = stdout.trim().split('\n');
			if (lines.length > 1) {
				processes = lines.slice(1).map((line) => {
					const parts = line.trim().split(/\s+/);
					return {
						pid: parseInt(parts[0]),
						name: parts[1],
						cpu: parseFloat(parts[2]),
						memory: parseFloat(parts[3]),
						rss: parseInt(parts[4]) / 1024
						// Convert KB to MB
					};
				});
			}
		}
	} catch (error2) {
		logger.warn('Failed to get process info:', error2 instanceof Error ? error2.message : String(error2));
	}
	return { processes };
};
const getSystemInfo = async (type) => {
	try {
		if (type === 'cpu') return { cpuInfo: await getCachedOrFresh('cpu', fetchCPUInfo) };
		if (type === 'disk') return { diskInfo: await getCachedOrFresh('disk', fetchDiskInfo) };
		if (type === 'memory') return { memoryInfo: await getCachedOrFresh('memory', fetchMemoryInfo) };
		if (type === 'network') return { networkInfo: await getCachedOrFresh('network', fetchNetworkInfo) };
		if (type === 'process') return { processInfo: await getCachedOrFresh('process', fetchProcessInfo) };
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
	} catch (error2) {
		logger.error('Error fetching system info:', error2 instanceof Error ? error2.message : String(error2));
		throw new Error('Failed to fetch system information');
	}
};
const GET = async ({ url, locals }) => {
	try {
		if (!locals.user) {
			logger.warn('Unauthorized attempt to access system info');
			throw error(401, 'Unauthorized');
		}
		const type = url.searchParams.get('type') || 'all';
		const systemInfo = await getSystemInfo(type);
		if (type === 'memory') {
			logger.info('System info memory fetched:', {
				hasMemoryInfo: !!systemInfo.memoryInfo,
				keys: Object.keys(systemInfo)
			});
		}
		logger.info(`System information (${type}) fetched successfully`, {
			userId: locals.user?._id,
			userEmail: locals.user?.email
		});
		return new Response(JSON.stringify(systemInfo), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'no-cache, no-store, must-revalidate'
			}
		});
	} catch (err) {
		const httpError = err;
		const status = httpError.status || 500;
		const message = httpError.body?.message || httpError.message || 'Internal Server Error';
		logger.error('Error fetching system info:', { error: message, status });
		return new Response(JSON.stringify({ error: message }), {
			status,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
export { GET };
//# sourceMappingURL=_server.ts.js.map
