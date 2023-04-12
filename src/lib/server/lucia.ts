import {dev} from '$app/environment';
import lucia, {type Session, UserSchema} from 'lucia-auth';
import {sveltekit} from 'lucia-auth/middleware';
import {User} from '$lib/models/user-model';

// mongoose
import adapter from '@lucia-auth/adapter-mongoose';
import mongoose from 'mongoose';

//github oauth
import {github} from '@lucia-auth/oauth/providers';
import {GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET} from '$env/static/private';

// models
import '$lib/models/user-model';
import '$lib/models/session-model';
import '$lib/models/key-model';
import '$lib/models/sign-up-token-model';
import {fail, redirect, type RequestEvent} from '@sveltejs/kit';

export const auth = lucia({
    adapter: adapter(mongoose),
    //for production & cloned dev environment
    env: dev ? 'DEV' : 'PROD',

    autoDatabaseCleanup: true,
    transformUserData: (userData: {
        id: any;
        email: any;
        role: any;
        username: any;
        firstname: any;
        lastname: any;
        avatar: any;
        resetRequestedAt: any;
        resetToken: any;
        lastActiveAt: any;
    }) => {
        return {
            userId: userData.id,
            email: userData.email,
            role: userData.role,
            username: userData.username,

            firstname: userData.firstname,
            lastname: userData.lastname,
            avatar: userData.avatar,

            resetRequestedAt: userData.resetRequestedAt,
            resetToken: userData.resetToken,
            lastActiveAt: userData.lastActiveAt
        };
    },
    middleware: sveltekit()
});

export const githubAuth = github(auth, {
    clientId: GITHUB_CLIENT_ID,
    clientSecret: GITHUB_CLIENT_SECRET
});

export type Auth = typeof auth;

export const luciaVerifyAndReturnUser = async (
    event: RequestEvent<Partial<Record<string, string>>, string | null>
): Promise<UserSchema | null | undefined> => {
    // This code returns a valid and verified user that can be set in the event.locals.user

    try {
        const lucia = auth.handleRequest(event);
        const auth_object = await lucia.validate();
        if (!auth_object) return null;
        const {user} = await auth.validateSessionUser(auth_object.sessionId);
        if (user && user?.userId) {
            return JSON.parse(JSON.stringify(await User.findById(user.userId))) as UserSchema
        }
        return null
    } catch (e) {
        return null;
    }
};

export const luciaSetCookie = async (
    event: RequestEvent<Partial<Record<string, string>>, string | null>,
    session: Session
) => {
    const lucia = auth.handleRequest(event);
    lucia.setSession(session);
};

export const luciaRemoveCookieAndSignOut = async (
    event: RequestEvent<Partial<Record<string, string>>, string | null>
) => {
    const lucia = auth.handleRequest(event);
    const auth_object = await lucia.validate();
    if (!auth_object) return fail(500, {error: 'No auth object'});
    await auth.invalidateSession(auth_object.sessionId); // invalidate session
    event.locals.user = null; // remove cookie
    throw redirect(302, '/login');
};
