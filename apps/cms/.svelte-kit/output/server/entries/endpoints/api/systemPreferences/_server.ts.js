import { d as dbAdapter } from '../../../../chunks/db.js';
import { json } from '@sveltejs/kit';
import { l as logger } from '../../../../chunks/logger.server.js';
import * as v from 'valibot';
const PreferenceSchema = v.object({
	key: v.pipe(v.string(), v.minLength(1, 'Preference key cannot be empty.')),
	value: v.any()
});
const SetSinglePreferenceSchema = PreferenceSchema;
const SetMultiplePreferencesSchema = v.array(PreferenceSchema);
const GET = async ({ locals, url }) => {
	if (!locals.user) {
		logger.warn('Unauthorized attempt to load system preferences');
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	const userId = locals.user._id;
	const singleKey = url.searchParams.get('key');
	const multipleKeys = url.searchParams.getAll('keys[]');
	try {
		if (multipleKeys.length > 0) {
			if (!dbAdapter) {
				throw new Error('Database adapter not available');
			}
			const result = await dbAdapter.systemPreferences.getMany(multipleKeys, 'user', userId);
			if (!result.success) {
				throw new Error(result.message);
			}
			return json(result.data);
		}
		if (singleKey) {
			if (!dbAdapter) {
				throw new Error('Database adapter not available');
			}
			const result = await dbAdapter.systemPreferences.get(singleKey, 'user', userId);
			if (!result.success) {
				if (singleKey.startsWith('dashboard.layout.')) {
					return json({ id: singleKey, name: 'Default', preferences: [] });
				}
				return json({ value: null }, { status: 404 });
			}
			return json(result.data);
		}
		return json({ error: "Invalid request. Provide 'key' or 'keys[]' query parameter." }, { status: 400 });
	} catch (e) {
		const errorMessage = e instanceof Error ? e.message : 'Unknown error';
		logger.error(`Failed to load preferences for user ${userId}: ${errorMessage}`, e);
		return json({ error: 'Failed to load preferences' }, { status: 500 });
	}
};
const POST = async ({ request, locals }) => {
	if (!locals.user) {
		logger.warn('Unauthorized attempt to save system preferences');
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	const data = await request.json();
	const userId = locals.user._id;
	try {
		const singleResult = v.safeParse(SetSinglePreferenceSchema, data);
		if (singleResult.success) {
			if (!dbAdapter) {
				throw new Error('Database adapter not available');
			}
			const { key, value } = singleResult.output;
			const result = await dbAdapter.systemPreferences.set(key, value, 'user', userId);
			if (!result.success) throw new Error(result.message);
			return json({ success: true, message: `Preference '${key}' saved.` }, { status: 200 });
		}
		const multipleResult = v.safeParse(SetMultiplePreferencesSchema, data);
		if (multipleResult.success) {
			if (!dbAdapter) {
				throw new Error('Database adapter not available');
			}
			const preferencesToSet = multipleResult.output.map((p) => ({ ...p, scope: 'user', userId }));
			const result = await dbAdapter.systemPreferences.setMany(preferencesToSet);
			if (!result.success) throw new Error(result.message);
			return json({ success: true, message: `${preferencesToSet.length} preferences saved.` }, { status: 200 });
		}
		const issues = singleResult.issues || multipleResult.issues;
		return json({ error: 'Invalid request data.', issues }, { status: 400 });
	} catch (e) {
		const errorMessage = e instanceof Error ? e.message : 'Unknown error';
		logger.error(`Failed to save preferences for user ${userId}: ${errorMessage}`, e);
		return json({ error: 'Failed to save preferences' }, { status: 500 });
	}
};
const DELETE = async ({ locals, url }) => {
	if (!locals.user) {
		logger.warn('Unauthorized attempt to delete a system preference');
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	const key = url.searchParams.get('key');
	if (!key) {
		return json({ error: "Missing 'key' query parameter." }, { status: 400 });
	}
	const userId = locals.user._id;
	try {
		if (!dbAdapter) {
			throw new Error('Database adapter not available');
		}
		const result = await dbAdapter.systemPreferences.delete(key, 'user', userId);
		if (!result.success) {
			logger.warn(`Attempted to delete non-existent preference key '${key}' for user ${userId}`);
		}
		return json({ success: true, message: `Preference '${key}' deleted.` }, { status: 200 });
	} catch (e) {
		const errorMessage = e instanceof Error ? e.message : 'Unknown error';
		logger.error(`Failed to delete preference '${key}' for user ${userId}: ${errorMessage}`, e);
		return json({ error: 'Failed to delete preference' }, { status: 500 });
	}
};
export { DELETE, GET, POST };
//# sourceMappingURL=_server.ts.js.map
