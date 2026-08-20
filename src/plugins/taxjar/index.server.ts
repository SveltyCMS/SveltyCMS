/**
 * @file src/plugins/taxjar/index.server.ts
 * @description Registers the TaxJar tax provider at plugin boot.
 */

import { registerTaxProvider } from "../commerce/fulfillment";
import { taxjarProvider } from "./provider";

registerTaxProvider(taxjarProvider);
