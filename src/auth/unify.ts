import type { authDBInterface } from "./authDBInterface";
import { PermissionAdapter } from "./mongoDBAuth/permissionAdapter";
import { RoleAdapter } from "./mongoDBAuth/roleAdapter";
import { SessionAdapter } from "./mongoDBAuth/sessionAdapter";
import { TokenAdapter } from "./mongoDBAuth/tokenAdapter";
import { UserAdapter } from "./mongoDBAuth/userAdapter";
import type { User, Session, Token, Role, Permission } from "./types";

export class UnifiedAdapter implements authDBInterface{
    private userAdapter = new UserAdapter();
    private roleAdapter=new RoleAdapter();
    private permissionAdapter=new PermissionAdapter();
    private sessionAdapter=new SessionAdapter();
    private tokenAdapter=new TokenAdapter();
    createUser(userData: Partial<User>): Promise<User> {
        return this.userAdapter.createUser(userData);
    }
    updateUserAttributes(user_id: string, attributes: Partial<User>): Promise<User> {
        return this.userAdapter.updateUserAttributes(user_id,attributes);
    }
    deleteUser(user_id: string): Promise<void> {
        return this.userAdapter.deleteUser(user_id);
    }
    getUserById(user_id: string): Promise<User | null> {
        return this.userAdapter.getUserById(user_id);
    }
    getUserByEmail(email: string): Promise<User | null> {
        return this.userAdapter.getUserByEmail(email);
    }
    getAllUsers(options?: { limit?: number; skip?: number; sort?: { [key: string]: 1 | -1; } | [string, 1 | -1][]; filter?: object; }): Promise<User[]> {
        return this.userAdapter.getAllUsers(options);
    }
    getUserCount(filter?: object): Promise<number> {
        return this.userAdapter.getUserCount(filter);
    }
    createSession(sessionData: { user_id: string; expires: number; }): Promise<Session> {
        return this.sessionAdapter.createSession(sessionData);
    }
    updateSessionExpiry(session_id: string, newExpiry: number): Promise<Session> {
        return this.sessionAdapter.updateSessionExpiry(session_id,newExpiry);
    }
    destroySession(session_id: string): Promise<void> {
        return this.sessionAdapter.destroySession(session_id);
    }
    deleteExpiredSessions(): Promise<number> {
        return this.sessionAdapter.deleteExpiredSessions();
    }
    validateSession(session_id: string): Promise<User | null> {
        return this.sessionAdapter.validateSession(session_id);
    }
    invalidateAllUserSessions(user_id: string): Promise<void> {
        return this.sessionAdapter.invalidateAllUserSessions(user_id);
    }
    getActiveSessions(user_id: string): Promise<Session[]> {
        return this.sessionAdapter.getActiveSessions(user_id);
    }
    createToken(data: { user_id: string; email: string; expires: number; type: string; }): Promise<string> {
        return this.tokenAdapter.createToken(data);
    }
    validateToken(token: string, user_id: string, type: string): Promise<{ success: boolean; message: string; }> {
        return this.tokenAdapter.validateToken(token,user_id,type);
    }
    consumeToken(token: string, user_id: string, type: string): Promise<{ status: boolean; message: string; }> {
        return this.tokenAdapter.consumeToken(token,user_id,type);
    }
    getAllTokens(filter?: object): Promise<Token[]> {
        return this.tokenAdapter.getAllTokens(filter);
    }
    deleteExpiredTokens(): Promise<number> {
        return this.tokenAdapter.deleteExpiredTokens();
    }
    createRole(roleData: Partial<Role>, currentUserId: string): Promise<Role> {
        return this.roleAdapter.createRole(roleData,currentUserId);
    }
    updateRole(role_id: string, roleData: Partial<Role>, currentUserId: string): Promise<void> {
        return this.roleAdapter.updateRole(role_id,roleData,currentUserId);
    }
    deleteRole(role_id: string, currentUserId: string): Promise<void> {
        return this.roleAdapter.deleteRole(role_id,currentUserId);
    }
    getRoleById(role_id: string): Promise<Role | null> {
        return this.roleAdapter.getRoleById(role_id);
    }
    getAllRoles(options?: { limit?: number; skip?: number; sort?: { [key: string]: 1 | -1; } | [string, 1 | -1][]; filter?: object; }): Promise<Role[]> {
        return this.roleAdapter.getAllRoles(options);
    }
    getRoleByName(name: string): Promise<Role | null> {
        return this.roleAdapter.getRoleByName(name);
    }
    createPermission(permissionData: Partial<Permission>, currentUserId: string): Promise<Permission> {
        return this.permissionAdapter.createPermission(permissionData,currentUserId);
    }
    updatePermission(permission_id: string, permissionData: Partial<Permission>, currentUserId: string): Promise<void> {
        return this.permissionAdapter.updatePermission(permission_id,permissionData,currentUserId);
    }
    deletePermission(permission_id: string, currentUserId: string): Promise<void> {
        return this.permissionAdapter.deletePermission(permission_id,currentUserId);
    }
    getPermissionById(permission_id: string): Promise<Permission | null> {
        return this.permissionAdapter.getPermissionById(permission_id);
    }
    getAllPermissions(options?: { limit?: number; skip?: number; sort?: { [key: string]: 1 | -1; } | [string, 1 | -1][]; filter?: object; }): Promise<Permission[]> {
        return this.permissionAdapter.getAllPermissions(options);
    }
    getPermissionByName(name: string): Promise<Permission | null> {
        return this.permissionAdapter.getPermissionByName(name);
    }
    assignPermissionToRole(role_id: string, permission_id: string, currentUserId: string): Promise<void> {
        return this.roleAdapter.assignPermissionToRole(role_id,permission_id);
    }
    removePermissionFromRole(role_id: string, permission_id: string, currentUserId: string): Promise<void> {
        return this.roleAdapter.removePermissionFromRole(role_id,permission_id);
    }
    getPermissionsForRole(role_id: string): Promise<Permission[]> {
        return this.roleAdapter.getPermissionsForRole(role_id);
    }
    getRolesForPermission(permission_id: string): Promise<Role[]> {        
        return this.roleAdapter.getRolesForPermission(permission_id);
    }
    assignPermissionToUser(user_id: string, permission_id: string): Promise<void> {
        return this.userAdapter.assignPermissionToUser(user_id,permission_id);
    }
    removePermissionFromUser(user_id: string, permission_id: string): Promise<void> {
        return this.userAdapter.removePermissionFromUser(user_id,permission_id);
    }
    getPermissionsForUser(user_id: string): Promise<Permission[]> {
        return this.userAdapter.getPermissionsForUser(user_id);
    }
    getUsersWithPermission(permission_id: string): Promise<User[]> {
        return this.userAdapter.getUsersWithPermission(permission_id);
    }
    assignRoleToUser(user_id: string, role_id: string): Promise<void> {
        return this.userAdapter.assignRoleToUser(user_id,role_id);
    }
    removeRoleFromUser(user_id: string, role_id: string): Promise<void> {
        throw new Error("Not implemented");
        return this.userAdapter.removeRoleFromUser(user_id)
    }
    getRolesForUser(user_id: string): Promise<Role[]> {
        return this.userAdapter.getRoleForUser(user_id);
    }
    getUsersWithRole(role_id: string): Promise<User[]> {
        return this.roleAdapter.getUsersWithRole(role_id);
    }
    initializeDefaultRolesAndPermissions(): Promise<void> {
        return this.roleAdapter.initializeDefaultRoles();
    }
    checkUserPermission(user_id: string, permission_name: string): Promise<boolean> {
        return this.userAdapter.checkUserPermission(user_id,permission_name);
    }
    checkUserRole(user_id: string, role_name: string): Promise<boolean> {
        return this.userAdapter.checkUserRole(user_id,role_name);
    }
    
}