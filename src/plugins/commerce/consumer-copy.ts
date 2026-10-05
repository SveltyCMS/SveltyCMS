/**
 * @file src/plugins/commerce/consumer-copy.ts
 * @description Checkout labels. German uses the statutory phrases.
 */

import type { CommerceLegal } from "./legal";

export interface ConsumerCopy {
  vatIncluded: string;
  pay: string;
  withdraw: string;
  confirmWithdrawal: string;
  impressum: string;
  privacy: string;
  terms: string;
  priorPrice: (amount: string, currency: string) => string;
  termsLabel: string;
  withdrawalLabel: string;
  digitalLabel: string;
}

const de: ConsumerCopy = {
  vatIncluded: "inkl. MwSt.",
  pay: "zahlungspflichtig bestellen",
  withdraw: "Vertrag widerrufen",
  confirmWithdrawal: "Widerruf bestätigen",
  impressum: "Impressum",
  privacy: "Datenschutz",
  terms: "AGB",
  priorPrice: (amount, currency) => `Niedrigster Preis der letzten 30 Tage: ${amount} ${currency}`,
  termsLabel: "Ich habe die AGB und die Widerrufsbelehrung gelesen und akzeptiere sie.",
  withdrawalLabel:
    "Ich habe die Widerrufsbelehrung zur Kenntnis genommen. Die Frist beträgt 14 Tage ab Erhalt der Ware.",
  digitalLabel:
    "Ich stimme der sofortigen Ausführung des digitalen Inhalts zu und weiß, dass ich dadurch mein Widerrufsrecht verliere.",
};

const en: ConsumerCopy = {
  vatIncluded: "incl. VAT",
  pay: "Order with obligation to pay",
  withdraw: "Withdraw from the contract",
  confirmWithdrawal: "Confirm withdrawal",
  impressum: "Legal notice",
  privacy: "Privacy",
  terms: "Terms",
  priorPrice: (amount, currency) => `Lowest price in the last 30 days: ${amount} ${currency}`,
  termsLabel: "I have read and accept the terms and the withdrawal policy.",
  withdrawalLabel:
    "I have read the withdrawal policy. The period is 14 days from receipt of the goods.",
  digitalLabel:
    "I agree to immediate performance of the digital content and I know I lose my right of withdrawal.",
};

export function consumerCopy(legal: Pick<CommerceLegal, "storeLanguage">): ConsumerCopy {
  return legal.storeLanguage === "en" ? en : de;
}
