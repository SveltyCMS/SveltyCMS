/**
@file src/widgets/core/group/index.ts
@description - Group index file.
*/

import type { Params, GuiSchema, GraphqlSchema } from './types';
import { getGuiFields } from '@widgets/index';

//ParaglideJS
import * as m from '@src/paraglide/messages';

const WIDGET_NAME = 'Group' as const;

const GuiSchema = {
  // Define your GUI schema structure here
  type: 'object',
  properties: {
    fields: {
      type: 'array'
    },
    mode: {
      type: 'string'
    }
  }
};

const GraphqlSchema = {
  // Define your GraphQL schema structure here
  type: 'Object',
  fields: {}
};

/**
 * Defines Group widget Parameters
 */
const widget = (params: Params) => {
  // Define the display function
  let display: any;

  if (!params.display) {
    display = async ({ data, contentLanguage }) => {
      // console.log(data);
      data = data ? data : {}; // Ensure data is not undefined
      // Return the data for the default content language or a message indicating no data entry
      return params.translated ? data[contentLanguage] || m.widgets_nodata() : data[publicEnv.DEFAULT_CONTENT_LANGUAGE] || m.widgets_nodata();
    };
    display.default = true;
  } else {
    display = params.display;
  }

  // Define the widget object
  const widget = {
    Name: WIDGET_NAME,
    GuiFields: getGuiFields(params, GuiSchema)
  };

  // Define the field object
  const field = {
    // default fields
    display,
    label: params.label,
    db_fieldName: params.db_fieldName,
    translated: params.translated,
    required: params.required,
    icon: params.icon,
    width: params.width,
    helper: params.helper,

    // permissions
    permissions: params.permissions,

    // widget specific
    fields: params.fields,
    mode: params.mode
  };

  // Return the field and widget objects
  return { ...field, widget };
};

// Assign GuiSchema and GraphqlSchema to the widget function
widget.Name = WIDGET_NAME;
widget.GuiSchema = GuiSchema;
widget.GraphqlSchema = GraphqlSchema;
widget.toString = () => '';

// Widget icon and helper text
widget.Icon = 'material-symbols:category';
widget.Description = 'This widget is used to group other widgets together.';

// Widget Aggregations:
widget.aggregations = {} as Aggregations;

// Export FieldType type and widget function
export type FieldType = ReturnType<typeof widget>;
export default widget;
