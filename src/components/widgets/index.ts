import type { Model, User, WidgetId } from '@src/auth/types';
// import { getActiveWidgets } from '@src/routes/(app)/config/widgetManagement/widgetManager';

// // System logger
// import { logger } from '@src/utils/logger';

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
import FileUpload from './fileUpload';
import ImageArray from './imageArray';
// import ImageEditor from './imageEditor';
// import ImageEditorPage from './imageEditorPage';
import ImageUpload from './imageUpload';
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

// Define the widget object
const widgets = {
	Address, // Address flexible Address fields
	Checkbox, // Checkbox - boolean true / false checkbox
	ColorPicker, // Color Picker - choice of color
	Currency, // Currency - define input with a currency string and suffix
	Date, // Date - date field that saves a timestamp
	DateTime, // Date - date / time field that saves a timestamp
	DateRange, // DateRange - date with start / Finish timestamps
	Email, // Email - validates the entry is a properly formatted email
	// Group, // Group - nest fields within an object with condition & tabs
	FileUpload, // FileUpload - allows File uploading
	ImageUpload, // ImageUpload - allows image upload with editor
	ImageArray, // ImageArray - allows multiple image upload with editor
	MegaMenu, // MegaMenu - Flexible Menu with possible hierarchy
	Number, // Number - field that enforces that its value be a number
	PhoneNumber, // PhoneNumber - Field checking for phone/Fax numbers
	Radio, // Radio - radio button group, allowing only one value to be selected
	Rating, // Relation - assign relationships to other collections
	Relation, // Rating - Visual representation of a numeric range.
	RemoteVideo, // RemoteVideo - for youtube/vimeo(/Twitch/ticktock), grabbing Title/Duration,Dimension,User
	RichText, // Rich Text - fully extensible Lexical Rich Text editor
	// RichTextLexical, // Lexical Rich Text - fully extensible Lexical Rich Text editor
	// SelectList, // SelectList - dropdown / pick list style value selector
	Seo, // Seo - Basic Seo Title /Description with preview
	Text // Text - A Simple text input
	// Textarea, // Textarea - allows a bit larger of a text editor
	// Url // Url - Link to internal / External hyperlinks
};

// Widgets container
// const widgets: Record<string, any> = {};

// Dynamic import function
// async function importWidget(widgetName: string) {
// 	try {
// 		const module = await import(`./${widgetName}`);
// 		return module.default;
// 	} catch (error) {
// 		logger.error(`Failed to import widget: ${widgetName}`, error as Error);
// 		throw new Error(`Widget module for ${widgetName} not found.`);
// 	}
// }
// Initialize widgets
// export async function initWidgets() {
// 	try {
// 		const activeWidgets: string[] = await getActiveWidgets();

// 		for (const widgetName of activeWidgets) {
// 			const widgetModule = await importWidget(widgetName);
// 			widgets[widgetName] = widgetModule;
// 		}
// 		globalThis.widgets = widgets;
// 		logger.info('Widgets initialized successfully.');
// 	} catch (error) {
// 		if (error instanceof Error) {
// 			logger.error(`Failed to initialize widgets: ${error.message}`);
// 		} else {
// 			logger.error('Failed to initialize widgets: unknown error');
// 		}
// 	}
// }

// Ensure widgets are initialized before using them
// await initWidgets();

// Define the widget types
type K = (typeof widgets)[keyof typeof widgets]['Name'];

// Define the modifyRequest function
export type ModifyRequestParams<T extends (...args: any) => any> = {
	collection: Model<any>;
	id?: WidgetId;
	field: ReturnType<T>;
	data: { get: () => any; update: (newData: any) => void };
	user: User;
	type: 'GET' | 'POST' | 'DELETE' | 'PATCH';
	meta_data?: { [key: string]: any };
};

// Define the widget type
export type WidgetType = {
	[key in K]: (typeof widgets)[key] & {
		modifyRequest: (args: ModifyRequestParams<(typeof widgets)[keyof typeof widgets]>) => Promise<object>;
	};
};

// Expose the widgets
export const initWidgets = () => (globalThis.widgets = widgets);
initWidgets(); // Initialize
export default widgets as WidgetType;
