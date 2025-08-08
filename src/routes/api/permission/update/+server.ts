/**
 * @file src/routes/api/permission/update/+server.ts
 * @description API endpoint for updating permissions and roles in the CMS.
 *
 * NOTE: This endpoint modifies a global configuration file and is NOT COMPATIBLE
 * with multi-tenant mode. It will be disabled if MULTI_TENANT is true.
 *
 * This module provides functionality to:
 * - Update roles and their associated permissions
 * - Validate and transform incoming roles/permissions data
 * - Handle authorization and access control
 */
import { privateEnv } from '@root/config/private';

import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import fs from 'fs/promises';
import path from 'path';
import * as ts from 'typescript';

// Authorization
import { dbInitPromise } from '@src/databases/db';
import { getAllPermissions } from '@src/auth/permissions';
import { roles } from '@root/config/roles';

// System Logger
import { logger } from '@utils/logger.svelte';

// Importing and using the Role type from auth/types.ts
import type { Role } from '@src/auth/types';

// Constants for validation
const MAX_ROLE_NAME_LENGTH = 50;
const ROLE_NAME_PATTERN = /^[a-zA-Z0-9-_\s]+$/;

export const POST: RequestHandler = async ({ request, locals }) => {
	// --- MULTI-TENANCY SECURITY BLOCK ---
	// This endpoint modifies a global file and is fundamentally incompatible with multi-tenancy.
	// It is disabled to prevent one tenant from overwriting the roles of all other tenants.
	if (privateEnv.MULTI_TENANT) {
		logger.error('CRITICAL: The permission/update API endpoint was called in multi-tenant mode. This operation is disabled for security reasons.');
		throw error(501, 'This feature is not available in multi-tenant mode.');
	}

	// Authentication is handled by hooks.server.ts - user presence confirms access

	// Authorization check
	const user = locals.user;

	// Check if user has admin role
	const userRole = roles.find((role) => role._id === user.role);
	if (!userRole?.isAdmin) {
		logger.warn('Unauthorized attempt to update permissions', { userId: user._id });
		return json({ success: false, error: 'Unauthorized' }, { status: 403 });
	}

	try {
		await dbInitPromise;

		const { roles } = await request.json();

		// Basic array validation
		if (!Array.isArray(roles)) {
			logger.warn('Invalid roles data: not an array');
			return json({ success: false, error: 'Roles must be provided as an array' }, { status: 400 });
		}

		// Validate role structure and constraints
		const validationResult = await validateRoles(roles);
		if (!validationResult.isValid) {
			logger.warn('Role validation failed', { reason: validationResult.error });
			return json({ success: false, error: validationResult.error }, { status: 400 });
		}

		// Log the changes being made
		logger.info('Updating roles and permissions', {
			userId: user._id,
			roleCount: roles.length,
			timestamp: new Date().toISOString()
		});

		// Update the roles configuration file using AST transformation
		const rolesFilePath = path.resolve('config/roles.ts');
		const updatedContent = await generateRolesFileWithAST(roles);
		await fs.writeFile(rolesFilePath, updatedContent, 'utf8');

		// Log successful update
		logger.info('Roles and permissions updated successfully', {
			userId: user._id,
			roleCount: roles.length,
			timestamp: new Date().toISOString()
		});

		return json({ success: true }, { status: 200 });
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('Error updating permissions:', {
			error: errorMessage,
			userId: user._id,
			timestamp: new Date().toISOString()
		});
		return json({ success: false, error: `Error updating permissions: ${errorMessage}` }, { status: 500 });
	}
};

// Validates the complete roles array and their relationships
async function validateRoles(roles: Role[]): Promise<{ isValid: boolean; error?: string }> {
	try {
		// Check for empty roles array
		if (roles.length === 0) {
			return { isValid: false, error: 'At least one role must be provided' };
		}

		// Get available permissions for validation
		const availablePermissions = await getAllPermissions();
		const permissionIds = new Set(availablePermissions.map((p) => p._id));

		// Check for unique role names
		const roleNames = new Set<string>();
		let hasAdminRole = false;

		for (const role of roles) {
			// Validate basic structure
			if (!validateRoleStructure(role)) {
				return {
					isValid: false,
					error: `Invalid role structure for role: ${role.name || 'unnamed'}`
				};
			}

			// Validate role name
			if (!validateRoleName(role.name)) {
				return {
					isValid: false,
					error: `Invalid role name: ${role.name}. Names must be 1-${MAX_ROLE_NAME_LENGTH} characters and contain only letters, numbers, spaces, hyphens, and underscores.`
				};
			}

			// Check for duplicate names
			if (roleNames.has(role.name.toLowerCase())) {
				return { isValid: false, error: `Duplicate role name: ${role.name}` };
			}
			roleNames.add(role.name.toLowerCase());

			// Validate permissions
			if (!role.isAdmin) {
				// Skip permission validation for admin role since it's dynamic
				for (const permission of role.permissions) {
					if (!permissionIds.has(permission)) {
						return {
							isValid: false,
							error: `Invalid permission: ${permission} in role: ${role.name}`
						};
					}
				}
			}

			// Track admin role
			if (role.isAdmin) {
				hasAdminRole = true;
			}
		}

		// Ensure at least one admin role exists
		if (!hasAdminRole) {
			return { isValid: false, error: 'At least one role must be designated as admin' };
		}

		return { isValid: true };
	} catch (error) {
		logger.error('Error in role validation:', { error });
		return { isValid: false, error: 'Internal validation error' };
	}
}

