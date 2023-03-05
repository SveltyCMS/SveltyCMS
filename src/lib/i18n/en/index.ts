import type { BaseTranslation } from '../i18n-types';

const en: BaseTranslation = {
	// Test
	HI: 'Hi {name:string}! Translation it works!',

	// SideBar left
	SBL_Search: 'Search ...',
	SBL_Admin: 'Admin',
	SBL_Admin_User: 'Admin User',
	SBL_SystemLanguage: 'System Language',
	SBL_English: 'English',
	SBL_German: 'German',
	SBL_isDark: 'Switch to',
	SBL_Light: 'Light',
	SBL_Dark: 'Dark',
	SBL_Mode: 'Mode',
	SBL_Version: 'Version',
	SBL_Ver: 'Ver.',
	SBL_Save: 'Save',
	SBL_Save_message: 'Data saved successfully',
	SBL_SignOut: 'Sign Out',

	// SideBar Right

	// ERROR
	ERROR_Pagenotfound: 'Page Not Found',
	ERROR_Wrong: 'We are sorry, something went wrong.',
	ERROR_GoHome: 'Go to Front Page',

	// USER
	USER_Setting: 'User Settings',
	USER_ID: 'User ID',
	USER_Username: 'Username',
	USER_FirstName: 'First Name',
	USER_LastName: 'Last Name',
	USER_Email: 'Email',
	USER_Password: 'Password',
	USER_Edit: 'Edit User Settings',
	USER_Fail: 'Email already in use',
	USER_Delete: 'Delete User',
	USER_Profile: 'User Profile',
	USER_Edit_Avatar: 'Edit Avatar',
	USER_Role: 'Role',
	USER_Generate: 'Email User Registion token',
	USER_ListShow: 'Show user list',
	USER_ListCollapse: 'Collapse user list',
	USER_EmailToken: 'Email User Registion token',

	// Login
	LOGIN_SignIn: 'Sign In',
	LOGIN_SignUp: 'Sign Up',
	LOGIN_Required: '* Required',
	LOGIN_Username: 'Username',
	LOGIN_EmailAddress: 'Email Address',
	LOGIN_Password: 'Password',
	LOGIN_Token: 'Registration Token',
	LOGIN_ConfirmPassword: 'Confirm Password',
	LOGIN_ForgottenPassword: 'Forgotten Password',
	LOGIN_SendResetMail: 'Send Password Reset Email',
	LOGIN_ResetPassword: 'Reset Password',
	LOGIN_ResetPasswordSave: 'Save New Password',

	LOGIN_ZOD_Username_string: 'Username is required',
	LOGIN_ZOD_Username_regex: 'Name can only contain letters, digits and @$!%*#',
	LOGIN_ZOD_Username_min: 'Name must be at least 2 charactes',
	LOGIN_ZOD_Username_max: 'Name can only be 24 charactes',
	LOGIN_ZOD_Email_string: 'Email is required',
	LOGIN_ZOD_Email_email: 'Email must be a valid email',
	LOGIN_ZOD_Password_string: 'Password is required',
	LOGIN_ZOD_Password_regex:
		'Password must be a minimum of 8 characters & contain at least one letter, one number, and one special character.',
	LOGIN_ZOD_Confirm_password_string: 'Confirm Password is required',
	LOGIN_ZOD_Confirm_password_regex:
		'Password must be a minimum of 8 characters & contain at least one letter, one number, and one special character.',
	LOGIN_ZOD_Token_string: 'Auth Token is required',
	LOGIN_ZOD_Password_match: 'Password & Confirm password must match',

	LOGIN_ZOD_General_Unkown: 'Unknown error occurred',
	LOGIN_ZOD_General_Error: 'Invalid input',
	LOGIN_ZOD_Email_Error_inUse: 'Email already in use',
	LOGIN_ZOD_Email_Error_send: 'Error sending mail',
	LOGIN_ZOD_Email_Error_Signup: 'LOGIN_ZOD_Signup_unkown',
	LOGIN_ZOD_Email_Error_SignupKey: 'Incorrect email or password.',
	LOGIN_ZOD_Token_Error: 'Token is wrong!',
	LOGIN_ZOD_Token_Expired: 'Token has expired!',
	LOGIN_ZOD_Forgotton_Error: 'No account under this email',
	LOGIN_ZOD_Forgotton_email:
		'Hi there,<br><br>We received a request to reset your password. Your password reset token is:<br><br>{token:string}<br> <br>Please follow the link below to reset your password:<br>{link:string}<br><br>If you did not request this reset, please disregard this message.<br><br>Best regards,<br>The Support Team',

	// Entry List
	ENTRYLIST_Create: 'Create',
	ENTRYLIST_Publish: 'Publish',
	ENTRYLIST_Unpublish: 'Unpublish',
	ENTRYLIST_Schedule: 'Schedule',
	ENTRYLIST_Clone: 'Clone',
	ENTRYLIST_Delete: 'Delete',
	ENTRYLIST_Delete_title: 'Please Confirm Deletion !!',
	ENTRYLIST_Delete_body: 'Are you sure you wish to proceed?',
	ENTRYLIST_Delete_cancel: 'Cancel',
	ENTRYLIST_Delete_confirm: 'Confirm',
	ENTRYLIST_Search: 'Search',
	ENTRYLIST_Loading: 'Loading...',
	ENTRYLIST_Showing: 'Showing',
	ENTRYLIST_to: 'to',
	ENTRYLIST_of: 'of',
	ENTRYLIST_Entries: 'Entries',
	ENTRYLIST_EntriesItems: 'Entries',
	ENTRYLIST_Previous: 'Previous',
	ENTRYLIST_Next: 'Next',

	// Fields

	// Form
	FORM_Create: 'Create',
	FORM_CloseMenu: 'Close Menu',
	FORM_TT_Closes: 'Close without saving',
	FORM_Required: 'Required',

	// Alert

	// Collections
	Collections: 'Collections',
	Media: 'Media',

	COLLECTION_TEST_User: 'User',
	COLLECTION_TEST_Prefix: 'Prefix',
	COLLECTION_TEST_Prefix_placeholder: 'Enter Prefix',
	COLLECTION_TEST_First: 'First',
	COLLECTION_TEST_First_placeholder: 'Enter First Name',
	COLLECTION_TEST_Middle: 'Middle',
	COLLECTION_TEST_Middle_placeholder: 'Middle  (ReadOnly)',
	COLLECTION_TEST_Last: 'Last',
	COLLECTION_TEST_Last_placeholder: 'Enter Last Name',

	// Widgets
	WIDGET_Address_SearchMap: 'Search in Map ...',
	WIDGET_Address_GetAddress: 'Get from Address',
	WIDGET_Address_GetMap: 'Get from Address',
	WIDGET_Address_Geocoordinates: 'Geocoordinates',
	WIDGET_Address_Latitude: 'Latitude',
	WIDGET_Address_Longitude: 'Longitude',
	WIDGET_Address_Name: 'Name',
	WIDGET_Address_Street: 'Street address',
	WIDGET_Address_Zip: 'ZIP or Postal Code',
	WIDGET_Address_City: 'City',
	WIDGET_Address_SearchCountry: 'Search Country ...',

	WIDGET_Relation_ChoseExisting: 'Chose existing...',
	WIDGET_Relation_Edit: 'Edit',
	WIDGET_Relation_AddNew: 'Add New',

	WIDGET_Seo_Suggetion_TitlePerfect: 'Your title is more than 50 characters. Perfect!',
	WIDGET_Seo_Suggetion_TitleGood: 'Your title is more than 30 characters. Try 50+. Good!',
	WIDGET_Seo_Suggetion_TitleBad:
		'Your title is too short. Make sure your title is at least 50 characters. Bad!',
	WIDGET_Seo_Suggetion_DescriptionPerfect:
		'Your description is between 120 and 165 characters. Perfect!',
	WIDGET_Seo_Suggetion_DescriptionGood: 'Your description is more than 90 characters. Good!',
	WIDGET_Seo_Suggetion_DescriptionBad: 'Your description is less than 90 characters. Bad!',
	WIDGET_Seo_Suggetion_SentencePerfect: 'Your description is 2 to 4 sentences long. Perfect!',
	WIDGET_Seo_Suggetion_SentenceBad:
		'Your descripton is only 1 sentence long. Make sure your description is 2 to 4 sentences long.',

	WIDGET_Seo_Suggetion_NumberPerfect: 'Your title uses numbers. Perfect!',
	WIDGET_Seo_Suggetion_NumberBad:
		'Your title does not use numbers. The use of numbers in your title can increase your CTR.',
	WIDGET_Seo_Suggetion_PowerWordTitle: `Your title has the Power Word word Perfect!`,
	WIDGET_Seo_Suggetion_PowerWordDescription: `Your description uses the Power Word word. Perfect!`,
	WIDGET_Seo_Suggetion_ctaKeywordsTitle: `Your title has the CTA keyword keyword. Good!`,
	WIDGET_Seo_Suggetion_ctaKeywordsDescription: `Your description uses the CTA keyword keyword. Good!`,
	WIDGET_Seo_Suggetion_Title: 'Title:',
	WIDGET_Seo_Suggetion_Character: 'Character:',
	WIDGET_Seo_Suggetion_WidthDesktop: '- Desktop:',
	WIDGET_Seo_Suggetion_WidthMobile: 'Mobile: ',
	WIDGET_Seo_Suggetion_SeoTitle: 'SEO Title: ',
	WIDGET_Seo_Suggetion_Description: 'Description:',
	WIDGET_Seo_Suggetion_SeoDescription: 'SEO Description',
	WIDGET_Seo_Suggetion_SeoPreview: 'SEO Preview',
	WIDGET_Seo_Suggetion_ListOfSuggestion: 'SEO Suggestions:',
	WIDGET_Seo_Suggetion_Text:
		'Optimize title & description for Google search results, to improve the visual appeal to brings more clicks to your website.'
};

export default en;
