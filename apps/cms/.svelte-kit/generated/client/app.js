import * as universal_hooks from '../../../src/hooks/index.ts';

export { matchers } from './matchers.js';

export const nodes = [
	() => import('./nodes/0'),
	() => import('./nodes/1'),
	() => import('./nodes/2'),
	() => import('./nodes/3'),
	() => import('./nodes/4'),
	() => import('./nodes/5'),
	() => import('./nodes/6'),
	() => import('./nodes/7'),
	() => import('./nodes/8'),
	() => import('./nodes/9'),
	() => import('./nodes/10'),
	() => import('./nodes/11'),
	() => import('./nodes/12'),
	() => import('./nodes/13'),
	() => import('./nodes/14'),
	() => import('./nodes/15'),
	() => import('./nodes/16'),
	() => import('./nodes/17'),
	() => import('./nodes/18'),
	() => import('./nodes/19'),
	() => import('./nodes/20'),
	() => import('./nodes/21'),
	() => import('./nodes/22'),
	() => import('./nodes/23')
];

export const server_loads = [0];

export const dictionary = {
		"/": [~3],
		"/config": [~6],
		"/config/accessManagement": [~7],
		"/config/collectionbuilder": [~8],
		"/config/collectionbuilder/[action]/[...contentPath]": [~9],
		"/config/configurationManager": [~10],
		"/config/import-export": [~11],
		"/config/system-health": [12],
		"/config/systemsetting": [~13],
		"/config/themeManagement": [~14],
		"/config/widgetManagement": [~15],
		"/dashboard": [~16],
		"/email-previews": [~17],
		"/graphql-test": [18],
		"/login": [~19],
		"/login/oauth": [~20],
		"/mediagallery": [~21],
		"/mediagallery/uploadMedia": [22],
		"/user": [~23],
		"/[language]": [~4,[],[2]],
		"/[language]/[...collection]": [~5,[],[2]]
	};

export const hooks = {
	handleError: (({ error }) => { console.error(error) }),
	
	reroute: universal_hooks.reroute || (() => {}),
	transport: universal_hooks.transport || {}
};

export const decoders = Object.fromEntries(Object.entries(hooks.transport).map(([k, v]) => [k, v.decode]));
export const encoders = Object.fromEntries(Object.entries(hooks.transport).map(([k, v]) => [k, v.encode]));

export const hash = false;

export const decode = (type, value) => decoders[type](value);

export { default as root } from '../root.js';