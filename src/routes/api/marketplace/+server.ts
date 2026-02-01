/**
 * @file src/routes/api/marketplace/+server.ts
 * @description API endpoint alias for marketplace widgets
 */

import type { RequestHandler } from './$types';
import { GET as widgetsGet } from './widgets/+server';

export const GET: RequestHandler = async (event) => widgetsGet(event);
