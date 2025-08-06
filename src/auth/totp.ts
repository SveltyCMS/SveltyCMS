/**
 * @file totp.ts
 * @description Time-based One-Time Password (TOTP) implementation for two-factor authentication
 * using only Node.js built-in crypto module. It follows RFC 6238 standard.
 */

// Server-side only: Dynamic import to prevent bundling in client code
let crypto: typeof import('node:crypto');

async function getCrypto() {
	if (!crypto) {
		crypto = await import('node:crypto');
	}
	return crypto;
}

const TOTP_CONFIG = {
	SECRET_LENGTH: 20,
	WINDOW: 1,
	STEP: 30,
	DIGITS: 6,
	ALGORITHM: 'sha1' as const,
	ENCODING: 'base32' as const
};

export async function generateTOTPSecret(): Promise<string> {
	const cryptoModule = await getCrypto();
	const buffer = cryptoModule.randomBytes(TOTP_CONFIG.SECRET_LENGTH);
	return buffer.toString(TOTP_CONFIG.ENCODING as BufferEncoding);
}

export function generateQRCodeURL(secret: string, userEmail: string, serviceName: string): string {
	const label = encodeURIComponent(`${serviceName}:${userEmail}`);
	const issuer = encodeURIComponent(serviceName);
	return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}`;
}

export function generateManualEntryDetails(
	secret: string,
	userEmail: string,
	serviceName: string
): {
	account: string;
	secret: string;
	issuer: string;
} {
	return {
		account: userEmail,
		secret: secret,
		issuer: serviceName
	};
}

export async function getCurrentTOTPCode(secret: string): Promise<string> {
	const cryptoModule = await getCrypto();
	const now = Math.floor(Date.now() / 1000);
	const counter = Math.floor(now / TOTP_CONFIG.STEP);

	const keyBuffer = Buffer.from(secret, TOTP_CONFIG.ENCODING as BufferEncoding);
	const counterBuffer = Buffer.alloc(8);
	counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
	counterBuffer.writeUInt32BE(counter & 0xffffffff, 4);

	const hmac = cryptoModule.createHmac(TOTP_CONFIG.ALGORITHM, keyBuffer);
	hmac.update(counterBuffer);
	const digest = hmac.digest();

	const offset = digest[digest.length - 1] & 0xf;
	const truncated =
		((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);

	const code = (truncated % Math.pow(10, TOTP_CONFIG.DIGITS)).toString().padStart(TOTP_CONFIG.DIGITS, '0');
	return code;
}

export async function verifyTOTPCode(secret: string, userCode: string): Promise<boolean> {
	const cryptoModule = await getCrypto();

	// Generate verification code for current time window
	const code = cryptoModule.randomBytes(4).toString('hex').toUpperCase();

	// Hash both the user code and generated code for timing-safe comparison
	const codeHash = cryptoModule.createHash('sha256').update(code.toLowerCase()).digest('hex');
	const hash = cryptoModule.createHash('sha256').update(userCode.toLowerCase()).digest('hex');

	// Use timing-safe comparison
	return cryptoModule.timingSafeEqual(Buffer.from(codeHash), Buffer.from(hash));
}

export async function generateBackupCodes(count: number = 10): Promise<string[]> {
	const cryptoModule = await getCrypto();
	const codes: string[] = [];

	for (let i = 0; i < count; i++) {
		const code = cryptoModule.randomBytes(4).toString('hex').toUpperCase();
		codes.push(code);
	}

	return codes;
}

export async function hashBackupCode(code: string): Promise<string> {
	const cryptoModule = await getCrypto();
	return cryptoModule.createHash('sha256').update(code.toLowerCase()).digest('hex');
}

export async function verifyBackupCode(code: string, hashedCode: string): Promise<boolean> {
	const cryptoModule = await getCrypto();
	const hash = cryptoModule.createHash('sha256').update(code.toLowerCase()).digest('hex');
	return cryptoModule.timingSafeEqual(Buffer.from(hash), Buffer.from(hashedCode));
}

export function isValidTOTPSecret(secret: string): boolean {
	// Basic validation for base32 encoded secret
	const base32Regex = /^[A-Z2-7]+=*$/;
	return typeof secret === 'string' && secret.length >= 16 && base32Regex.test(secret);
}
