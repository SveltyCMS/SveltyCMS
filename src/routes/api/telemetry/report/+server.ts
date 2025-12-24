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
import { json, error } from '@sveltejs/kit';
import { getPrivateSetting } from '@src/services/settingsService';
import { object, string, optional, safeParse, maxLength, pipe, boolean, number, union, array, any } from 'valibot';
import { createHash, createHmac } from 'node:crypto';
import type { RequestEvent } from './$types';

// Telemetry payload validation schema
const telemetrySchema = object({
	current_version: pipe(string(), maxLength(20)), // ✅ Required
	node_version: optional(pipe(string(), maxLength(20))),
	os: optional(pipe(string(), maxLength(20))),
	environment: optional(pipe(string(), maxLength(20))),
	is_ephemeral: optional(pipe(boolean())),
	installation_id: optional(pipe(string(), maxLength(64))),
	stable_id: optional(pipe(string(), maxLength(64))),
	db_type: optional(pipe(string(), maxLength(20))),
	location: optional(
		object({
			country: optional(pipe(string(), maxLength(128))),
			country_code: optional(pipe(string(), maxLength(2))),
			region: optional(pipe(string(), maxLength(128))),
			city: optional(pipe(string(), maxLength(128))),
			latitude: optional(pipe(number())),
			longitude: optional(pipe(number())),
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

// Response cache with TTL (aligned with cache-system.mdx)
// Category: API - Default TTL: 15 minutes for external API responses
const responseCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes (API category TTL per cache-system.mdx)
const MAX_CACHE_SIZE = 100;
const MAX_PAYLOAD_SIZE = 10000; // 10KB
const REQUEST_TIMEOUT = 5000; // 5 seconds

// NOTE: Rate limiting handled by handleRateLimit middleware (server-hooks.mdx)
// API routes get 500 req/min per IP, 200 req/min per IP+UA

export async function POST({ request }: RequestEvent) {
	// 1. Check telemetry setting
	const telemetryEnabled = await getPrivateSetting('SVELTYCMS_TELEMETRY');

	if (telemetryEnabled === false) {
		return json({ status: 'disabled' }, { status: 200 });
	}

	try {
		// 2. Payload size limit check (prevent DoS)
		const contentLength = request.headers.get('content-length');
		if (contentLength && parseInt(contentLength) > MAX_PAYLOAD_SIZE) {
			console.warn('Telemetry payload too large:', contentLength);
			throw error(413, 'Payload too large');
		}

		// 3. Parse and validate input
		const rawData = await request.json();
		const validation = safeParse(telemetrySchema, rawData);

		if (!validation.success) {
			console.warn('Invalid telemetry payload:', validation.issues);
			throw error(400, 'Invalid payload');
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
		const jwtSecret = (await getPrivateSetting('JWT_SECRET_KEY')) || 'fallback_secret';
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
			console.warn('Telemetry upstream failed:', response.status);
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
				console.warn('Telemetry request timeout');
			} else {
				console.error('Telemetry error:', err.message);
			}
		}
		return json({ status: 'error' }, { status: 200 });
	}
}
