
// Used to categorize permissions based on the type of resource or area they apply to


export enum PermissionType {
    COLLECTION = 'collection',// Collection-related permissions
    USER = 'user',// User-related permissions
    CONFIGURATION = 'configuration',// Configuration-related permissions
    SYSTEM = 'system' // System-wide permissions
}
// Define the various actions that can be associated with permissions.
// These actions represent the operations that users can perform on a resource.

export enum PermissionAction {
    CREATE = 'create',// Grants the ability to create a new resource or record.
    READ = 'read',// Grants the ability to read or view a resource or record.
    UPDATE = 'update',// Grants the ability to modify or update an existing resource or record.
    DELETE = 'delete',// Grants the ability to remove or delete a resource or record.
    MANAGE = 'manage',// Grants overarching control over a resource or area, typically used for admin purposes.
    SHARE = 'share',// Grants the ability to share a resource or record with others, typically used for collaboration.
    ACCESS = 'access',// Grants basic access to a resource or area, typically used for admin purposes.
    EXECUTE = 'execute' // Grants the ability to execute a command or function, typically used for admin purposes.
}
