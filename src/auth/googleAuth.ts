import { dev } from "$app/environment";
import { privateEnv } from "@root/config/private";
import { publicEnv } from "@root/config/public";
import { logger } from "../utils/logger";


// Google OAuth
let googleAuthClient: any = null;

async function googleAuth() {
    if (googleAuthClient) return googleAuthClient;
    if (privateEnv.GOOGLE_CLIENT_ID && privateEnv.GOOGLE_CLIENT_SECRET) {
        logger.debug('Setting up Google OAuth2...');
        const { google } = await import('googleapis');
        googleAuthClient = new google.auth.OAuth2(
            privateEnv.GOOGLE_CLIENT_ID,
            privateEnv.GOOGLE_CLIENT_SECRET,
            `${dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD}/login/oauth`
        );
        return googleAuthClient;
    } else {
        logger.warn('Google client ID and secret not provided. Google OAuth will not be available.');
        return null;
    }
}

export { googleAuth }