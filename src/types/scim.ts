/**
 * @file src/types/scim.ts
 * @description SCIM (System for Cross-domain Identity Management) type definitions
 *
 * Features:
 * - SCIM User
 * - SCIM Group
 * - SCIM List Response
 * - SCIM Error
 * - SCIM Service Provider Config
 */

export interface ScimUser {
  active: boolean;
  emails?: Array<{ value: string; type: string; primary: boolean }>;
  id: string;
  meta: {
    resourceType: "User";
    created: string;
    lastModified: string;
    location: string;
  };
  name?: {
    formatted?: string;
    familyName?: string;
    givenName?: string;
  };
  schemas: string[];
  userName: string;
}

export interface ScimGroup {
  displayName: string;
  id: string;
  members?: Array<{ value: string; display?: string; $ref?: string }>;
  meta: {
    resourceType: "Group";
    created: string;
    lastModified: string;
    location: string;
  };
  schemas: string[];
}

export interface ScimListResponse<T> {
  itemsPerPage: number;
  Resources: T[];
  schemas: string[];
  startIndex: number;
  totalResults: number;
}

export interface ScimError {
  detail?: string;
  schemas: string[];
  scimType?: string;
  status: string;
}

export interface ScimPatchOp {
  op: "add" | "remove" | "replace";
  path?: string;
  value?: unknown;
}

export interface ScimPatchRequest {
  schemas: string[];
  Operations: ScimPatchOp[];
}

export const SCIM_SCHEMAS = {
  USER: "urn:ietf:params:scim:schemas:core:2.0:User",
  GROUP: "urn:ietf:params:scim:schemas:core:2.0:Group",
  LIST_RESPONSE: "urn:ietf:params:scim:api:messages:2.0:ListResponse",
  SERVICE_PROVIDER_CONFIG: "urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig",
  ERROR: "urn:ietf:params:scim:api:messages:2.0:Error",
  PATCH_OP: "urn:ietf:params:scim:api:messages:2.0:PatchOp",
  SCHEMA: "urn:ietf:params:scim:schemas:core:2.0:Schema",
  RESOURCE_TYPE: "urn:ietf:params:scim:schemas:core:2.0:ResourceType",
};
