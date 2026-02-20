/*
 * @files api/telemetry/report/+server.ts
 * @description Telemetry Report Proxy
 *
 * ### Features
 * - Admin/Guest Access
 * - Forward to telemetry.sveltycms.com
 *
 * ### Security
 * - Input validation with Valibot schema
 * - Payload size limits (10KB max)
 * - Request timeout protection (5s)
 * - Server-side data enrichment
 * - Fail silently - telemetry should never break the app
 *
 * ### Performance
 * - Response caching (12h TTL per version)
 * - LRU cache eviction (max 100 entries)
 */

import { createHash, createHmac } from 'node:crypto';
import { getPrivateSettingSync } from '@src/services/settings-service';
import { json } from '@sveltejs/kit';
import { logger } from '@utils/logger.server';
import { array, boolean, maxLength, number, object, optional, pipe, safeParse, string, union } from 'valibot';

// Telemetry payload validation schema
const telemetrySchema = object({
	current_version: pipe(string(), maxLength(20)), // ✅ Required
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
	widgets: optional(union([pipe(string(), maxLength(5000)), array(string())])),
	timestamp: optional(number()),
	signature: optional(string())
});

// Response cache with TTL
// Default TTL: 12 hours (Ecology Standard)
const responseCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours
const MAX_CACHE_SIZE = 100;
const MAX_PAYLOAD_SIZE = 10_000; // 10KB
const REQUEST_TIMEOUT = 5000; // 5 seconds

// Unified Error Handling
import { apiHandler } from '@utils/api-handler';

// ... (schema definition)

export const POST = apiHandler(async ({ request }) => {
	// 0. Strict Test Mode Check (Environment Variables)
	if (process.env.TEST_MODE === 'true' || process.env.CI === 'true' || process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') {
		return json({ status: 'test_mode' }, { status: 200 });
	}

	// 1. Check telemetry setting
	const telemetryEnabled = await getPrivateSettingSync('SVELTYCMS_TELEMETRY');

	if (telemetryEnabled === false) {
		return json({ status: 'disabled' }, { status: 200 });
	}

	try {
		// 2. Payload size limit check (prevent DoS)
		const contentLength = request.headers.get('content-length');
		if (contentLength && Number.parseInt(contentLength, 10) > MAX_PAYLOAD_SIZE) {
			logger.warn('Telemetry payload too large:', contentLength);
			// Fail silently
			return json({ status: 'error' }, { status: 200 });
		}

		// 3. Parse and validate input
		const rawData = await request.json();
		const validation = safeParse(telemetrySchema, rawData);

		if (!validation.success) {
			logger.warn('Invalid telemetry payload');
			// Fail silently
			return json({ status: 'error' }, { status: 200 });
		}

		const data = validation.output;
		const currentVersion = data.current_version;

		// 4. Check cache first (based on version)
		const cacheKey = `v${currentVersion}`;
		const cached = responseCache.get(cacheKey);

		if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
			return json(cached.data, {
				headers: { 'X-Cache': 'HIT' }
			});
		}

		// 5. Build forwarding payload with HMAC signature
		const jwtSecret = (await getPrivateSettingSync('JWT_SECRET_KEY')) || 'fallback_secret';
		const installationId = data.installation_id || createHash('sha256').update(jwtSecret).digest('hex');
		const timestamp = data.timestamp || Date.now();

		const current_version = data.current_version;

		// Recompute signature to ensure authenticity
		const TELEMETRY_SALT = 'sveltycms-telemetry';
		const signature = createHmac('sha256', TELEMETRY_SALT).update(`${installationId}:${current_version}:${timestamp}`).digest('hex');

		const forwardData = {
			...data,
			installation_id: installationId,
			timestamp,
			signature
		};

		// 6. Timeout protection (prevent hanging)
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

		// 7. Validate response (don't trust upstream)
		if (typeof result !== 'object' || result === null) {
			throw new Error('Invalid upstream response');
		}

		// 8. Cache successful response
		responseCache.set(cacheKey, {
			data: result,
			timestamp: Date.now()
		});

		// 9. LRU eviction (limit cache size)
		if (responseCache.size > MAX_CACHE_SIZE) {
			const oldestKey = Array.from(responseCache.keys())[0];
			responseCache.delete(oldestKey);
		}

		return json(result, {
			headers: { 'X-Cache': 'MISS' }
		});
	} catch (err) {
		// Fail silently but log for monitoring
		if (err instanceof Error) {
			if (err.name === 'AbortError') {
				logger.warn('Telemetry request timeout');
			} else {
				logger.error(`Telemetry error: ${err.message}`);
			}
		}
		// Return 200 OK even on error to avoid breaking client
		return json({ status: 'error' }, { status: 200 });
	}
});
