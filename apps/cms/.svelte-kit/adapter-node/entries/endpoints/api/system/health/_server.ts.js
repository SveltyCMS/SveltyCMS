import { json } from '@sveltejs/kit';
import '../../../../../chunks/state.js';
import '../../../../../chunks/logger.js';
import { g as getHealthCheckReport } from '../../../../../chunks/reporting.js';
const GET = async () => {
	try {
		const healthReport = getHealthCheckReport();
		const httpStatus = healthReport.overallStatus === 'READY' ? 200 : healthReport.overallStatus === 'DEGRADED' ? 200 : 503;
		return json(
			{
				success: healthReport.overallStatus === 'READY',
				...healthReport
			},
			{ status: httpStatus }
		);
	} catch (error) {
		return json(
			{
				success: false,
				overallStatus: 'FAILED',
				error: error instanceof Error ? error.message : 'Health check failed',
				timestamp: Date.now()
			},
			{ status: 500 }
		);
	}
};
export { GET };
//# sourceMappingURL=_server.ts.js.map
