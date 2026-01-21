/**
 * @file src/plugins/pagespeed/types.ts
 * @description Type definitions for Google PageSpeed Insights plugin
 */
import type { DatabaseId, ISODateString } from '@databases/dbInterface';

// PageSpeed result stored in database
export interface PageSpeedResult {
	_id: DatabaseId;
	entryId: string;
	collectionId: string;
	tenantId: string;
	language: string;
	device: 'mobile' | 'desktop';
	url: string;

	// Core Web Vitals
	performanceScore?: number; // 0-100
	fcp?: number; // First Contentful Paint (ms)
	lcp?: number; // Largest Contentful Paint (ms)
	cls?: number; // Cumulative Layout Shift
	tti?: number; // Time to Interactive (ms)
	tbt?: number; // Total Blocking Time (ms)
	si?: number; // Speed Index (ms)

	// Metadata
	fetchedAt: Date;
	createdAt: ISODateString;
	updatedAt: ISODateString;
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
