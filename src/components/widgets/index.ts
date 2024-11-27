/**
@file src/components/widgets/index.ts
@description - Widgets index file to import all widgets and initialize them.
*/

import type { Model, User, WidgetId } from '@src/auth/types';
// import { activeWidgets, loadWidgets } from './widgetManager';
// System logger
import { logger } from '@utils/logger.svelte';

// Widgets
import Address from './address';
import Checkbox from './checkbox';
import Currency from './currency';
import ColorPicker from './colorPicker';
import Date from './date';
import DateTime from './dateTime';
import DateRange from './dateRange';
import Email from './email';
// import Group from './group';
import MediaUpload from './mediaUpload';
import MegaMenu from './megaMenu';
import Number from './number';
import PhoneNumber from './phoneNumber';
import Radio from './radio';
import Rating from './rating';
import Relation from './relation';
import RemoteVideo from './remoteVideo';
import RichText from './richText';
// import SelectList from './selectList';
import Seo from './seo';
import Text from './text';

// Define ModifyRequestParams type
export type ModifyRequestParams<T extends (...args: any) => any> = {
	collection: Model<any>;
	id?: WidgetId;
	field: ReturnType<T>;
	data: { get: () => any; update: (newData: any) => void };
	user: User;
	type: 'GET' | 'POST' | 'DELETE' | 'PATCH';
	meta_data?: { [key: string]: any };
};

// Initialize widgets object with all available widgets
const widgetsInit = {
	Address, // Address flexible Address fields
	Checkbox, // Checkbox - boolean true / false checkbox
	ColorPicker, // Color Picker - choice of color
	Currency, // Currency - define input with a currency string and suffix
	Date, // Date - date field that saves a timestamp
	DateTime, // DateTime - date and time field that saves a timestamp
	DateRange, // DateRange - date range field that saves two timestamps
	Email, // Email - email field with validation
	MediaUpload, // MediaUpload - upload media files
	MegaMenu, // MegaMenu - menu builder
	Number, // Number - number field with validation
	PhoneNumber, // PhoneNumber - phone number field with validation
	Radio, // Radio - radio button field
	Rating, // Rating - rating field
	Relation, // Relation - relation field
	RemoteVideo, // RemoteVideo - remote video field
	RichText, // RichText - rich text editor
	Seo, // Seo - seo fields
	Text // Text - text field
};

// Define widget types after initialization
type K = (typeof widgetsInit)[keyof typeof widgetsInit]['Name'];

export type WidgetType = {
	[key in K]: (typeof widgetsInit)[keyof typeof widgetsInit] & {
		modifyRequest: (args: ModifyRequestParams<(typeof widgetsInit)[keyof typeof widgetsInit]>) => Promise<object>;
	};
};

// Export widgets object for direct use
export const widgets = widgetsInit;

// Create and initialize widgets object
const widgetsInstance = widgetsInit as WidgetType;

// Export initWidgets function that ensures widgets are properly initialized
export function initWidgets(): void {
	try {
		logger.info('Widgets initialized successfully');
	} catch (error) {
		logger.error('Failed to initialize widgets:', error);
	}
}

// Export a function to get the widgets object
export function getWidgets() {
	return widgetsInstance;
}

// Export default widgets object
export default widgetsInstance;
