/**
 * @file src/widgets/custom/Price/index.ts
 * @description Price Widget Definition.
 *
 * Handles monetary values with currency support.
 */

import type { FieldInstance } from "@src/content/types";
import { createWidget } from "@src/widgets/widget-factory";
import { maxValue, minValue, nullable, number, object, pipe, regex, string } from "valibot";
import type { PriceProps } from "./types";

const validationSchema = (field: FieldInstance) => {
  const min = (field as any).min;
  const max = (field as any).max;

  let amountSchema: any = number("Amount must be a number");

  if (typeof min === "number") {
    amountSchema = pipe(amountSchema, minValue(min, `Minimum amount is ${min}`));
  }
  if (typeof max === "number") {
    amountSchema = pipe(amountSchema, maxValue(max, `Maximum amount is ${max}`));
  }

  const schema = object({
    amount: field.required ? amountSchema : nullable(amountSchema),
    currency: pipe(string(), regex(/^[A-Z]{3}$/, "Must be a 3-letter ISO code")),
  });

  return field.required ? schema : nullable(schema);
};

const PriceWidget = createWidget<PriceProps>({
  Name: "Price",
  Icon: "mdi:currency-usd",
  Description: "Price with currency selection support",
  inputComponentPath: "/src/widgets/custom/price/input.svelte",
  displayComponentPath: "/src/widgets/custom/price/display.svelte",
  validationSchema,

  defaults: {
    defaultCurrency: "EUR",
    allowedCurrencies: ["EUR", "USD", "GBP"],
    min: 0,
    step: 0.01,
    translated: false,
  },

  GuiSchema: {
    label: { widget: "Input", required: true },
    db_fieldName: { widget: "Input", required: false },
    required: { widget: "Toggles", required: false },
    defaultCurrency: { widget: "Input", label: "Default Currency (ISO)" },
    min: { widget: "Input", type: "number", label: "Min Amount" },
    max: { widget: "Input", type: "number", label: "Max Amount" },
    step: { widget: "Input", type: "number", label: "Step" },
  },

  GraphqlSchema: () => {
    return {
      typeID: "Price",
      graphql: `
				type Price {
					amount: Float
					currency: String
				}
			`,
    };
  },
});

export default PriceWidget;
export type FieldType = ReturnType<typeof PriceWidget>;
