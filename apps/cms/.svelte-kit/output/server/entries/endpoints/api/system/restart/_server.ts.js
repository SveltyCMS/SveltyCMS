import { error, json } from '@sveltejs/kit';
import { s as setRestartNeeded } from '../../../../../chunks/restartRequired.js';
import { promises } from 'fs';
import path from 'path';
const POST = async ({ locals }) => {
	if (!locals.user || locals.user.role !== 'admin') {
		throw error(403, 'Insufficient permissions');
	}
	try {
		await promises.writeFile(path.join(process.cwd(), 'restart.txt'), /* @__PURE__ */ new Date().toISOString());
		setRestartNeeded(false);
		return json({ success: true, message: 'Server restart initiated.' });
	} catch {
		return json({ success: false, error: 'Failed to initiate restart.' }, { status: 500 });
	}
};
export { POST };
//# sourceMappingURL=_server.ts.js.map
