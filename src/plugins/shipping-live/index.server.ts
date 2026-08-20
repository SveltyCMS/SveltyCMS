/**
 * @file src/plugins/shipping-live/index.server.ts
 * @description Registers the live-carrier provider at plugin boot.
 */

import { registerShippingRateProvider } from "../commerce/fulfillment";
import { shippingLiveProvider } from "./providers";

registerShippingRateProvider(shippingLiveProvider);
