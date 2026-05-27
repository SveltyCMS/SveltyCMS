declare module '@config/private' {
	export const privateEnv: {
		DB_TYPE: 'mongodb' | 'mongodb+srv' | 'mariadb' | '';
		DB_HOST: string;
		DB_PORT: number;
		DB_NAME: string;
		DB_USER: string;
		DB_PASSWORD: string;
		JWT_SECRET_KEY: string;
		ENCRYPTION_KEY: string;
		MULTI_TENANT: boolean;
	};
}
