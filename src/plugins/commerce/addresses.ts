/**
 * @file src/plugins/commerce/addresses.ts
 * @description Customer address book. Tenant + customer scoped.
 */

import { raise } from "@utils/error-handling";
import { nowISODateString } from "@utils/date";
import { generateUUID } from "@utils/native-utils";
import type { CommerceStore } from "./store";

export interface AddressInput {
  label?: string;
  line1: string;
  line2?: string;
  city: string;
  postal: string;
  country: string;
  isDefaultShipping?: boolean;
  isDefaultBilling?: boolean;
}

export async function listAddresses(store: CommerceStore, customerId: string) {
  if (!(await store.hasCollection("commerce_addresses"))) return [];
  return store.findMany("commerce_addresses", { customer: customerId }, { limit: 20 });
}

export async function saveAddress(
  store: CommerceStore,
  customerId: string,
  input: AddressInput,
  id?: string,
) {
  if (!(await store.hasCollection("commerce_addresses"))) {
    raise(503, "Address book collection is missing.", "COMMERCE_PRESET_MISSING");
  }
  const line1 = String(input.line1 || "").trim();
  const city = String(input.city || "").trim();
  const postal = String(input.postal || "").trim();
  const country = String(input.country || "").trim();
  if (!line1 || !city || !postal || !country) {
    raise(400, "Address needs line1, city, postal, and country.", "ADDRESS_INVALID");
  }
  const payload = {
    customer: customerId,
    label: String(input.label || "Address"),
    line1,
    line2: String(input.line2 || ""),
    city,
    postal,
    country,
    isDefaultShipping: Boolean(input.isDefaultShipping),
    isDefaultBilling: Boolean(input.isDefaultBilling),
    updatedAt: nowISODateString(),
  };
  if (id) {
    const existing = await store.findOne("commerce_addresses", { _id: id, customer: customerId });
    if (!existing) raise(404, "Address not found.", "ADDRESS_NOT_FOUND");
    await store.update("commerce_addresses", id, payload);
    return { ...existing, ...payload, _id: id };
  }
  return store.create("commerce_addresses", {
    ...payload,
    _id: generateUUID(),
    createdAt: nowISODateString(),
    status: "publish",
  });
}

export async function deleteAddress(store: CommerceStore, customerId: string, id: string) {
  const existing = await store.findOne("commerce_addresses", { _id: id, customer: customerId });
  if (!existing) raise(404, "Address not found.", "ADDRESS_NOT_FOUND");
  await store.delete("commerce_addresses", id);
}
