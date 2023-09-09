// import Address from './address';
import Checkbox from './checkbox';
import Currency from './currency';
import ColorPicker from './colorPicker';
import Date from './date';
import DateTime from './dateTime';
// import DateRange from './dateRange';
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
import Relation from './relation';
import RemoteVideo from './remoteVideo';
import RichText from './richText';
// import SelectList from './selectList';
import Seo from './seo';
import Text from './text';

const widgets = {
	// Address flexible Address fields
	// Address,
	// Checkbox - boolean true / false checkbox
	Checkbox,
	// Color Picker - choice of color
	ColorPicker,
	// Currency - define input with a currency string and suffix
	Currency,
	// Date - date field that saves a timestamp
	Date,
	// Date - date / time field that saves a timestamp
	DateTime,
	// DateRange - date with start / Finish timestamps
	// DateRange,
	// Email - validates the entry is a properly formatted email
	Email,
	// Group - nest fields within an object with condition & tabs
	// Group,
	// FileUpload - allows File uploading
	FileUpload,
	// ImageUpload - allows image upload with editor
	ImageUpload,
	// ImageArray - allows multiple image upload with editor
	ImageArray,
	// Image Editor - Crop / Blur / Rotation and Save upload to Webp
	// ImageEditor,
	// ImageEditorPage,
	// MegaMenu - Flexible Menu with possible hierarchy
	MegaMenu,
	// Number - field that enforces that its value be a number
	Number,
	// PhoneNumber - Field checking for phone/Fax numbers
	PhoneNumber,
	// Radio - radio button group, allowing only one value to be selected
	Radio,
	// Relation - assign relationships to other collections
	Relation, // :Relation,
	// RemoteVideo - for youtube/vimeo(/Twitch/ticktock), grabbing Title/Duration,Dimension,User
	RemoteVideo,
	// Rich Text - fully extensible Lexical Rich Text editor
	RichText,
	// SelectList - dropdown / pick list style value selector
	// SelectList,
	// Seo - Basic Seo Title /Description with preview
	Seo,
	// Text - simple text input
	Text
	// Textarea - allows a bit larger of a text editor
	// Textarea,
	// Url - Link to internal / External hyperlinks
	// Url
};

type K = ReturnType<(typeof widgets)[keyof typeof widgets]>['widget']['key'];
type WidgetType = { [key in K]: (typeof widgets)[key] };
export const initWidgets = () => (globalThis.widgets = widgets);
export default widgets as WidgetType;
