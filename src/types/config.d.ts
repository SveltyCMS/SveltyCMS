declare module '@config/private' {
	export const privateEnv: {
		DB_TYPE: 'mongodb' | 'mongodb+srv';
		DB_HOST: string;
		DB_PORT: number;
		DB_NAME: string;
		DB_USER: string;
		DB_PASSWORD: string;
		JWT_SECRET_KEY: string;
		ENCRYPTION_KEY: string;
		GOOGLE_CLIENT_ID?: string;
		GOOGLE_CLIENT_SECRET?: string;
		MULTI_TENANT?: boolean;
		[key: string]: unknown;
	};
}

declare module '@config/private.test' {
	export const privateEnv: {
		DB_TYPE: 'mongodb' | 'mongodb+srv';
		DB_HOST: string;
		DB_PORT: number;
		DB_NAME: string;
		DB_USER: string;
		DB_PASSWORD: string;
		JWT_SECRET_KEY: string;
		ENCRYPTION_KEY: string;
		GOOGLE_CLIENT_ID?: string;
		GOOGLE_CLIENT_SECRET?: string;
		MULTI_TENANT?: boolean;
		[key: string]: unknown;
	};
}
