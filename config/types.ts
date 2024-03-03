import type { AvailableLanguageTag } from '../src/paraglide/runtime';

// Create a Private config function
export const createPrivateConfig = (arg: {
	DB_NAME: string;
	DB_USER: string;
	DB_HOST: string;
	DB_PASSWORD: string;
	SMTP_HOST?: string;
	SMTP_PORT?: number;
	SMTP_EMAIL?: string;
	SMTP_PASSWORD?: string;
	SERVER_PORT?: number;
	BODY_SIZE_LIMIT: number;
}) => arg;

// Create a Public config function
export const createPublicConfig = <const C, S extends AvailableLanguageTag>(arg: {
	DEFAULT_CONTENT_LANGUAGE: C;
	AVAILABLE_CONTENT_LANGUAGES: C[];
	AVAILABLE_SYSTEM_LANGUAGES: S[];
	DEFAULT_SYSTEM_LANGUAGE: NoInfer<S>;
	MEDIA_FOLDER: string;
	IMAGE_SIZES: { [key: string]: number };
	SITE_NAME: string;
}) => arg;
type NoInfer<T> = [T][T extends any ? 0 : never];
