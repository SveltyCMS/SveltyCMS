/**
 * @file src/widgets/widgetManager.ts
 * @description Widget Manager for handling widget loading, activation, and configuration
 */

import { writable, type Writable, get } from 'svelte/store';
import deepmerge from 'deepmerge';

// System Logger
import { logger } from '@utils/logger.svelte';

// Types
import type { User, WidgetId } from '@src/auth/types';
import type { Field, Schema } from '@src/collections/types';

export type WidgetStatus = 'active' | 'inactive';

// Define ModifyRequestParams type locally to avoid circular dependency
export type ModifyRequestParams<T> = {
	collection: Schema;
	id?: WidgetId;
	field: Field;
	data: { get: () => T; update: (newData: T) => void };
	user: User;
	type: 'GET' | 'POST' | 'DELETE' | 'PATCH';
	meta_data?: Record<string, unknown>;
};

export interface WidgetConfig {
	name: string;
	status: WidgetStatus;
	config?: Record<string, unknown>;
}

export interface Widget<T = unknown> {
	Name: string;
	Description?: string;
	Icon?: string;
	modifyRequest?: (params: ModifyRequestParams<T>) => Promise<Record<string, unknown>>;
	aggregations?: Record<string, unknown>;
}

export interface WidgetFunction<T = unknown> extends Widget<T> {
	(params: Record<string, unknown>): {
		widget: Widget<T>;
		type: string;
		config: Record<string, unknown>;
	};
}

export interface WidgetModule {
	default: Widget;
}

// Store for active widgets
export const activeWidgets: Writable<string[]> = writable([]);

// Import core widgets
import date from '@src/widgets/core/date/index';
import dateTime from '@src/widgets/core/dateTime/index';
import email from '@src/widgets/core/email/index';
import input from '@src/widgets/core/input/index';
import mediaUpload from '@src/widgets/core/mediaUpload/index';
import number from '@src/widgets/core/number/index';
import relation from '@src/widgets/core/relation/index';
import richText from '@src/widgets/core/richText/index';

// Import custom widgets
import address from '@src/widgets/custom/address/index';
import checkbox from '@src/widgets/custom/checkbox/index';
import colorPicker from '@src/widgets/custom/colorPicker/index';
import currency from '@src/widgets/custom/currency/index';
import dateRange from '@src/widgets/custom/dateRange/index';
import megaMenu from '@src/widgets/custom/megaMenu/index';
import phoneNumber from '@src/widgets/custom/phoneNumber/index';
import radio from '@src/widgets/custom/radio/index';
import rating from '@src/widgets/custom/rating/index';
import remoteVideo from '@src/widgets/custom/remoteVideo/index';
import seo from '@src/widgets/custom/seo/index';

// Load all available widgets
export function loadWidgets() {
    const widgets: Record<string, any> = {};
    
    try {
        // Core widgets
        const coreWidgets = {
            input, date, dateTime, email, mediaUpload,
            number, relation, richText
        };

        // Custom widgets
        const customWidgets = {
            address, checkbox, colorPicker, currency,
            dateRange, megaMenu, phoneNumber, radio,
            rating, remoteVideo, seo
        };
        
        // Helper function to process widgets
        const processWidgets = (modules: Record<string, any>) => {
            for (const [name, widget] of Object.entries(modules)) {
                if (!widget) {
                    logger.error(`Widget ${name} is undefined`);
                    continue;
                }

                // Create widget function
                const widgetFn = ((params: Record<string, unknown>) => {
                    return {
                        widget,
                        type: widget.Name,
                        config: params,
                        ...params
                    };
                }) as WidgetFunction;

                // Add metadata to the function
                Object.assign(widgetFn, {
                    Name: widget.Name,
                    Description: widget.Description,
                    Icon: widget.Icon,
                    modifyRequest: widget.modifyRequest,
                    aggregations: widget.aggregations
                });

                widgets[name] = widgetFn;
            }
        };

        // Process both core and custom widgets
        processWidgets(coreWidgets);
        processWidgets(customWidgets);

        logger.info('Widgets loaded successfully:', Object.keys(widgets));
    } catch (error) {
        logger.error('Error loading widgets:', error);
        // Return empty object on error to prevent crashes
        return {};
    }

    return widgets;
}

// Initialize widgets
export const widgets = loadWidgets();

// Create default export with all widget functionality
const widgetManager = {
    ...widgets,
    loadWidgets,
    getActiveWidgets,
    updateWidgetStatus,
    getWidgetConfig,
    updateWidgetConfig,
    activeWidgets
};

export default widgetManager;

// Get active widgets from local storage or API
export async function getActiveWidgets(): Promise<string[]> {
	try {
		const stored = localStorage.getItem('activeWidgets');
		if (stored) {
			const parsed = JSON.parse(stored);
			activeWidgets.set(parsed);
			return parsed;
		}
	} catch (error) {
		logger.error('Failed to get active widgets:', error as Error);
	}

	// Default to all widgets being active
	const allWidgets = Object.keys(widgets);
	activeWidgets.set(allWidgets);
	return allWidgets;
}

// Update widget status
export async function updateWidgetStatus(widgetName: string, status: WidgetStatus): Promise<void> {
	try {
		const active = status === 'active';
		const currentActive = get(activeWidgets);

		if (active && !currentActive.includes(widgetName)) {
			currentActive.push(widgetName);
		} else if (!active) {
			const index = currentActive.indexOf(widgetName);
			if (index > -1) {
				currentActive.splice(index, 1);
			}
		}

		activeWidgets.set(currentActive);
		localStorage.setItem('activeWidgets', JSON.stringify(currentActive));
	} catch (error) {
		logger.error('Failed to update widget status:', error as Error);
		throw error;
	}
}

// Get widget configuration
export function getWidgetConfig(widgetName: string): WidgetConfig | undefined {
	try {
		const stored = localStorage.getItem(`widget_${widgetName}`);
		return stored ? JSON.parse(stored) : undefined;
	} catch (error) {
		logger.error('Failed to get widget config:', error as Error);
		return undefined;
	}
}

// Update widget configuration
export function updateWidgetConfig(widgetName: string, config: Partial<WidgetConfig>): void {
	try {
		const current = getWidgetConfig(widgetName) || { name: widgetName };
		const updated = deepmerge(current, config);
		localStorage.setItem(`widget_${widgetName}`, JSON.stringify(updated));
	} catch (error) {
		logger.error('Failed to update widget config:', error as Error);
	}
}
