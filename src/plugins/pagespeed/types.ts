/**
 * @file src/plugins/pagespeed/types.ts
 * @description Type definitions for Google PageSpeed Insights plugin
 */
import type { DatabaseId, ISODateString } from '@databases/dbInterface';

// PageSpeed result stored in database
export interface PageSpeedResult {
	_id: DatabaseId;
	cls?: number; // Cumulative Layout Shift
	collectionId: string;
	createdAt: ISODateString;
	device: 'mobile' | 'desktop';
	entryId: string;
	fcp?: number; // First Contentful Paint (ms)

	// Metadata
	fetchedAt: Date;
	language: string;
	lcp?: number; // Largest Contentful Paint (ms)

	// Core Web Vitals
	performanceScore?: number; // 0-100
	si?: number; // Speed Index (ms)
	tbt?: number; // Total Blocking Time (ms)
	tenantId: string;
	tti?: number; // Time to Interactive (ms)
	updatedAt: ISODateString;
	url: string;
}

// Google PageSpeed API response (simplified)
export interface GooglePageSpeedResponse {
	lighthouseResult: {
		categories: {
			performance: {
				score: number;
			};
		};
		audits: {
			'first-contentful-paint': { numericValue: number };
			'largest-contentful-paint': { numericValue: number };
			'cumulative-layout-shift': { numericValue: number };
			interactive: { numericValue: number };
			'total-blocking-time': { numericValue: number };
			'speed-index': { numericValue: number };
		};
	};
}
