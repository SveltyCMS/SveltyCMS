function isHttpError(error) {
	return typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number';
}
function getErrorMessage(error) {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === 'string') {
		return error;
	}
	if (isHttpError(error) && error.body?.message) {
		return error.body.message;
	}
	if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
		return error.message;
	}
	try {
		const stringified = JSON.stringify(error);
		if (stringified !== '{}') {
			return stringified;
		}
	} catch {}
	return String(error);
}
export { getErrorMessage as g };
//# sourceMappingURL=errorHandling.js.map
