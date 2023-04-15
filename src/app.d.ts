/// <reference types="lucia-auth" />
declare namespace Lucia {
    type Auth = import('$lib/server/lucia').Auth;

    const roles = process.env.PUBLIC_USER_ROLES.split(',');

    type UserAttributes = {
        _id: any;
        userId: any;
        email: string;
        role: (typeof roles)[number];
        username: string | undefined;
        firstname: string | undefined;
        lastname: string | undefined;
        avatar: string | undefined;
        resetRequestedAt: Date | undefined;
        resetToken: string | undefined;
        lastActiveAt: string | undefined;
    };
}

/// <reference types="@sveltejs/kit" />
// See https://kit.svelte.dev/docs/types#the-app-namespace
declare namespace App {
    interface Locals {
        // lucia
        user: Lucia.UserAttributes | null;

        // i18n
        locale: import('$i18n/i18n-types').Locales;
        LL: import('$i18n/i18n-types').TranslationFunctions;
    }

    interface Platform {
    }

    interface Session {
    }

    interface Stuff {
    }
}
