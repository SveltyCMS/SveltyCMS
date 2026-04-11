/**
 * @file src/services/importer/scaffolder.ts
 * @description Generates SveltyCMS collection schemas from external source metadata.
 */

import { aiService } from "@src/services/ai-service";
import { logger } from "@utils/logger.server";
import type { ExternalSourceSchemaField } from "./source-adapters";

/**
 * Scaffolds a new collection schema based on external source metadata.
 */
export async function scaffoldCollectionSchema(
  collectionName: string,
  sourceFields: ExternalSourceSchemaField[],
) {
  try {
    logger.info(`Scaffolding collection: ${collectionName}`);

    // Ask AI to suggest widgets for each source field
    const prompt = `
			You are an expert CMS architect. I have a remote schema from an external source (WordPress/Drupal).
			Source Fields: ${JSON.stringify(sourceFields)}
			
			Please suggest a SveltyCMS collection schema. 
			For each field, choose the most appropriate widget from this list:
			- widgets.Input (for single line text)
			- widgets.Textarea (for multi-line text)
			- widgets.RichText (for HTML/rendered content)
			- widgets.MediaUpload (for images/files)
			- widgets.Number (for numeric values)
			- widgets.DateTime (for dates)
			- widgets.Boolean (for true/false)
			
			Return a JSON array of field definitions where each object has:
			{
				"widget": "Input" | "Textarea" | "RichText" | "MediaUpload" | "Number" | "DateTime" | "Boolean",
				"label": "Human readable name",
				"db_fieldName": "snake_case_name",
				"required": boolean
			}
		`;

    const response = await aiService.generateJSON(prompt);
    const fields = Array.isArray(response) ? response : [];

    const schema = {
      name: collectionName,
      icon: "mdi:import",
      slug: collectionName.toLowerCase().replace(/\s+/g, "_"),
      fields: fields,
    };

    return schema;
  } catch (error) {
    logger.error("Error scaffolding collection schema:", error);
    throw error;
  }
}
