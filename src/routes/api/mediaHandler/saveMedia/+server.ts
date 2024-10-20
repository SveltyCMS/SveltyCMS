import { logger } from '@src/utils/logger';
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { MediaService } from '@src/utils/media/MediaService';
import { dbAdapter } from '@src/databases/db';

export const POST: RequestHandler = async ({ request, locals }) => {
	const formData = await request.formData();
	const { user, permissions } = locals;

	try {
		if (!dbAdapter) {
			return json({ success: false, error: "dbAdapter isn't initialized" }, { status: 424 });
		}

		if (!user?._id || !user?.role) {
			return json({ success: false, error: 'User is unauthorized' }, { status: 400 });
		}

		const files = formData.getAll('files') as File[];
		for (const file of files) {
			// await uploadFile(file);
			const mediaService = new MediaService(dbAdapter);

			await mediaService.saveMedia(file, user._id, {
				userId: user._id,
				roleId: user.role,
				permissions: permissions || []
			});
		}
		return json({ success: true }, { status: 200 });
	} catch (e: any) {
		logger.error(`Error on POST request: ${e}`);
		return json({ success: false, error: e?.message }, { status: 500 });
	}
};
