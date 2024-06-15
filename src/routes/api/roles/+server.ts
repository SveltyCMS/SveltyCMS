import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { join } from 'path';
import { writeFileSync } from 'fs';
import type { Permissions } from '@src/auth/roles'; // Type-only import
import { roles, permissions, defaultPermissions, adminRole } from '@src/auth/roles';

export const POST: RequestHandler = async ({ request }) => {
	const { roles: newRoles } = await request.json();

	if (!Array.isArray(newRoles)) {
		return json({ error: 'Invalid roles format' }, { status: 400 });
	}

	// Generate the new permissions object
	const updatedPermissions: Permissions = newRoles.reduce((acc, role) => {
		return {
			...acc,
			[role.name]: permissions.reduce(
				(permAcc, permission) => {
					return {
						...permAcc,
						[permission]: role.permissions[permission] || false
					};
				},
				{} as { [P in (typeof permissions)[number]]: boolean }
			)
		};
	}, {} as Permissions);

	// Write the updated permissions to the roles file
	const rolesFilePath = join(process.cwd(), 'src', 'auth', 'roles.ts');
	const newRolesContent = `
export const adminRole = 'admin';
export const flexibleRoles = ${JSON.stringify(newRoles.map((role) => role.name))} as const;
export const roles = [adminRole, ...flexibleRoles] as const;
export type Roles = (typeof roles)[number];
export const permissions = ${JSON.stringify(permissions)} as const;
export type Permissions = {
    [K in Roles]: { [P in (typeof permissions)[number]]: boolean };
};
export const defaultPermissions: Permissions = ${JSON.stringify(updatedPermissions)};
`;

	writeFileSync(rolesFilePath, newRolesContent);

	return json({ message: 'Roles updated successfully' });
};
