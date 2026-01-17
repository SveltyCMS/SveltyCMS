import { g as getFieldName } from './utils.js';
import { widgets } from './widgetStore.svelte.js';
import { l as logger } from './logger.server.js';
async function modifyRequest({ data, fields, collection, user, type, tenantId }) {
	const start = performance.now();
	try {
		logger.trace(`Starting modifyRequest for type: ${type}, user: ${user._id}, collection: ${collection.id ?? 'unknown'}, tenant: ${tenantId}`);
		for (const field of fields) {
			const fieldStart = performance.now();
			const widget = widgets.widgetFunctions[field.widget.Name];
			const fieldName = getFieldName(field);
			logger.trace(`Processing field: ${fieldName}, widget: ${field.widget.Name}`);
			const modifyFn = widget?.modifyRequest;
			const modifyBatchFn = widget?.modifyRequestBatch;
			if (modifyBatchFn && typeof modifyBatchFn === 'function') {
				logger.trace(`Processing batch for field: ${fieldName}, widget: ${field.widget.Name}`);
				try {
					const batchStart = performance.now();
					const batchResults = await modifyBatchFn({
						data,
						collection,
						field,
						user,
						type,
						tenantId
					});
					if (Array.isArray(batchResults) && batchResults.length === data.length) {
						data = batchResults;
					} else {
						logger.warn(`Batch processing for ${fieldName} returned invalid results length. Expected ${data.length}, got ${batchResults?.length}`);
					}
					const batchDuration = performance.now() - batchStart;
					logger.debug(`Batch processing for ${fieldName} completed in ${batchDuration.toFixed(2)}ms`);
				} catch (batchError) {
					const errorMessage = batchError instanceof Error ? batchError.message : 'Unknown batch error';
					logger.error(`Batch widget error for field ${fieldName}: ${errorMessage}`);
				}
			} else if (modifyFn !== void 0 && modifyFn !== null && typeof modifyFn === 'function') {
				data = await Promise.all(
					data.map(async (entry, index) => {
						try {
							const entryCopy = { ...entry };
							const dataAccessor = {
								get() {
									return entryCopy[fieldName];
								},
								update(newData) {
									entryCopy[fieldName] = newData;
								}
							};
							try {
								const modify = modifyFn;
								await modify({
									collection,
									field,
									data: dataAccessor,
									user,
									type,
									tenantId,
									id: entryCopy._id,
									meta_data: entryCopy.meta_data
								});
							} catch (widgetError) {
								const errorMessage = widgetError instanceof Error ? widgetError.message : 'Unknown widget error';
								const errorStack = widgetError instanceof Error ? widgetError.stack : '';
								logger.error(`Widget error for field ${fieldName}, entry ${index + 1}: ${errorMessage}`, { stack: errorStack });
							}
							return entryCopy;
						} catch (error) {
							const errorMessage = error instanceof Error ? error.message : 'Unknown error';
							const errorStack = error instanceof Error ? error.stack : '';
							logger.error(`Error processing entry ${index + 1}: ${errorMessage}`, {
								stack: errorStack
							});
							return entry;
						}
					})
				);
				const fieldDuration = performance.now() - fieldStart;
				logger.trace(`Field ${fieldName} processed in ${fieldDuration.toFixed(2)}ms`);
			} else {
			}
		}
		const duration = performance.now() - start;
		logger.info(`ModifyRequest completed in ${duration.toFixed(2)}ms for ${data.length} entries`);
		return data;
	} catch (error) {
		const duration = performance.now() - start;
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		const errorStack = error instanceof Error ? error.stack : '';
		logger.error(`ModifyRequest failed after ${duration.toFixed(2)}ms: ${errorMessage}`, {
			stack: errorStack
		});
		throw error;
	}
}
export { modifyRequest as m };
//# sourceMappingURL=modifyRequest.js.map
