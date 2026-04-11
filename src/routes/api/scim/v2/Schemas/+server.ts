/**
 * @file src/routes/api/scim/v2/Schemas/+server.ts
 * @description SCIM v2 Schemas endpoint (RFC 7643 §8.7.1)
 *
 * Features:
 * - Returns User and Group schema definitions
 * - No authentication required (discovery endpoint)
 */

import { SCIM_SCHEMAS } from "@src/types/scim";
import { json } from "@sveltejs/kit";
import { apiHandler } from "@utils/api-handler";

const USER_SCHEMA = {
  id: SCIM_SCHEMAS.USER,
  name: "User",
  description: "User Account",
  attributes: [
    {
      name: "userName",
      type: "string",
      multiValued: false,
      required: true,
      caseExact: false,
      mutability: "readWrite",
      returned: "default",
      uniqueness: "server",
    },
    {
      name: "name",
      type: "complex",
      multiValued: false,
      required: false,
      mutability: "readWrite",
      returned: "default",
      subAttributes: [
        {
          name: "formatted",
          type: "string",
          multiValued: false,
          required: false,
          mutability: "readWrite",
          returned: "default",
        },
        {
          name: "familyName",
          type: "string",
          multiValued: false,
          required: false,
          mutability: "readWrite",
          returned: "default",
        },
        {
          name: "givenName",
          type: "string",
          multiValued: false,
          required: false,
          mutability: "readWrite",
          returned: "default",
        },
      ],
    },
    {
      name: "displayName",
      type: "string",
      multiValued: false,
      required: false,
      mutability: "readWrite",
      returned: "default",
    },
    {
      name: "emails",
      type: "complex",
      multiValued: true,
      required: false,
      mutability: "readWrite",
      returned: "default",
      subAttributes: [
        {
          name: "value",
          type: "string",
          multiValued: false,
          required: false,
          mutability: "readWrite",
          returned: "default",
        },
        {
          name: "type",
          type: "string",
          multiValued: false,
          required: false,
          mutability: "readWrite",
          returned: "default",
        },
        {
          name: "primary",
          type: "boolean",
          multiValued: false,
          required: false,
          mutability: "readWrite",
          returned: "default",
        },
      ],
    },
    {
      name: "active",
      type: "boolean",
      multiValued: false,
      required: false,
      mutability: "readWrite",
      returned: "default",
    },
    {
      name: "roles",
      type: "complex",
      multiValued: true,
      required: false,
      mutability: "readOnly",
      returned: "default",
      subAttributes: [
        {
          name: "value",
          type: "string",
          multiValued: false,
          required: false,
          mutability: "readOnly",
          returned: "default",
        },
        {
          name: "display",
          type: "string",
          multiValued: false,
          required: false,
          mutability: "readOnly",
          returned: "default",
        },
      ],
    },
  ],
  meta: {
    resourceType: "Schema",
    location: "/api/scim/v2/Schemas/urn:ietf:params:scim:schemas:core:2.0:User",
  },
};

const GROUP_SCHEMA = {
  id: SCIM_SCHEMAS.GROUP,
  name: "Group",
  description: "Group (Role)",
  attributes: [
    {
      name: "displayName",
      type: "string",
      multiValued: false,
      required: true,
      mutability: "readWrite",
      returned: "default",
    },
    {
      name: "members",
      type: "complex",
      multiValued: true,
      required: false,
      mutability: "readWrite",
      returned: "default",
      subAttributes: [
        {
          name: "value",
          type: "string",
          multiValued: false,
          required: false,
          mutability: "immutable",
          returned: "default",
        },
        {
          name: "display",
          type: "string",
          multiValued: false,
          required: false,
          mutability: "readOnly",
          returned: "default",
        },
        {
          name: "$ref",
          type: "reference",
          multiValued: false,
          required: false,
          mutability: "immutable",
          returned: "default",
        },
      ],
    },
  ],
  meta: {
    resourceType: "Schema",
    location: "/api/scim/v2/Schemas/urn:ietf:params:scim:schemas:core:2.0:Group",
  },
};

export const GET = apiHandler(async () => {
  return json({
    schemas: [SCIM_SCHEMAS.LIST_RESPONSE],
    totalResults: 2,
    itemsPerPage: 2,
    startIndex: 1,
    Resources: [USER_SCHEMA, GROUP_SCHEMA],
  });
});
