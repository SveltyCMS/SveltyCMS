/**
 * @file src/services/importer/source-adapters.ts
 * @description Adapters for fetching content from external CMS APIs (Drupal, WordPress).
 */

import { logger } from "@utils/logger.server";

export interface ExternalSourceSchemaField {
  name: string;
  type: string;
}

export interface ExternalSourceData {
  items: any[];
  schema: ExternalSourceSchemaField[];
}

/**
 * Fetch data from Drupal via JSON:API
 */
export async function fetchDrupalData(
  url: string,
  type: string,
  apiKey?: string,
): Promise<ExternalSourceData> {
  try {
    const endpoint = `${url.replace(/\/$/, "")}/jsonapi/node/${type}`;
    const headers: Record<string, string> = {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(endpoint, { headers });
    if (!response.ok) {
      throw new Error(`Drupal API error: ${response.statusText}`);
    }

    const data = await response.json();
    const items = data.data || [];

    const schema: ExternalSourceSchemaField[] = [];
    if (items.length > 0) {
      const attributes = items[0].attributes || {};
      for (const key in attributes) {
        schema.push({
          name: key,
          type: typeof attributes[key],
        });
      }
      const relationships = items[0].relationships || {};
      for (const key in relationships) {
        schema.push({
          name: key,
          type: "relation",
        });
      }
    }

    return { items, schema };
  } catch (error) {
    logger.error("Error fetching Drupal data:", error);
    throw error;
  }
}

/**
 * Fetch data from WordPress via REST API
 */
export async function fetchWordPressData(
  url: string,
  type: string,
  apiKey?: string,
): Promise<ExternalSourceData> {
  try {
    const endpoint = `${url.replace(/\/$/, "")}/wp-json/wp/v2/${type}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (apiKey) {
      headers.Authorization = `Basic ${Buffer.from(apiKey).toString("base64")}`;
    }

    const response = await fetch(endpoint, { headers });
    if (!response.ok) {
      throw new Error(`WordPress API error: ${response.statusText}`);
    }

    const items = await response.json();

    const schema: ExternalSourceSchemaField[] = [];
    if (Array.isArray(items) && items.length > 0) {
      const firstItem = items[0];
      for (const key in firstItem) {
        const val = firstItem[key];
        let type: string = typeof val;
        if (key === "featured_media") type = "media";
        else if (val && typeof val === "object" && val.rendered) type = "richtext";

        schema.push({ name: key, type });
      }
    }

    return { items, schema };
  } catch (error) {
    logger.error("Error fetching WordPress data:", error);
    throw error;
  }
}
