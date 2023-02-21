import Text from './text';
import RichText from './richText';
import Relation from './relation';
import MegaMenu from './megaMenu';
import ImageArray from './imageArray';
import ImageEditorPage from './imageEditorPage';
import ImageEditor from './imageEditor';
import ImageUpload from './imageUpload';
import Date from './date';
import DateRange from './dateRange';
import Email from './email';
import Url from './url';
import Checkbox from './checkbox';
import Radio from './radio';
import Number from './number';
import PhoneNumber from './phoneNumber';
import Group from './group';
import SelectList from './selectList';
import Address from './address';
import Seo from './seo';
import RemoteVideo from './remoteVideo';

export type Widgets = {
	Address: typeof Address;
	Checkbox: typeof Checkbox;
	Date: typeof Date;
	DateRange: typeof DateRange;
	Email: typeof Email;
	Group: typeof Group;
	ImageUpload: typeof ImageUpload;
	ImageArray: typeof ImageArray;
	ImageEditorPage: typeof ImageEditorPage;
	ImageEditor: typeof ImageEditor;
	MegaMenu: typeof MegaMenu;
	Number: typeof Number;
	PhoneNumber: typeof Number;
	Radio: typeof Radio;
	Relation: typeof Relation;
	RichText: typeof RichText;
	SelectList: typeof SelectList;
	Text: typeof Text;
	Url: typeof Url;
	Seo: typeof Seo;
	RemoteVideo: typeof RemoteVideo;
};

const widgets: Widgets = {
	/**text widget does all good stuff*/

	// Address flexible Address fields
	Address,
	// Array - for repeating content, supports nested fields
	//Array,
	// Blocks - block-based fields, allowing powerful layout creation
	//Blocks,
	// Checkbox - boolean true / false checkbox
	Checkbox,
	// Code - code editor that saves a string to the database
	//Code,
	// Collapsible - used for admin layout, nest fields within a collapsible component
	//Collapsible,
	// Date - date / time field that saves a timestamp
	Date,
	// DateRange - date with start / Finish timestamps
	DateRange,
	// Email - validates the entry is a properly formatted email
	Email,
	// Group - nest fields within an object
	Group,
	// ImageUpload - allows image upload with editor
	ImageUpload,
	// ImageArray - allows multiple image upload with editor
	ImageArray,
	// Image Editor - Crop / Blur / Rotation and Save upload to Webp
	ImageEditor,
	ImageEditorPage,
	// MegaMenu - Flexible Menu with possible hierachie
	MegaMenu,
	// Number - field that enforces that its value be a number
	Number,
	// Geolocation - geometric coordinates for location data
	//Geolocation,
	// PhoneNumber - Field checking for phone/Fax numbers
	PhoneNumber,
	// Radio - radio button group, allowing only one value to be selected
	Radio,
	// Range - specific rangeslider with Values
	//Range,
	// Relation - assign relationships to other collections
	Relation,
	// RemoteVideo - for youtube/vimeo(/Twich/tiktok), grabbing Title/Duration,Dimention,User
	RemoteVideo,
	// Rich Text - fully extensible Lexical Rich Text editor
	RichText,
	// Row - used for admin field layout, no effect on data shape
	//Row,
	// SelectList - dropdown / picklist style value selector
	SelectList,
	// Seo - Basic Seo Title /Descritption with preview
	Seo,
	// Tabs
	//Tabs,
	// Text - simple text input
	Text,
	// Textarea - allows a bit larger of a text editor
	//Textarea,
	// Upload - allows local file and image upload
	//Upload
	// Url - Link to internal / External hyperlinks
	Url
} as const;
export default widgets;
