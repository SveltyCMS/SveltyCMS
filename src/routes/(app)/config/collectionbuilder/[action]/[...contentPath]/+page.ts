import { processModule } from '@root/src/content/utils';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, data }) => {
	if (params.action === 'new') {
		return data;
	}

	const selectedCollection = await processModule(data.collection?.module as string);

	if (!selectedCollection || !selectedCollection?.schema) return;
	// console.log('selectedCollection', selectedCollection, page.params.collection);

	const collectionData = Object.fromEntries(Object.entries(data.collection).filter(([key]) => key !== 'module'));

	const collection = {
		...selectedCollection?.schema,
		...collectionData
	};

	return {
		...data,
		collection
	};
};
