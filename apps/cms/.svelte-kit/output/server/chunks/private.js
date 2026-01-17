const privateEnv = {
	// --- Core Database Connection ---
	DB_TYPE: 'mongodb',
	DB_HOST: 'localhost',
	DB_PORT: 27017,
	DB_NAME: 'SveltyCMS',
	DB_USER: 'admin',
	DB_PASSWORD: 'Getin1972!',
	// --- Connection Behavior ---
	DB_RETRY_ATTEMPTS: 5,
	DB_RETRY_DELAY: 3e3,
	// 3 seconds
	// --- Core Security Keys ---
	JWT_SECRET_KEY: 'CqqE+WeKHJZ4gfsZ9/i02T/vwDtUbhFjf00tFZpnd/8=',
	ENCRYPTION_KEY: '52pYWME9g3/6lSUQUBcHflgC+5pdK/k6SfpaHOdZZa4=',
	// --- Fundamental Architectural Mode ---
	MULTI_TENANT: false
	/* * NOTE: All other settings (SMTP, Google OAuth, feature flags, etc.)
	 * are loaded dynamically from the database after the application starts.
	 */
};
export { privateEnv };
//# sourceMappingURL=private.js.map
