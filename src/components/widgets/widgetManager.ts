/**
 * @file src/components/widgets/widgetManager.ts
 * @description Widget Manager for handling widget loading, activation, and configuration
 */

import { browser } from '$app/environment';
import { writable, type Writable, get } from 'svelte/store';
import { logger } from '@utils/logger';
import deepmerge from 'deepmerge';

// Types
import type { ModifyRequestParams } from './index';

export type WidgetStatus = 'active' | 'inactive';

export interface WidgetConfig {
  name: string;
  status: WidgetStatus;
  config?: Record<string, any>;
}

export interface Widget {
  Name: string;
  description?: string;
  icon?: string;
  modifyRequest?: (params: ModifyRequestParams<any>) => Promise<any>;
}

export interface WidgetModule {
  default: Widget;
}

// Store for active widgets
export const activeWidgets: Writable<string[]> = writable([]);

// Load all available widgets synchronously
export function loadWidgets() {
  const widgetModules = import.meta.glob<WidgetModule>('./**/index.ts', { eager: true });
  const widgets: Record<string, any> = {};

  // Process each widget module
  for (const path in widgetModules) {
    try {
      const module = widgetModules[path];
      if (module?.default) {
        const widget = module.default;
        // Create widget function that returns the widget configuration
        widgets[widget.Name] = (params: any) => {
          return {
            widget,
            type: widget.Name,
            config: params,
            ...params
          };
        };
        // Add metadata to the function
        Object.assign(widgets[widget.Name], {
          Name: widget.Name,
          Description: widget.description,
          Icon: widget.icon
        });
      }
    } catch (error) {
      logger.error(`Failed to load widget from ${path}:`, error as Error);
    }
  }

  return widgets;
}

// Initialize widgets synchronously
export const widgets = loadWidgets();

// Get active widgets from local storage or API
export async function getActiveWidgets(): Promise<string[]> {
  if (!browser) return Object.keys(widgets); // During SSR, return all widgets as active
  
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
  if (!browser) return;

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
  if (!browser) return undefined;

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
  if (!browser) return;

  try {
    const current = getWidgetConfig(widgetName) || { name: widgetName };
    const updated = deepmerge(current, config);
    localStorage.setItem(`widget_${widgetName}`, JSON.stringify(updated));
  } catch (error) {
    logger.error('Failed to update widget config:', error as Error);
  }
}