// Validates the basic structure of a role object
function validateRoleStructure(role: Role): boolean {
	return (
		typeof role._id === 'string' &&
		typeof role.name === 'string' &&
		Array.isArray(role.permissions) &&
		role.permissions.every((perm) => typeof perm === 'string') &&
		(role.isAdmin === undefined || typeof role.isAdmin === 'boolean') &&
		(role.description === undefined || typeof role.description === 'string')
	);
}

// Validates role name format and length
function validateRoleName(name: string): boolean {
	return name.length > 0 && name.length <= MAX_ROLE_NAME_LENGTH && ROLE_NAME_PATTERN.test(name);
}

// AST-based role file generation (similar to compile.ts approach)
async function generateRolesFileWithAST(rolesData: Role[]): Promise<string> {
	try {
		// Create the base template
		const sourceCode = `/**
 * @file config/roles.ts
 * @description Role configuration file
 */

import type { Role } from '../src/auth/types';
import { getAllPermissions } from '../src/auth/permissions';

const permissions = getAllPermissions();

export const roles: Role[] = [];

// Function to register a new role
export function registerRole(newRole: Role): void {
	const exists = roles.some((role) => role._id === newRole._id);
	if (!exists) {
		roles.push(newRole);
	}
}

// Function to register multiple roles
export function registerRoles(newRoles: Role[]): void {
	newRoles.forEach(registerRole);
}`;

		// Parse the source code into an AST
		const sourceFile = ts.createSourceFile(
			'roles.ts',
			sourceCode,
			ts.ScriptTarget.ESNext,
			true // setParentNodes
		);

		// Transform the AST to inject the roles data
		const transformationResult = ts.transform(sourceFile, [createRolesTransformer(rolesData)]);
		const transformedSourceFile = transformationResult.transformed[0];

		// Print the transformed AST back to code
		const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
		return printer.printFile(transformedSourceFile);
	} catch (error) {
		logger.error('Error generating roles file with AST:', error);
		throw new Error(`Failed to generate roles file: ${error instanceof Error ? error.message : String(error)}`);
	}
}

// Transformer factory to inject roles data into the AST
function createRolesTransformer(rolesData: Role[]): ts.TransformerFactory<ts.SourceFile> {
	return (context) => {
		return (sourceFile) => {
			const visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
				// Find the roles array declaration and replace it with actual data
				if (
					ts.isVariableStatement(node) &&
					node.declarationList.declarations.some((decl) => ts.isIdentifier(decl.name) && decl.name.text === 'roles')
				) {
					// Create the roles array with actual data
					const rolesArray = createRolesArrayLiteral(rolesData);

					// Create new variable declaration
					const newDeclaration = ts.factory.createVariableDeclaration(
						ts.factory.createIdentifier('roles'),
						ts.factory.createTypeReferenceNode('Role', []),
						rolesArray
					);

					// Create new variable statement with export modifier
					return ts.factory.createVariableStatement(
						[ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
						ts.factory.createVariableDeclarationList([newDeclaration], ts.NodeFlags.Const)
					);
				}

				return ts.visitEachChild(node, visitor, context);
			};

			return ts.visitNode(sourceFile, visitor) as ts.SourceFile;
		};
	};
}

// Create TypeScript AST nodes for the roles array
function createRolesArrayLiteral(rolesData: Role[]): ts.ArrayLiteralExpression {
	const roleObjects = rolesData.map((role) => {
		const properties: ts.ObjectLiteralElementLike[] = [];

		// Add each property of the role
		Object.entries(role).forEach(([key, value]) => {
			if (key === 'id') return; // Skip 'id' property

			let propertyValue: ts.Expression;

			if (key === 'permissions' && role.isAdmin) {
				// For admin roles, use permissions.map((p) => p._id)
				propertyValue = ts.factory.createCallExpression(
					ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('permissions'), ts.factory.createIdentifier('map')),
					undefined,
					[
						ts.factory.createArrowFunction(
							undefined,
							undefined,
							[ts.factory.createParameterDeclaration(undefined, undefined, 'p')],
							undefined,
							ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
							ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('p'), ts.factory.createIdentifier('_id'))
						)
					]
				);
			} else if (typeof value === 'string') {
				propertyValue = ts.factory.createStringLiteral(value);
			} else if (typeof value === 'boolean') {
				propertyValue = value ? ts.factory.createTrue() : ts.factory.createFalse();
			} else if (Array.isArray(value)) {
				// Create array literal for permissions
				propertyValue = ts.factory.createArrayLiteralExpression(value.map((item) => ts.factory.createStringLiteral(String(item))));
			} else {
				// Fallback for other types
				propertyValue = ts.factory.createStringLiteral(String(value));
			}

			properties.push(ts.factory.createPropertyAssignment(ts.factory.createIdentifier(key), propertyValue));
		});

		return ts.factory.createObjectLiteralExpression(properties, true);
	});

	return ts.factory.createArrayLiteralExpression(roleObjects, true);
}
