import { json } from '@sveltejs/kit';
import '../../../../../chunks/state.js';
import '../../../../../chunks/logger.js';
import { g as getHealthCheckReport } from '../../../../../chunks/reporting.js';
const GET = async () => {
	try {
		const healthReport = getHealthCheckReport();
		const statusCode = healthReport.overallStatus === 'READY' || healthReport.overallStatus === 'DEGRADED' ? 200 : 503;
		return json(healthReport, { status: statusCode });
	} catch (error) {
		return json(
			{
				overallStatus: 'FAILED',
				timestamp: Date.now(),
				uptime: 0,
				components: {},
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 503 }
		);
	}
};
export { GET };
//# sourceMappingURL=_server.ts.js.map
