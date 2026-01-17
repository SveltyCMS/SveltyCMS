function buildDatabaseConnectionString(config) {
	switch (config.type) {
		case 'mongodb':
		case 'mongodb+srv': {
			const isSrv = config.type === 'mongodb+srv';
			const protocol = isSrv ? 'mongodb+srv' : 'mongodb';
			const port = isSrv || !config.port ? '' : `:${config.port}`;
			const hasCredentials = config.user && config.password;
			const user = hasCredentials ? `${encodeURIComponent(config.user)}:${encodeURIComponent(config.password)}@` : '';
			let queryParams = '';
			if (isSrv && hasCredentials) {
				queryParams = '?retryWrites=true&w=majority';
			} else if (!isSrv && hasCredentials) {
				queryParams = '?authSource=admin';
			}
			return `${protocol}://${user}${config.host}${port}/${config.name}${queryParams}`;
		}
		case 'mariadb': {
			const port = config.port ? `:${config.port}` : ':3306';
			const hasCredentials = config.user && config.password;
			const user = hasCredentials ? `${encodeURIComponent(config.user)}:${encodeURIComponent(config.password)}@` : '';
			return `mysql://${user}${config.host}${port}/${config.name}`;
		}
		default: {
			const _exhaustiveCheck = config.type;
			throw new Error(`Unsupported database type: ${_exhaustiveCheck}`);
		}
	}
}
export { buildDatabaseConnectionString };
//# sourceMappingURL=database.js.map
