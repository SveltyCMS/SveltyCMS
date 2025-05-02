// Mock SvelteKit environment
export const browser = true;
export const dev = true;
export const building = false;
export const version = 'test';

// Mock SvelteKit session
export const getSession = () => Promise.resolve({});

// Mock SvelteKit load functions
export const load = async () => ({});

// Types for mocks
type Page = {
    url: URL;
    params: Record<string, string>;
    routeId: string | null;
};

type Navigation = {
    from: Page | null;
    to: Page | null;
};

// Mock SvelteKit page store
export const page = {
    subscribe: (fn: (value: Page) => void) => {
        fn({
            url: new URL('http://localhost'),
            params: {},
            routeId: null
        });
        return () => { };
    }
};

// Mock SvelteKit navigating store
export const navigating = {
    subscribe: (fn: (value: Navigation | null) => void) => {
        fn(null);
        return () => { };
    }
};

// Mock SvelteKit updated store
export const updated = {
    subscribe: (fn: (value: boolean) => void) => {
        fn(false);
        return () => { };
    },
    check: () => Promise.resolve(false)
};
