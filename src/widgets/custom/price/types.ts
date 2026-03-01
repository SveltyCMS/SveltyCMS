export interface PriceProps {
	/** List of allowed currencies. If empty, all are allowed (or a default set). */
	allowedCurrencies?: string[];
	/** Default currency Code (ISO 4217, e.g., 'USD', 'EUR') */
	defaultCurrency?: string;

	/** Maximum amount */
	max?: number;

	/** Minimum amount */
	min?: number;

	/** Step for the number input (e.g. 0.01) */
	step?: number;

	[key: string]: unknown;
}

export interface PriceValue {
	amount: number | null;
	currency: string;
}
