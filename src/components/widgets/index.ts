/**
@file src/components/widgets/index.ts
@description - Widgets index file to import all widgets and initialize them.
*/

import type { Model, User, WidgetId } from '@src/auth/types';
// import { activeWidgets, loadWidgets } from './widgetManager';
// System logger
import { logger } from '@utils/logger';

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
	DateTime, // Date - date / time field that saves a timestamp
	DateRange, // DateRange - date with start / Finish timestamps
	Email, // Email - validates the entry is a properly formatted email
	// Group, // Group - nest fields within an object with condition & tabs
	MediaUpload, // MediaUpload - for uploading Media like images, videos, audio
	MegaMenu, // MegaMenu - Flexible Menu with possible hierarchy
	Number, // Number - field that enforces that its value be a number
	PhoneNumber, // PhoneNumber - Field checking for phone/Fax numbers
	Radio, // Radio - radio button group, allowing only one value to be selected
	Rating, // Relation - assign relationships to other collections
	Relation, // Rating - Visual representation of a numeric range.
	RemoteVideo, // RemoteVideo - for youtube/vimeo(/Twitch/ticktock), grabbing Title/Duration,Dimension,User
	RichText, // Rich Text - fully extensible Lexical Rich Text editor
	// SelectList, // SelectList - dropdown / pick list style value selector
	Seo, // Seo - Basic Seo Title /Description with preview
	Text // Text - A Simple text input
	// Textarea, // Textarea - allows a bit larger of a text editor
	// Url // Url - Link to internal / External hyperlinks
};

// Define widget types after initialization
type K = (typeof widgetsInit)[keyof typeof widgetsInit]['Name'];

export type WidgetType = {
	[key in K]: (typeof widgetsInit)[keyof typeof widgetsInit] & {
		modifyRequest: (args: ModifyRequestParams<(typeof widgetsInit)[keyof typeof widgetsInit]>) => Promise<object>;
	};
};

// Create and initialize widgets object
const widgets = widgetsInit as WidgetType;

// Export initWidgets function that ensures widgets are properly initialized
export function initWidgets(): void {
	try {
		// Initialize global widgets
		if (typeof globalThis !== 'undefined') {
			(globalThis as any).widgets = widgets;
		}
		logger.info('Widgets initialized successfully');
	} catch (error) {
		logger.error('Failed to initialize widgets:', error as Error);
		throw new Error('Widget initialization failed');
	}
}

// Export a function to get the widgets object
export function getWidgets() {
	return widgets;
}

// Export default widgets object
export default widgets;
