import fs from 'node:fs';
import path from 'node:path';
let setupStatus = null;
let setupStatusCheckedDb = false;
function isSetupComplete() {
	if (setupStatus !== null) {
		return setupStatus;
	}
	try {
		const configFileName = process.env.TEST_MODE ? 'private.test.ts' : 'private.ts';
		let workspaceRoot = process.cwd();
		if (
			workspaceRoot.endsWith('apps/setup') ||
			workspaceRoot.endsWith('apps/setup/') ||
			workspaceRoot.endsWith('apps/cms') ||
			workspaceRoot.endsWith('apps/cms/')
		) {
			workspaceRoot = path.resolve(workspaceRoot, '../..');
		}
		const privateConfigPath = path.join(workspaceRoot, 'config', configFileName);
		if (!fs.existsSync(privateConfigPath)) {
			setupStatus = false;
			return setupStatus;
		}
		const configContent = fs.readFileSync(privateConfigPath, 'utf8');
		const hasJwtSecret = !/JWT_SECRET_KEY[:=]\s*(""|''|``)/.test(configContent);
		const hasDbHost = !/DB_HOST[:=]\s*(""|''|``)/.test(configContent);
		const hasDbName = !/DB_NAME[:=]\s*(""|''|``)/.test(configContent);
		setupStatus = hasJwtSecret && hasDbHost && hasDbName;
		return setupStatus;
	} catch (error) {
		console.error(`[SveltyCMS] ❌ Error during setup check:`, error);
		setupStatus = false;
		return setupStatus;
	}
}
async function isSetupCompleteAsync() {
	if (!isSetupComplete()) {
		return false;
	}
	if (setupStatusCheckedDb) {
		return setupStatus ?? false;
	}
	try {
		const db = await import('./db.js').then((n) => n.e);
		const dbAdapter = db.dbAdapter;
		if (!dbAdapter || !dbAdapter.auth) {
			if (process.env.NODE_ENV === 'development') {
				console.log('[setupCheck] Database adapter not ready yet');
			}
			return false;
		}
		const result = await dbAdapter.auth.getAllUsers({ limit: 1 });
		const hasUsers = result.success && result.data && result.data.length > 0;
		setupStatus = hasUsers;
		setupStatusCheckedDb = true;
		return hasUsers;
	} catch (error) {
		console.error(`[SveltyCMS] ❌ Database validation failed during setup check:`, error);
		return false;
	}
}
export { isSetupComplete, isSetupCompleteAsync };
//# sourceMappingURL=setupCheck.js.map
