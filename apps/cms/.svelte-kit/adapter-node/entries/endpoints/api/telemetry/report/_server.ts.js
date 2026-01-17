import { json, error } from '@sveltejs/kit';
import { getPrivateSettingSync } from '../../../../../chunks/settingsService.js';
import { object, optional, pipe, string, number, union, array, maxLength, boolean, safeParse } from 'valibot';
import { createHash, createHmac } from 'node:crypto';
import { l as logger } from '../../../../../chunks/logger.server.js';
const telemetrySchema = object({
	current_version: pipe(string(), maxLength(20)),
	// ✅ Required
	node_version: optional(pipe(string(), maxLength(20))),
	os: optional(pipe(string(), maxLength(20))),
	environment: optional(pipe(string(), maxLength(20))),
	is_ephemeral: optional(boolean()),
	installation_id: optional(pipe(string(), maxLength(64))),
	stable_id: optional(pipe(string(), maxLength(64))),
	db_type: optional(pipe(string(), maxLength(20))),
	location: optional(
		object({
			country: optional(pipe(string(), maxLength(128))),
			country_code: optional(pipe(string(), maxLength(2))),
			region: optional(pipe(string(), maxLength(128))),
			city: optional(pipe(string(), maxLength(128))),
			latitude: optional(number()),
			longitude: optional(number()),
			isp: optional(pipe(string(), maxLength(128))),
			org: optional(pipe(string(), maxLength(128)))
		})
	),
	usage_metrics: optional(
		object({
			users: optional(number()),
			collections: optional(number()),
			roles: optional(number())
		})
	),
	system_info: optional(
		object({
			cpu_count: optional(number()),
			cpu_model: optional(string()),
			total_memory_gb: optional(number()),
			os_type: optional(string()),
			os_release: optional(string()),
			os_arch: optional(string())
		})
	),
	widgets: optional(union([pipe(string(), maxLength(5e3)), array(string())])),
	timestamp: optional(number()),
	signature: optional(string())
});
const responseCache = /* @__PURE__ */ new Map();
const CACHE_TTL = 12 * 60 * 60 * 1e3;
const MAX_CACHE_SIZE = 100;
const MAX_PAYLOAD_SIZE = 1e4;
const REQUEST_TIMEOUT = 5e3;
async function POST({ request }) {
	const telemetryEnabled = await getPrivateSettingSync('SVELTYCMS_TELEMETRY');
	if (telemetryEnabled === false) {
		return json({ status: 'disabled' }, { status: 200 });
	}
	try {
		const contentLength = request.headers.get('content-length');
		if (contentLength && parseInt(contentLength) > MAX_PAYLOAD_SIZE) {
			logger.warn('Telemetry payload too large:', contentLength);
			throw error(413, 'Payload too large');
		}
		const rawData = await request.json();
		const validation = safeParse(telemetrySchema, rawData);
		if (!validation.success) {
			logger.warn('Invalid telemetry payload');
			throw error(400, 'Invalid payload');
		}
		const data = validation.output;
		const currentVersion = data.current_version;
		const cacheKey = `v${currentVersion}`;
		const cached = responseCache.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
			return json(cached.data, {
				headers: { 'X-Cache': 'HIT' }
			});
		}
		const jwtSecret = (await getPrivateSettingSync('JWT_SECRET_KEY')) || 'fallback_secret';
		const installationId = data.installation_id || createHash('sha256').update(jwtSecret).digest('hex');
		const timestamp = data.timestamp || Date.now();
		const current_version = data.current_version;
		const TELEMETRY_SALT = 'sveltycms-telemetry';
		const signature = createHmac('sha256', TELEMETRY_SALT).update(`${installationId}:${current_version}:${timestamp}`).digest('hex');
		const forwardData = {
			...data,
			installation_id: installationId,
			timestamp,
			signature
		};
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
		const telemetryEndpoint = process.env.TELEMETRY_ENDPOINT || 'https://telemetry.sveltycms.com/api/check-update';
		const response = await fetch(telemetryEndpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'User-Agent': 'SveltyCMS-Telemetry/1.0'
			},
			body: JSON.stringify(forwardData),
			signal: controller.signal
		});
		clearTimeout(timeoutId);
		if (!response.ok) {
			logger.warn(`Telemetry upstream failed: ${response.status}`);
			throw new Error('Telemetry server unreachable');
		}
		const result = await response.json();
		if (typeof result !== 'object' || result === null) {
			throw new Error('Invalid upstream response');
		}
		responseCache.set(cacheKey, {
			data: result,
			timestamp: Date.now()
		});
		if (responseCache.size > MAX_CACHE_SIZE) {
			const oldestKey = Array.from(responseCache.keys())[0];
			responseCache.delete(oldestKey);
		}
		return json(result, {
			headers: { 'X-Cache': 'MISS' }
		});
	} catch (err) {
		if (err instanceof Error) {
			if (err.name === 'AbortError') {
				logger.warn('Telemetry request timeout');
			} else {
				logger.error(`Telemetry error: ${err.message}`);
			}
		}
		return json({ status: 'error' }, { status: 200 });
	}
}
export { POST };
//# sourceMappingURL=_server.ts.js.map
