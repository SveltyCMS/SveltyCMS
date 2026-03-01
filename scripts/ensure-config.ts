import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const configDir = join(process.cwd(), 'config');
const privateConfig = join(configDir, 'private.ts');

if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
}

if (!existsSync(privateConfig)) {
    console.log('Creating dummy config/private.ts for build/check process...');
    const content = `
export const privateEnv = {
    DB_TYPE: 'sqlite',
    DB_HOST: 'local.db',
    DB_NAME: 'dummy',
    DB_USER: 'admin',
    DB_PASSWORD: 'password',
    JWT_SECRET_KEY: '01234567890123456789012345678901',
    ENCRYPTION_KEY: '01234567890123456789012345678901',
    MULTI_TENANT: false
};
`;
    writeFileSync(privateConfig, content);
}
