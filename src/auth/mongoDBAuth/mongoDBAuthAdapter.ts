import mongoose from 'mongoose';
import type { authDBInterface } from '../authDBInterface';
import { UserAdapter } from './userAdapter';
import { SessionAdapter } from './sessionAdapter';
import { RoleAdapter } from './roleAdapter';
import { PermissionAdapter } from './permissionAdapter';
// import type { authDBInterface } from '../types';

// Define a type that represents the structure of our adapters
type AdapterMethods<T> = {
	[K in keyof T]: T[K] extends Function ? K : never;
}[keyof T];

// Create a factory function for adapters
function createAdapter<T>(name: string, methods: AdapterMethods<T>[]): T {
	const adapter = {};
	methods.forEach((method) => {
		adapter[method] = function (...args: any[]) {
			return this[name][method](...args);
		};
	});
	return adapter as T;
}

// Create your adapters using the factory function
const userAdapterMethods: AdapterMethods<authDBInterface>[] = [
	'createUser',
	'updateUserAttributes',
	'deleteUser',
	'getUserById',
	'getUserByEmail',
	'getAllUsers',
	'getUserCount',
	'assignPermissionToUser',
	'removePermissionFromUser',
	'getPermissionsForUser',
	'getUsersWithPermission',
	'checkUserPermission',
	'checkUserRole',
	'assignRoleToUser',
	'removeRoleFromUser',
	'getRoleForUser'
];

const sessionAdapterMethods: AdapterMethods<authDBInterface>[] = [
	'createSession',
	'updateSessionExpiry',
	'destroySession',
	'deleteExpiredSessions',
	'validateSession',
	'invalidateAllUserSessions',
	'getActiveSessions'
];

const roleAdapterMethods: AdapterMethods<authDBInterface>[] = [
	'createRole',
	'updateRole',
	'deleteRole',
	'getRoleById',
	'getAllRoles',
	'getRoleByName',
	'assignPermissionToRole',
	'removePermissionFromRole',
	'getPermissionsForRole'
];

const permissionsAdapterMethods: AdapterMethods<authDBInterface>[] = [
	'createPermission',
	'updatePermission',
	'deletePermission',
	'getPermissionById',
	'getAllPermissions',
	'getPermissionByName',
	'getRolesForPermission'
];

// MongoDBAuthAdapter Implementation
class MongoDBAuthAdapter implements authDBInterface {
	private userAdapter: any;
	private sessionAdapter: any;
	private roleAdapter: any;
	private permissionsAdapter: any;

	constructor() {
		const db = mongoose.connection;
		this.userAdapter = createAdapter('userAdapter', userAdapterMethods);
		this.sessionAdapter = createAdapter('sessionAdapter', sessionAdapterMethods);
		this.roleAdapter = createAdapter('roleAdapter', roleAdapterMethods);
		this.permissionsAdapter = createAdapter('permissionsAdapter', permissionsAdapterMethods);

		// Initialize your actual adapters
		this.userAdapter.userAdapter = new UserAdapter();
		this.sessionAdapter.sessionAdapter = new SessionAdapter();
		this.roleAdapter.roleAdapter = new RoleAdapter();
		this.permissionsAdapter.permissionsAdapter = new PermissionAdapter();
		this.initialize();
	}

	// Implement the methods from authDBInterface
	// TypeScript will ensure we implement all required methods
	private initialize(){
		this.userAdapter.createUser;
	 this.userAdapter.updateUserAttributes;
	}
	// ... and so on for all methods
}

export const mongoDBAuthAdapter = new MongoDBAuthAdapter();
