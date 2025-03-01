import { processModule } from '@root/src/content/utils';
import type { PageLoad } from './$types';

interface LoadData {
	collection: {
		module: string;
		[key: string]: unknown;
	};
}

export const load: PageLoad = async ({ data }: { data: LoadData }) => {
	const selectedCollection = await processModule(data.collection.module);
	console.log('selectedCollection', selectedCollection, data);

	if (!selectedCollection || !selectedCollection?.schema) return;

	const collectionData = Object.assign({}, data.collection);
	delete collectionData.module;

	const collection: Record<string, unknown> = {
		...selectedCollection?.schema,
		...collectionData
	};

	return {
		...data,
		collection
	};
};
