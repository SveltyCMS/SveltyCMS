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

		// You might want to limit the size of the arrays to avoid using too much memory
		if (cpuData.length > 100) {
			cpuData.shift();
			timeStamps.shift();
		}

		//console.log('CPU Info:', cpuUsage);
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
		//console.log('Disk Info:', diskUsage);
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
		//console.log('Memory Info:', memoryInfo);
		return memoryInfo;
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

	//console.log('OS Info:', osInfo);

	return {
		cpuInfo,
		diskInfo,
		memoryInfo,
		osInfo
	};
};

export async function GET() {
	try {
		const systemInfo = await getSystemInfo();
		//console.log('System Info:', systemInfo);

		return new Response(JSON.stringify(systemInfo), {
			status: 200,
			headers: {
				'Content-Type': 'application/json'
			}
		});
	} catch (error) {
		console.error('Error fetching system info:', error);

		return new Response('{ error: "Internal Server Error" }', {
			status: 500,
			headers: {
				'Content-Type': 'application/json'
			}
		});
	}
}
