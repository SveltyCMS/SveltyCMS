import { g as getLocale } from './runtime.js';
const db_error_title$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Database Connection Error`
		);
	};
const db_error_description$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`We cannot connect to the database. This usually means the database server is down or the configuration is incorrect.`
		);
	};
const db_error_reason_label$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Error Reason:`
		);
	};
const db_error_solutions_title$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Possible Solutions:`
		);
	};
const db_error_solution_1$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Check if your database server is running.`
		);
	};
const db_error_solution_2$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Verify the connection string in your configuration.`
		);
	};
const db_error_solution_3$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Check firewall settings and network connectivity.`
		);
	};
const db_error_solution_4$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Contact support if the issue persists.`
		);
	};
const db_error_reset_setup$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Reset Setup`
		);
	};
const db_error_refresh_page$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Refresh Page`
		);
	};
const entrylist_no_collection2$2 =
	/** @type {(inputs: { name: NonNullable<unknown> }) => LocalizedString} */
	(i) => {
		return (
			/** @type {LocalizedString} */
			`No Collection ${i?.name} Data`
		);
	};
const fields_no_widgets_found1$2 =
	/** @type {(inputs: { name: NonNullable<unknown> }) => LocalizedString} */
	(i) => {
		return (
			/** @type {LocalizedString} */
			`Widget not found: ${i?.name}`
		);
	};
const fields_preview1$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Preview`
		);
	};
const widgetbuilder_addcolectionfield5$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Add Collection Field`
		);
	};
const adminarea_adminarea$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Admin Area:`
		);
	};
const adminarea_emailtoken$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Email User Registration token`
		);
	};
const adminarea_hideuserlist$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Hide User List`
		);
	};
const adminarea_nouser$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`No User Found`
		);
	};
const adminarea_showtoken$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Show User Token`
		);
	};
const adminarea_title$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Generate a New User Registration Token`
		);
	};
const adminarea_userlist$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`User List:`
		);
	};
const applayout_contentlanguage$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Content Language`
		);
	};
const applayout_systemlanguage$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`System Language`
		);
	};
const applayout_version$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Ver.`
		);
	};
const button_archive$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Archive`
		);
	};
const button_back$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Back`
		);
	};
const button_cancel$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Cancel`
		);
	};
const button_confirm$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Confirm`
		);
	};
const button_delete$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Delete`
		);
	};
const button_edit$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Edit`
		);
	};
const button_next$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Next`
		);
	};
const button_previous$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Previous`
		);
	};
const button_save$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Save`
		);
	};
const button_send$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Send`
		);
	};
const button_test$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Test`
		);
	};
const collection_dbname2$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Database Name`
		);
	};
const collection_addcategory$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Add Category`
		);
	};
const collection_add$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Add Collection`
		);
	};
const collection_description$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Create categories or collections, then drag & drop to arrange them. Add a short description to explain the collection.`
		);
	};
const collection_description_placeholder$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Describe your Collection`
		);
	};
const collection_helptext$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`This builder will help you to setup a Content Collection`
		);
	};
const collection_name$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Name`
		);
	};
const collection_name_placeholder$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Collection Unique Name`
		);
	};
const collection_name_tooltip1$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Enter a Name that best identifies your collection.`
		);
	};
const collection_name_tooltip2$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`The displayed Name is optimized in for your database and saved as shown under Database Name`
		);
	};
const collection_icon_tooltip$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Choose an icon to represent this collection in the interface`
		);
	};
const collection_pagetitle$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Collection Builder`
		);
	};
const collection_required$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Required`
		);
	};
const collection_slug$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Slug`
		);
	};
const collection_slug_input$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Path for collection...`
		);
	};
const collection_slug_tooltip$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Customize your collection slug if a different URL is required`
		);
	};
const collection_status$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Status`
		);
	};
const collection_status_tooltip$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Define how your collection status will be saved by default`
		);
	};
const collection_widgetfield_addfields1$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Add more Fields`
		);
	};
const collection_widgetfield_addrequired$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Add your required widget field to create your`
		);
	};
const collection_widgetfield_drag$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Drag & Drop your created fields to sort them.`
		);
	};
const collection_widgetfields$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Widget Fields`
		);
	};
const colorpicker_hex1$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Hex value`
		);
	};
const dashboard$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Dashboard`
		);
	};
const delete_failed$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Delete failed.`
		);
	};
const email$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Email Address`
		);
	};
const entries_archived$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Entries archived successfully.`
		);
	};
const entries_cloned$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Entries cloned successfully.`
		);
	};
const entries_deleted$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Entries deleted successfully.`
		);
	};
const entries_published$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Entries published successfully.`
		);
	};
const entries_scheduled$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Entries scheduled successfully.`
		);
	};
const entries_set_to_test$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Entries set to test mode.`
		);
	};
const entries_unpublished$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Entries unpublished successfully.`
		);
	};
const entries_updated$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Entries updated successfully.`
		);
	};
const entry_archived$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Entry archived successfully.`
		);
	};
const entry_cloned_success$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Entry cloned successfully.`
		);
	};
const entry_deleted_success$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Entry deleted successfully.`
		);
	};
const entry_saved$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Entry saved successfully.`
		);
	};
const entry_scheduled$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Entry scheduled successfully.`
		);
	};
const entry_scheduled_status$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Entry scheduled.`
		);
	};
const entry_status_updated$2 =
	/** @type {(inputs: { status: NonNullable<unknown> }) => LocalizedString} */
	(i) => {
		return (
			/** @type {LocalizedString} */
			`Entry status updated to ${i?.status}.`
		);
	};
const error_gofrontpage$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Go to Front Page`
		);
	};
const error_pagenotfound$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Page Not Found`
		);
	};
const error_scheduling$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Error scheduling entry.`
		);
	};
const error_saving_draft$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Error saving draft.`
		);
	};
const error_wrong$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`We are sorry, something went wrong.`
		);
	};
const form_required$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`* Required`
		);
	};
const form_resetpassword$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Reset Password`
		);
	};
const form_signin$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Sign In`
		);
	};
const form_signup$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Sign Up`
		);
	};
const signup_registrationtoken$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Registration Token`
		);
	};
const signin_registrationtoken$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Registration Token`
		);
	};
const iconpicker_placeholder$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Search for an icon...`
		);
	};
const button_loading$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Processing`
		);
	};
const logo_slogan$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`with Sveltekit Power`
		);
	};
const login_happy_holi2$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Happy Holi`
		);
	};
const login_demo_message$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`This site will reset every 10 min.`
		);
	};
const login_demo_nextreset$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Next reset in:`
		);
	};
const login_demo_title$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`SveltyCMS DEMO MODE`
		);
	};
const login_happy_diwali$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Happy Diwali`
		);
	};
const login_happy_navratri$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Happy Navratri`
		);
	};
const login_new_year$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Happy New Year`
		);
	};
const multibuttontoken_modalbody$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Modify this token data and then press Save.`
		);
	};
const multibuttontoken_modaltitle$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Edit Token Data`
		);
	};
const no_collection_found$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`No collection found.`
		);
	};
const no_entries_selected$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`No entries selected.`
		);
	};
const no_entry_for_scheduling$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`No entry available for scheduling.`
		);
	};
const oauth_entertoken$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Enter User Token to SignUp:`
		);
	};
const oauth_signup$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Sign Up with Google`
		);
	};
const only_admins_can_delete$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Only admins can delete entries.`
		);
	};
const registration_token$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Registration Token`
		);
	};
const role$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Role`
		);
	};
const signin_forgottenpassword$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Forgotten Password`
		);
	};
const signin_forgottontoast$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Password reset instructions sent to your email`
		);
	};
const signin_savenewpassword$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Save New Password`
		);
	};
const status_reserved_for_system$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`This status is reserved for system use.`
		);
	};
const stay_and_continue_editing$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Stay and continue editing`
		);
	};
const translationsstatus_completed$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Completed`
		);
	};
const unsaved_changes_body$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`You have unsaved changes. Are you sure you want to leave?`
		);
	};
const unsaved_changes_title$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Unsaved Changes`
		);
	};
const update_failed$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Update failed.`
		);
	};
const uploadmedia_title1$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Add Media`
		);
	};
const username$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Username`
		);
	};
const userpage_edit_usersetting$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Edit User Settings:`
		);
	};
const userpage_editavatar$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Edit Avatar`
		);
	};
const userpage_title$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`User Profile`
		);
	};
const userpage_user_id$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`User ID:`
		);
	};
const widget_imageupload_allowed3$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`PNG, JPG, GIF, WEBP, AVIF, and SVG allowed`
		);
	};
const widget_imageupload_browsenew4$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Browse New`
		);
	};
const widget_imageupload_drag3$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`or Drag & Drop`
		);
	};
const widget_imageupload_name3$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Name:`
		);
	};
const widget_imageupload_replace3$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Replace Image`
		);
	};
const widget_imageupload_selectmedia4$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Select Media Image`
		);
	};
const widget_imageupload_size3$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Size:`
		);
	};
const widget_imageupload_upload3$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Image Upload`
		);
	};
const widget_address_description$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`This Address widget enables the collection of user address data for purposes such as shipping, billing, and location-based services.`
		);
	};
const widget_checkbox_description$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`This widget lets you create a checkbox that users can select or deselect. You can customize the label, color, and size of the checkbox. Use this widget to add interactivity and collect feedback from your users`
		);
	};
const widget_colorpicker_description1$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`This Color Picker widget provides an easy way for users to select a color. Use it to add interactivity and collect user input.`
		);
	};
const widget_currency_description$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`This Currency widget enables the collection of user currency data for purposes such as payments, exchange rates, and transactions.`
		);
	};
const widget_daterange_description1$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`This DateRange widget enables the collection of user date and time data for purposes such as appointments, reminders, and events.`
		);
	};
const widget_date_description$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`This Date widget enables the collection of user date data for purposes such as birthdays, registrations, and feedback.`
		);
	};
const widget_email_description$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`This Email widget enables the collection of user email addresses for purposes such as newsletters, registrations, and feedback.`
		);
	};
const widget_media_description$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`This Media widget enables the collection of user media files for purposes such as images, videos, and documents.`
		);
	};
const widget_megamenu_description1$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`This MegaMenu widget allows multilevel menus for navigation.`
		);
	};
const widget_number_description$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`This Number widget enables the collection of user number data for purposes such as appointments, reminders, and events.`
		);
	};
const widget_phonenumber_description1$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`This PhoneNumber widget enables the collection of user phone numbers for purposes such as phone calls, SMS, and WhatsApp.`
		);
	};
const widget_radio_description$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`This Radio widget enables the collection of user radio data for purposes such as appointments, reminders, and events.`
		);
	};
const widget_rating_description$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`This Rating widget enables the collection of user rating data for purposes such as feedback, reviews, and ratings.`
		);
	};
const widget_relation_description$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`This Relation widget lets you link entries from another collection to reference related content.`
		);
	};
const widget_remotevideo_description1$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`This RemoteVideo widget enables the collection of user video data for purposes such as appointments, reminders, and events.`
		);
	};
const widget_richtext_description1$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`This RichText widget is used to create rich text content. You can customize the label, color, and size of the text. Use this widget to add interactivity and collect feedback from your users.`
		);
	};
const widget_seo_description$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`This SEO widget enables the collection of user SEO data for purposes such as search engine optimization (SEO), social media, and advertising.`
		);
	};
const widget_seo_powerwords$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`amazing,attractive,become,best,boost,breaking,breakingnews,cheap,discover,direct,easy,exclusive,fresh,full,free,freetrial,gain,get,grow,hurry,happiness,health,hot,improve,improvement,innovative,instant,join,latest,limited,limitedtime,love,new,newsworthy,powerful,popular,proven,quality,quick,revolutionary,save,sale,safety,signup,special,specialoffer,solutions,success,support,today,trending,trust,urgent,viral,when,winner,worldwide,wealth`
		);
	};
const widget_seo_suggestioncharacter$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Character:`
		);
	};
const widget_seo_suggestiondescription$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Description:`
		);
	};
const widget_seo_suggestionseodescription$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`SEO Description:`
		);
	};
const widget_seo_suggestionseotitle$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`SEO Title:`
		);
	};
const widget_seo_suggestiontitle$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Title:`
		);
	};
const widget_seo_suggestionwidthdesktop$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Desktop:`
		);
	};
const widget_seo_suggestionwidthmobile$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Mobile:`
		);
	};
const widget_text_description$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`This Text widget enables the collection of user text data for purposes such as blog posts, comments, and feedback.`
		);
	};
const entrylist_multibutton_create$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Create`
		);
	};
const entrylist_multibutton_publish$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Publish`
		);
	};
const entrylist_multibutton_unpublish$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Unpublish`
		);
	};
const entrylist_multibutton_schedule$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Schedule`
		);
	};
const entrylist_multibutton_clone$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Clone`
		);
	};
const entrylist_multibutton_draft$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Draft`
		);
	};
const entrylist_all$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`All`
		);
	};
const entrylist_page$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Page`
		);
	};
const entrylist_of$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`of`
		);
	};
const entrylist_rows$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Rows`
		);
	};
const entrylist_filter$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Filter ...`
		);
	};
const entrylist_showing$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Showing`
		);
	};
const entrylist_items$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`items`
		);
	};
const entrylist_dnd$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Drag & Drop Columns / Click to hide`
		);
	};
const save_as_draft_and_leave$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Save as draft and leave`
		);
	};
const changes_saved_as_draft$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Changes saved as draft.`
		);
	};
const form_password$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Password`
		);
	};
const form_confirmpassword$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Confirm Password`
		);
	};
const confirm_password$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Confirm Password`
		);
	};
const collectionname_description$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Description`
		);
	};
const collectionname_optional$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Optional values`
		);
	};
const collectionname_labelicon$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Icon`
		);
	};
const table_search_placeholder$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Search...`
		);
	};
const table_search_aria$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Search for items in the table`
		);
	};
const table_clear_search$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Clear Search`
		);
	};
const table_search_toggle$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Search`
		);
	};
const table_filter_toggle$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Column Filters`
		);
	};
const table_column_toggle$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Manage Columns`
		);
	};
const table_density_toggle$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Cycle Table Density`
		);
	};
const table_density_label$2 =
	/** @type {(inputs: { density: NonNullable<unknown> }) => LocalizedString} */
	(i) => {
		return (
			/** @type {LocalizedString} */
			`Density: ${i?.density}`
		);
	};
const entrylist_multibutton_show_active$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Show Active`
		);
	};
const entrylist_multibutton_show_archived$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Show Archived`
		);
	};
const entrylist_multibutton_viewing_archived$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Currently viewing archived items`
		);
	};
const entrylist_multibutton_viewing_active$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Currently viewing active items`
		);
	};
const entrylist_multibutton_toggle_menu$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Toggle actions menu`
		);
	};
const entrylist_multibutton_available_actions$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Available actions`
		);
	};
const config_pagetitle$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`System Configuration`
		);
	};
const config_body$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Select your Configuration`
		);
	};
const config_collectionbuilder$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Collection Builder`
		);
	};
const config_graphql$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Graphql api`
		);
	};
const config_thememanagement1$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Theme Management`
		);
	};
const config_widgetmanagement1$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Widget Management`
		);
	};
const config_settings$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Settings`
		);
	};
const config_accessmanagement1$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Access Management`
		);
	};
const config_emailpreviews1$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Email Previews`
		);
	};
const system_permission$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Permissions`
		);
	};
const system_roles$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Roles`
		);
	};
const marketplace$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Marketplace`
		);
	};
const boolean_yes$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Yes`
		);
	};
const boolean_no$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`No`
		);
	};
const twofa_verify_title$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Enter Authentication Code`
		);
	};
const twofa_verify_description$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Enter the 6-digit code from your authenticator app to verify your identity.`
		);
	};
const twofa_code_placeholder$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Enter 6-digit code`
		);
	};
const twofa_verify_button$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Verify`
		);
	};
const twofa_use_backup_code$2 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Use backup code`
		);
	};
const db_error_title$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Verbindungsfehler zur Datenbank`
		);
	};
const db_error_description$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Wir können keine Verbindung zur Datenbank herstellen. Dies bedeutet normalerweise, dass der Datenbankserver nicht erreichbar ist oder die Konfiguration falsch ist.`
		);
	};
const db_error_reason_label$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Fehlerursache:`
		);
	};
const db_error_solutions_title$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Mögliche Lösungen:`
		);
	};
const db_error_solution_1$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Überprüfen Sie, ob Ihr Datenbankserver läuft.`
		);
	};
const db_error_solution_2$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Überprüfen Sie die Verbindungszeichenfolge in Ihrer Konfiguration.`
		);
	};
const db_error_solution_3$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Überprüfen Sie die Firewall-Einstellungen und die Netzwerkkonnektivität.`
		);
	};
const db_error_solution_4$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Wenden Sie sich an den Support, wenn das Problem weiterhin besteht.`
		);
	};
const db_error_reset_setup$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Setup zurücksetzen`
		);
	};
const db_error_refresh_page$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Seite aktualisieren`
		);
	};
const entrylist_no_collection2$1 =
	/** @type {(inputs: { name: NonNullable<unknown> }) => LocalizedString} */
	(i) => {
		return (
			/** @type {LocalizedString} */
			`Keine Sammlung ${i?.name} Daten`
		);
	};
const fields_no_widgets_found1$1 =
	/** @type {(inputs: { name: NonNullable<unknown> }) => LocalizedString} */
	(i) => {
		return (
			/** @type {LocalizedString} */
			`Widget nicht gefunden: ${i?.name}`
		);
	};
const fields_preview1$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Vorschau`
		);
	};
const widgetbuilder_addcolectionfield5$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Sammlungsfeld hinzufügen`
		);
	};
const adminarea_adminarea$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Admin-Bereich:`
		);
	};
const adminarea_emailtoken$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`E-Mail-Benutzerregistrierungstoken`
		);
	};
const adminarea_hideuserlist$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Benutzerliste ausblenden`
		);
	};
const adminarea_nouser$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Kein Benutzer gefunden`
		);
	};
const adminarea_showtoken$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Benutzertoken anzeigen`
		);
	};
const adminarea_title$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Generieren eines neuen Benutzerregistrierungstokens`
		);
	};
const adminarea_userlist$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Benutzerliste:`
		);
	};
const applayout_contentlanguage$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Inhaltssprache`
		);
	};
const applayout_systemlanguage$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Systemsprache`
		);
	};
const applayout_version$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Ver.`
		);
	};
const button_archive$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Archiv`
		);
	};
const button_back$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Zurück`
		);
	};
const button_cancel$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Stornieren`
		);
	};
const button_confirm$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Bestätigen`
		);
	};
const button_delete$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Löschen`
		);
	};
const button_edit$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Bearbeiten`
		);
	};
const button_next$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Nächste`
		);
	};
const button_previous$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Vorherige`
		);
	};
const button_save$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Speichern`
		);
	};
const button_send$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Schicken`
		);
	};
const button_test$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Prüfen`
		);
	};
const collection_dbname2$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Datenbankname`
		);
	};
const collection_addcategory$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Kategorie hinzufügen`
		);
	};
const collection_add$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Sammlung hinzufügen`
		);
	};
const collection_description$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Erstellen Sie Kategorien oder Sammlungen und ordnen Sie diese per Drag &amp; Drop an. Fügen Sie eine kurze Beschreibung hinzu, um die Sammlung zu erläutern.`
		);
	};
const collection_description_placeholder$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Beschreiben Sie Ihre Sammlung`
		);
	};
const collection_helptext$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Dieser Builder hilft Ihnen beim Einrichten einer Inhaltssammlung`
		);
	};
const collection_name$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Name`
		);
	};
const collection_name_placeholder$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Eindeutiger Name der Sammlung`
		);
	};
const collection_name_tooltip1$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Geben Sie einen Namen ein, der Ihre Sammlung am besten beschreibt.`
		);
	};
const collection_name_tooltip2$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Der angezeigte Name wird für Ihre Datenbank optimiert und wie unter Datenbankname angezeigt gespeichert.`
		);
	};
const collection_icon_tooltip$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Wählen Sie ein Symbol aus, um diese Sammlung in der Benutzeroberfläche darzustellen`
		);
	};
const collection_pagetitle$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Sammlungsersteller`
		);
	};
const collection_required$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Erforderlich`
		);
	};
const collection_slug$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Schnecke`
		);
	};
const collection_slug_input$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Pfad zur Sammlung...`
		);
	};
const collection_slug_tooltip$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Passen Sie Ihren Sammlungs-Slug an, wenn eine andere URL erforderlich ist`
		);
	};
const collection_status$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Status`
		);
	};
const collection_status_tooltip$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Definieren Sie, wie Ihr Sammlungsstatus standardmäßig gespeichert wird`
		);
	};
const collection_widgetfield_addfields1$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Weitere Felder hinzufügen`
		);
	};
const collection_widgetfield_addrequired$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Fügen Sie Ihr erforderliches Widget-Feld hinzu, um Ihr`
		);
	};
const collection_widgetfield_drag$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Ziehen Sie die erstellten Felder per Drag &amp; Drop, um sie zu sortieren.`
		);
	};
const collection_widgetfields$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Widget-Felder`
		);
	};
const colorpicker_hex1$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Hex-Wert`
		);
	};
const dashboard$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Armaturenbrett`
		);
	};
const delete_failed$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Löschen fehlgeschlagen.`
		);
	};
const email$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`E-Mail-Adresse`
		);
	};
const entries_archived$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Einträge erfolgreich archiviert.`
		);
	};
const entries_cloned$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Einträge erfolgreich geklont.`
		);
	};
const entries_deleted$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Einträge erfolgreich gelöscht.`
		);
	};
const entries_published$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Einträge erfolgreich veröffentlicht.`
		);
	};
const entries_scheduled$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Einträge erfolgreich geplant.`
		);
	};
const entries_set_to_test$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Einträge auf Testmodus eingestellt.`
		);
	};
const entries_unpublished$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Einträge erfolgreich unveröffentlicht.`
		);
	};
const entries_updated$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Einträge erfolgreich aktualisiert.`
		);
	};
const entry_archived$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Eintrag erfolgreich archiviert.`
		);
	};
const entry_cloned_success$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Eintrag erfolgreich geklont.`
		);
	};
const entry_deleted_success$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Eintrag erfolgreich gelöscht.`
		);
	};
const entry_saved$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Eintrag erfolgreich gespeichert.`
		);
	};
const entry_scheduled$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Eintrag erfolgreich geplant.`
		);
	};
const entry_scheduled_status$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Eintrag geplant.`
		);
	};
const entry_status_updated$1 =
	/** @type {(inputs: { status: NonNullable<unknown> }) => LocalizedString} */
	(i) => {
		return (
			/** @type {LocalizedString} */
			`Eintragsstatus aktualisiert auf ${i?.status} .`
		);
	};
const error_gofrontpage$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Zur Startseite`
		);
	};
const error_pagenotfound$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Seite nicht gefunden`
		);
	};
const error_scheduling$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Fehler beim Planen des Eintrags.`
		);
	};
const error_saving_draft$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Fehler beim Speichern des Entwurfs.`
		);
	};
const error_wrong$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Es tut uns leid, es ist etwas schiefgelaufen.`
		);
	};
const form_required$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`* Erforderlich`
		);
	};
const form_resetpassword$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Passwort zurücksetzen`
		);
	};
const form_signin$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Anmelden`
		);
	};
const form_signup$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Melden Sie sich an`
		);
	};
const signup_registrationtoken$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Registrierungstoken`
		);
	};
const signin_registrationtoken$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Registrierungstoken`
		);
	};
const iconpicker_placeholder$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Suche nach einem Symbol ...`
		);
	};
const logo_slogan$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`mit Sveltekit Power`
		);
	};
const login_happy_holi2$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Frohes Holi`
		);
	};
const login_demo_message$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Diese Site wird alle 10 Minuten zurückgesetzt.`
		);
	};
const login_demo_nextreset$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Nächster Reset in:`
		);
	};
const login_demo_title$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`SveltyCMS DEMO-MODUS`
		);
	};
const login_happy_diwali$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Frohes Diwali`
		);
	};
const login_happy_navratri$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Frohes Navratri`
		);
	};
const login_new_year$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Frohes Neues Jahr`
		);
	};
const multibuttontoken_modalbody$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Ändern Sie diese Token-Daten und drücken Sie dann auf Speichern.`
		);
	};
const multibuttontoken_modaltitle$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Tokendaten bearbeiten`
		);
	};
const no_collection_found$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Keine Sammlung gefunden.`
		);
	};
const no_entries_selected$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Keine Einträge ausgewählt.`
		);
	};
const no_entry_for_scheduling$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Kein Eintrag zur Terminplanung vorhanden.`
		);
	};
const oauth_entertoken$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Geben Sie das Benutzertoken zur Anmeldung ein:`
		);
	};
const oauth_signup$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Mit Google anmelden`
		);
	};
const only_admins_can_delete$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Nur Administratoren können Einträge löschen.`
		);
	};
const registration_token$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Registrierungstoken`
		);
	};
const role$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Rolle`
		);
	};
const signin_forgottenpassword$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Passwort vergessen`
		);
	};
const signin_forgottontoast$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Anweisungen zum Zurücksetzen des Passworts werden an Ihre E-Mail-Adresse gesendet`
		);
	};
const signin_savenewpassword$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Neues Passwort speichern`
		);
	};
const status_reserved_for_system$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Dieser Status ist für die Systemnutzung reserviert.`
		);
	};
const stay_and_continue_editing$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Bleiben und weiter bearbeiten`
		);
	};
const translationsstatus_completed$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Vollendet`
		);
	};
const unsaved_changes_body$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Sie haben nicht gespeicherte Änderungen. Möchten Sie wirklich gehen?`
		);
	};
const unsaved_changes_title$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Nicht gespeicherte Änderungen`
		);
	};
const update_failed$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Aktualisierung fehlgeschlagen.`
		);
	};
const uploadmedia_title1$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Medien hinzufügen`
		);
	};
const username$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Benutzername`
		);
	};
const userpage_edit_usersetting$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Benutzereinstellungen bearbeiten:`
		);
	};
const userpage_editavatar$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Avatar bearbeiten`
		);
	};
const userpage_title$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Benutzerprofil`
		);
	};
const userpage_user_id$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Benutzer-ID:`
		);
	};
const widget_imageupload_allowed3$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`PNG, JPG, GIF, WEBP, AVIF und SVG zulässig`
		);
	};
const widget_imageupload_browsenew4$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Durchsuchen Neu`
		);
	};
const widget_imageupload_drag3$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`oder Drag &amp; Drop`
		);
	};
const widget_imageupload_name3$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Name:`
		);
	};
const widget_imageupload_replace3$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Bild ersetzen`
		);
	};
const widget_imageupload_selectmedia4$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Medienbild auswählen`
		);
	};
const widget_imageupload_size3$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Größe:`
		);
	};
const widget_imageupload_upload3$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Bild-Upload`
		);
	};
const widget_address_description$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Dieses Adress-Widget ermöglicht die Erfassung von Benutzeradressdaten für Zwecke wie Versand, Rechnungsstellung und standortbasierte Dienste.`
		);
	};
const widget_checkbox_description$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Mit diesem Widget können Sie ein Kontrollkästchen erstellen, das Benutzer aktivieren oder deaktivieren können. Sie können Beschriftung, Farbe und Größe des Kontrollkästchens anpassen. Nutzen Sie dieses Widget, um Interaktivität zu schaffen und Feedback von Ihren Benutzern zu sammeln.`
		);
	};
const widget_colorpicker_description1$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Dieses Farbauswahl-Widget ermöglicht Benutzern die einfache Auswahl einer Farbe. Nutzen Sie es für Interaktivität und Benutzereingaben.`
		);
	};
const widget_currency_description$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Dieses Währungs-Widget ermöglicht die Erfassung von Benutzerwährungsdaten für Zwecke wie Zahlungen, Wechselkurse und Transaktionen.`
		);
	};
const widget_daterange_description1$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Dieses DateRange-Widget ermöglicht die Erfassung von Datums- und Zeitdaten des Benutzers für Zwecke wie Termine, Erinnerungen und Ereignisse.`
		);
	};
const widget_date_description$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Dieses Datums-Widget ermöglicht die Erfassung von Benutzerdaten für Zwecke wie Geburtstage, Registrierungen und Feedback.`
		);
	};
const widget_email_description$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Dieses E-Mail-Widget ermöglicht die Erfassung von Benutzer-E-Mail-Adressen für Zwecke wie Newsletter, Registrierungen und Feedback.`
		);
	};
const widget_media_description$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Dieses Medien-Widget ermöglicht die Erfassung von Benutzermediendateien für Zwecke wie Bilder, Videos und Dokumente.`
		);
	};
const widget_megamenu_description1$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Dieses MegaMenu-Widget ermöglicht mehrstufige Menüs zur Navigation.`
		);
	};
const widget_number_description$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Dieses Nummern-Widget ermöglicht die Erfassung von Benutzernummerndaten für Zwecke wie Termine, Erinnerungen und Ereignisse.`
		);
	};
const widget_phonenumber_description1$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Dieses PhoneNumber-Widget ermöglicht die Erfassung von Benutzertelefonnummern für Zwecke wie Telefonanrufe, SMS und WhatsApp.`
		);
	};
const widget_radio_description$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Dieses Radio-Widget ermöglicht die Erfassung von Benutzerradiodaten für Zwecke wie Termine, Erinnerungen und Ereignisse.`
		);
	};
const widget_rating_description$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Dieses Bewertungs-Widget ermöglicht die Erfassung von Benutzerbewertungsdaten für Zwecke wie Feedback, Rezensionen und Bewertungen.`
		);
	};
const widget_relation_description$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Mit diesem Beziehungs-Widget können Sie Einträge aus einer anderen Sammlung verknüpfen, um auf verwandte Inhalte zu verweisen.`
		);
	};
const widget_remotevideo_description1$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Dieses RemoteVideo-Widget ermöglicht die Erfassung von Benutzervideodaten für Zwecke wie Termine, Erinnerungen und Ereignisse.`
		);
	};
const widget_richtext_description1$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Mit diesem RichText-Widget erstellen Sie Rich-Text-Inhalte. Sie können Beschriftung, Farbe und Größe des Textes anpassen. Nutzen Sie dieses Widget, um Interaktivität zu schaffen und Feedback von Ihren Benutzern zu sammeln.`
		);
	};
const widget_seo_description$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Dieses SEO-Widget ermöglicht die Erfassung von SEO-Benutzerdaten für Zwecke wie Suchmaschinenoptimierung (SEO), soziale Medien und Werbung.`
		);
	};
const widget_seo_powerwords$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`erstaunlich, attraktiv, werden, am besten, steigern, aktuell, aktuelle Nachrichten, günstig, entdecken, direkt, einfach, exklusiv, frisch, voll, kostenlos, kostenlose Testversion, gewinnen, erhalten, wachsen, beeilen, Glück, Gesundheit, heiß, verbessern, Verbesserung, innovativ, sofort, beitreten, neuste, begrenzt, zeitlich begrenzte Zeit, Liebe, neu, berichtenswert, leistungsstark, beliebt, bewährt, Qualität, schnell, revolutionär, sparen, Verkauf, Sicherheit, anmelden, speziell, Sonderangebot, Lösungen, Erfolg, Unterstützung, heute, im Trend, Vertrauen, dringend, viral, wann, Gewinner, weltweit, Reichtum`
		);
	};
const widget_seo_suggestioncharacter$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Charakter:`
		);
	};
const widget_seo_suggestiondescription$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Beschreibung:`
		);
	};
const widget_seo_suggestionseodescription$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`SEO-Beschreibung:`
		);
	};
const widget_seo_suggestionseotitle$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`SEO-Titel:`
		);
	};
const widget_seo_suggestiontitle$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Titel:`
		);
	};
const widget_seo_suggestionwidthdesktop$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Desktop:`
		);
	};
const widget_seo_suggestionwidthmobile$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Mobile:`
		);
	};
const widget_text_description$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Dieses Text-Widget ermöglicht die Erfassung von Benutzertextdaten für Zwecke wie Blogbeiträge, Kommentare und Feedback.`
		);
	};
const entrylist_multibutton_create$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Erstellen`
		);
	};
const entrylist_multibutton_publish$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Veröffentlichen`
		);
	};
const entrylist_multibutton_unpublish$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Veröffentlichung aufheben`
		);
	};
const entrylist_multibutton_schedule$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Zeitplan`
		);
	};
const entrylist_multibutton_clone$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Klon`
		);
	};
const entrylist_multibutton_draft$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Entwurf`
		);
	};
const entrylist_all$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Alle`
		);
	};
const entrylist_page$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Seite`
		);
	};
const entrylist_of$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`von`
		);
	};
const entrylist_rows$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Zeilen`
		);
	};
const entrylist_filter$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Filter ...`
		);
	};
const entrylist_showing$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Zeige`
		);
	};
const entrylist_items$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Einträge`
		);
	};
const entrylist_dnd$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Spalten per Drag & Drop verschieben / Zum Ausblenden klicken`
		);
	};
const save_as_draft_and_leave$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Als Entwurf speichern und verlassen`
		);
	};
const changes_saved_as_draft$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Änderungen als Entwurf gespeichert.`
		);
	};
const form_password$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Passwort`
		);
	};
const form_confirmpassword$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Passwort bestätigen`
		);
	};
const confirm_password$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Passwort bestätigen`
		);
	};
const collectionname_description$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Beschreibung`
		);
	};
const collectionname_optional$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Optionale Werte`
		);
	};
const collectionname_labelicon$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Symbol`
		);
	};
const table_search_placeholder$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Suchen...`
		);
	};
const table_search_aria$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Suchen Sie nach Elementen in der Tabelle`
		);
	};
const table_clear_search$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Suche löschen`
		);
	};
const table_search_toggle$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Suche`
		);
	};
const table_filter_toggle$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Spaltenfilter`
		);
	};
const table_column_toggle$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Spalten verwalten`
		);
	};
const table_density_toggle$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Tabellendichte ändern`
		);
	};
const table_density_label$1 =
	/** @type {(inputs: { density: NonNullable<unknown> }) => LocalizedString} */
	(i) => {
		return (
			/** @type {LocalizedString} */
			`Dichte: ${i?.density}`
		);
	};
const entrylist_multibutton_show_active$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Aktive anzeigen`
		);
	};
const entrylist_multibutton_show_archived$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Archivierte anzeigen`
		);
	};
const entrylist_multibutton_viewing_archived$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Archivierte Elemente werden angezeigt`
		);
	};
const entrylist_multibutton_viewing_active$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Aktive Elemente werden angezeigt`
		);
	};
const entrylist_multibutton_toggle_menu$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Aktionsmenü umschalten`
		);
	};
const entrylist_multibutton_available_actions$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Verfügbare Aktionen`
		);
	};
const config_pagetitle$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Systemkonfiguration`
		);
	};
const config_body$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Wählen Sie Ihre Konfiguration`
		);
	};
const config_collectionbuilder$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Sammlungsersteller`
		);
	};
const config_graphql$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Graphql-API`
		);
	};
const config_thememanagement1$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Themenverwaltung`
		);
	};
const config_widgetmanagement1$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Widget-Verwaltung`
		);
	};
const config_settings$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Einstellungen`
		);
	};
const config_accessmanagement1$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Zugriffsverwaltung`
		);
	};
const config_emailpreviews1$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`E-Mail-Vorschau`
		);
	};
const system_permission$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Berechtigungen`
		);
	};
const system_roles$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Rollen`
		);
	};
const marketplace$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Marktplatz`
		);
	};
const boolean_yes$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Ja`
		);
	};
const boolean_no$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`NEIN`
		);
	};
const twofa_verify_title$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Authentifizierungscode eingeben`
		);
	};
const twofa_verify_description$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Geben Sie den 6-stelligen Code aus Ihrer Authentifizierungs-App ein, um Ihre Identität zu bestätigen.`
		);
	};
const twofa_code_placeholder$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`6-stelligen Code eingeben`
		);
	};
const twofa_verify_button$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Verifizieren`
		);
	};
const twofa_use_backup_code$1 =
	/** @type {(inputs: {}) => LocalizedString} */
	() => {
		return (
			/** @type {LocalizedString} */
			`Backup-Code verwenden`
		);
	};
const db_error_title = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return db_error_title$2();
	return db_error_title$1();
};
const db_error_description = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return db_error_description$2();
	return db_error_description$1();
};
const db_error_reason_label = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return db_error_reason_label$2();
	return db_error_reason_label$1();
};
const db_error_solutions_title = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return db_error_solutions_title$2();
	return db_error_solutions_title$1();
};
const db_error_solution_1 = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return db_error_solution_1$2();
	return db_error_solution_1$1();
};
const db_error_solution_2 = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return db_error_solution_2$2();
	return db_error_solution_2$1();
};
const db_error_solution_3 = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return db_error_solution_3$2();
	return db_error_solution_3$1();
};
const db_error_solution_4 = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return db_error_solution_4$2();
	return db_error_solution_4$1();
};
const db_error_reset_setup = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return db_error_reset_setup$2();
	return db_error_reset_setup$1();
};
const db_error_refresh_page = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return db_error_refresh_page$2();
	return db_error_refresh_page$1();
};
const entrylist_no_collection2 = /* @__NO_SIDE_EFFECTS__ */ (inputs, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entrylist_no_collection2$2(inputs);
	return entrylist_no_collection2$1(inputs);
};
const fields_no_widgets_found1 = /* @__NO_SIDE_EFFECTS__ */ (inputs, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return fields_no_widgets_found1$2(inputs);
	return fields_no_widgets_found1$1(inputs);
};
const fields_preview1 = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return fields_preview1$2();
	return fields_preview1$1();
};
const widgetbuilder_addcolectionfield5 = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return widgetbuilder_addcolectionfield5$2();
	return widgetbuilder_addcolectionfield5$1();
};
const adminarea_adminarea = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return adminarea_adminarea$2();
	return adminarea_adminarea$1();
};
const adminarea_emailtoken = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return adminarea_emailtoken$2();
	return adminarea_emailtoken$1();
};
const adminarea_hideuserlist = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return adminarea_hideuserlist$2();
	return adminarea_hideuserlist$1();
};
const adminarea_nouser = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return adminarea_nouser$2();
	return adminarea_nouser$1();
};
const adminarea_showtoken = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return adminarea_showtoken$2();
	return adminarea_showtoken$1();
};
const adminarea_title = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return adminarea_title$2();
	return adminarea_title$1();
};
const adminarea_userlist = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return adminarea_userlist$2();
	return adminarea_userlist$1();
};
const applayout_contentlanguage = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return applayout_contentlanguage$2();
	return applayout_contentlanguage$1();
};
const applayout_systemlanguage = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return applayout_systemlanguage$2();
	return applayout_systemlanguage$1();
};
const applayout_version = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return applayout_version$2();
	return applayout_version$1();
};
const button_archive = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return button_archive$2();
	return button_archive$1();
};
const button_back = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return button_back$2();
	return button_back$1();
};
const button_cancel = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return button_cancel$2();
	return button_cancel$1();
};
const button_confirm = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return button_confirm$2();
	return button_confirm$1();
};
const button_delete = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return button_delete$2();
	return button_delete$1();
};
const button_edit = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return button_edit$2();
	return button_edit$1();
};
const button_next = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return button_next$2();
	return button_next$1();
};
const button_previous = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return button_previous$2();
	return button_previous$1();
};
const button_save = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return button_save$2();
	return button_save$1();
};
const button_send = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return button_send$2();
	return button_send$1();
};
const button_test = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return button_test$2();
	return button_test$1();
};
const collection_dbname2 = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return collection_dbname2$2();
	return collection_dbname2$1();
};
const collection_addcategory = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return collection_addcategory$2();
	return collection_addcategory$1();
};
const collection_add = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return collection_add$2();
	return collection_add$1();
};
const collection_description = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return collection_description$2();
	return collection_description$1();
};
const collection_description_placeholder = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return collection_description_placeholder$2();
	return collection_description_placeholder$1();
};
const collection_helptext = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return collection_helptext$2();
	return collection_helptext$1();
};
const collection_name = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return collection_name$2();
	return collection_name$1();
};
const collection_name_placeholder = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return collection_name_placeholder$2();
	return collection_name_placeholder$1();
};
const collection_name_tooltip1 = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return collection_name_tooltip1$2();
	return collection_name_tooltip1$1();
};
const collection_name_tooltip2 = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return collection_name_tooltip2$2();
	return collection_name_tooltip2$1();
};
const collection_icon_tooltip = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return collection_icon_tooltip$2();
	return collection_icon_tooltip$1();
};
const collection_pagetitle = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return collection_pagetitle$2();
	return collection_pagetitle$1();
};
const collection_required = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return collection_required$2();
	return collection_required$1();
};
const collection_slug = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return collection_slug$2();
	return collection_slug$1();
};
const collection_slug_input = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return collection_slug_input$2();
	return collection_slug_input$1();
};
const collection_slug_tooltip = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return collection_slug_tooltip$2();
	return collection_slug_tooltip$1();
};
const collection_status = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return collection_status$2();
	return collection_status$1();
};
const collection_status_tooltip = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return collection_status_tooltip$2();
	return collection_status_tooltip$1();
};
const collection_widgetfield_addfields1 = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return collection_widgetfield_addfields1$2();
	return collection_widgetfield_addfields1$1();
};
const collection_widgetfield_addrequired = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return collection_widgetfield_addrequired$2();
	return collection_widgetfield_addrequired$1();
};
const collection_widgetfield_drag = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return collection_widgetfield_drag$2();
	return collection_widgetfield_drag$1();
};
const collection_widgetfields = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return collection_widgetfields$2();
	return collection_widgetfields$1();
};
const colorpicker_hex1 = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return colorpicker_hex1$2();
	return colorpicker_hex1$1();
};
const dashboard = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return dashboard$2();
	return dashboard$1();
};
const delete_failed = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return delete_failed$2();
	return delete_failed$1();
};
const email = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return email$2();
	return email$1();
};
const entries_archived = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entries_archived$2();
	return entries_archived$1();
};
const entries_cloned = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entries_cloned$2();
	return entries_cloned$1();
};
const entries_deleted = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entries_deleted$2();
	return entries_deleted$1();
};
const entries_published = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entries_published$2();
	return entries_published$1();
};
const entries_scheduled = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entries_scheduled$2();
	return entries_scheduled$1();
};
const entries_set_to_test = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entries_set_to_test$2();
	return entries_set_to_test$1();
};
const entries_unpublished = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entries_unpublished$2();
	return entries_unpublished$1();
};
const entries_updated = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entries_updated$2();
	return entries_updated$1();
};
const entry_archived = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entry_archived$2();
	return entry_archived$1();
};
const entry_cloned_success = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entry_cloned_success$2();
	return entry_cloned_success$1();
};
const entry_deleted_success = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entry_deleted_success$2();
	return entry_deleted_success$1();
};
const entry_saved = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entry_saved$2();
	return entry_saved$1();
};
const entry_scheduled = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entry_scheduled$2();
	return entry_scheduled$1();
};
const entry_scheduled_status = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entry_scheduled_status$2();
	return entry_scheduled_status$1();
};
const entry_status_updated = /* @__NO_SIDE_EFFECTS__ */ (inputs, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entry_status_updated$2(inputs);
	return entry_status_updated$1(inputs);
};
const error_gofrontpage = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return error_gofrontpage$2();
	return error_gofrontpage$1();
};
const error_pagenotfound = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return error_pagenotfound$2();
	return error_pagenotfound$1();
};
const error_scheduling = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return error_scheduling$2();
	return error_scheduling$1();
};
const error_saving_draft = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return error_saving_draft$2();
	return error_saving_draft$1();
};
const error_wrong = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return error_wrong$2();
	return error_wrong$1();
};
const form_required = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return form_required$2();
	return form_required$1();
};
const form_resetpassword = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return form_resetpassword$2();
	return form_resetpassword$1();
};
const form_signin = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return form_signin$2();
	return form_signin$1();
};
const form_signup = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return form_signup$2();
	return form_signup$1();
};
const signup_registrationtoken = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return signup_registrationtoken$2();
	return signup_registrationtoken$1();
};
const signin_registrationtoken = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return signin_registrationtoken$2();
	return signin_registrationtoken$1();
};
const iconpicker_placeholder = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return iconpicker_placeholder$2();
	return iconpicker_placeholder$1();
};
const button_loading = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return button_loading$1();
	return button_loading$1();
};
const logo_slogan = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return logo_slogan$2();
	return logo_slogan$1();
};
const login_happy_holi2 = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return login_happy_holi2$2();
	return login_happy_holi2$1();
};
const login_demo_message = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return login_demo_message$2();
	return login_demo_message$1();
};
const login_demo_nextreset = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return login_demo_nextreset$2();
	return login_demo_nextreset$1();
};
const login_demo_title = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return login_demo_title$2();
	return login_demo_title$1();
};
const login_happy_diwali = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return login_happy_diwali$2();
	return login_happy_diwali$1();
};
const login_happy_navratri = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return login_happy_navratri$2();
	return login_happy_navratri$1();
};
const login_new_year = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return login_new_year$2();
	return login_new_year$1();
};
const multibuttontoken_modalbody = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return multibuttontoken_modalbody$2();
	return multibuttontoken_modalbody$1();
};
const multibuttontoken_modaltitle = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return multibuttontoken_modaltitle$2();
	return multibuttontoken_modaltitle$1();
};
const no_collection_found = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return no_collection_found$2();
	return no_collection_found$1();
};
const no_entries_selected = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return no_entries_selected$2();
	return no_entries_selected$1();
};
const no_entry_for_scheduling = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return no_entry_for_scheduling$2();
	return no_entry_for_scheduling$1();
};
const oauth_entertoken = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return oauth_entertoken$2();
	return oauth_entertoken$1();
};
const oauth_signup = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return oauth_signup$2();
	return oauth_signup$1();
};
const only_admins_can_delete = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return only_admins_can_delete$2();
	return only_admins_can_delete$1();
};
const registration_token = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return registration_token$2();
	return registration_token$1();
};
const role = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return role$2();
	return role$1();
};
const signin_forgottenpassword = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return signin_forgottenpassword$2();
	return signin_forgottenpassword$1();
};
const signin_forgottontoast = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return signin_forgottontoast$2();
	return signin_forgottontoast$1();
};
const signin_savenewpassword = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return signin_savenewpassword$2();
	return signin_savenewpassword$1();
};
const status_reserved_for_system = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return status_reserved_for_system$2();
	return status_reserved_for_system$1();
};
const stay_and_continue_editing = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return stay_and_continue_editing$2();
	return stay_and_continue_editing$1();
};
const translationsstatus_completed = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return translationsstatus_completed$2();
	return translationsstatus_completed$1();
};
const unsaved_changes_body = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return unsaved_changes_body$2();
	return unsaved_changes_body$1();
};
const unsaved_changes_title = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return unsaved_changes_title$2();
	return unsaved_changes_title$1();
};
const update_failed = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return update_failed$2();
	return update_failed$1();
};
const uploadmedia_title1 = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return uploadmedia_title1$2();
	return uploadmedia_title1$1();
};
const username = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return username$2();
	return username$1();
};
const userpage_edit_usersetting = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return userpage_edit_usersetting$2();
	return userpage_edit_usersetting$1();
};
const userpage_editavatar = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return userpage_editavatar$2();
	return userpage_editavatar$1();
};
const userpage_title = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return userpage_title$2();
	return userpage_title$1();
};
const userpage_user_id = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return userpage_user_id$2();
	return userpage_user_id$1();
};
const widget_imageupload_allowed3 = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return widget_imageupload_allowed3$2();
	return widget_imageupload_allowed3$1();
};
const widget_imageupload_browsenew4 = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return widget_imageupload_browsenew4$2();
	return widget_imageupload_browsenew4$1();
};
const widget_imageupload_drag3 = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return widget_imageupload_drag3$2();
	return widget_imageupload_drag3$1();
};
const widget_imageupload_name3 = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return widget_imageupload_name3$2();
	return widget_imageupload_name3$1();
};
const widget_imageupload_replace3 = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return widget_imageupload_replace3$2();
	return widget_imageupload_replace3$1();
};
const widget_imageupload_selectmedia4 = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return widget_imageupload_selectmedia4$2();
	return widget_imageupload_selectmedia4$1();
};
const widget_imageupload_size3 = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return widget_imageupload_size3$2();
	return widget_imageupload_size3$1();
};
const widget_imageupload_upload3 = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return widget_imageupload_upload3$2();
	return widget_imageupload_upload3$1();
};
const widget_address_description = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return widget_address_description$2();
	return widget_address_description$1();
};
const widget_checkbox_description = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return widget_checkbox_description$2();
	return widget_checkbox_description$1();
};
const widget_colorpicker_description1 = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return widget_colorpicker_description1$2();
	return widget_colorpicker_description1$1();
};
const widget_currency_description = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return widget_currency_description$2();
	return widget_currency_description$1();
};
const widget_daterange_description1 = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return widget_daterange_description1$2();
	return widget_daterange_description1$1();
};
const widget_date_description = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return widget_date_description$2();
	return widget_date_description$1();
};
const widget_email_description = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return widget_email_description$2();
	return widget_email_description$1();
};
const widget_media_description = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return widget_media_description$2();
	return widget_media_description$1();
};
const widget_megamenu_description1 = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return widget_megamenu_description1$2();
	return widget_megamenu_description1$1();
};
const widget_number_description = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return widget_number_description$2();
	return widget_number_description$1();
};
const widget_phonenumber_description1 = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return widget_phonenumber_description1$2();
	return widget_phonenumber_description1$1();
};
const widget_radio_description = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return widget_radio_description$2();
	return widget_radio_description$1();
};
const widget_rating_description = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return widget_rating_description$2();
	return widget_rating_description$1();
};
const widget_relation_description = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return widget_relation_description$2();
	return widget_relation_description$1();
};
const widget_remotevideo_description1 = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return widget_remotevideo_description1$2();
	return widget_remotevideo_description1$1();
};
const widget_richtext_description1 = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return widget_richtext_description1$2();
	return widget_richtext_description1$1();
};
const widget_seo_description = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return widget_seo_description$2();
	return widget_seo_description$1();
};
const widget_seo_powerwords = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return widget_seo_powerwords$2();
	return widget_seo_powerwords$1();
};
const widget_seo_suggestioncharacter = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return widget_seo_suggestioncharacter$2();
	return widget_seo_suggestioncharacter$1();
};
const widget_seo_suggestiondescription = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return widget_seo_suggestiondescription$2();
	return widget_seo_suggestiondescription$1();
};
const widget_seo_suggestionseodescription = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return widget_seo_suggestionseodescription$2();
	return widget_seo_suggestionseodescription$1();
};
const widget_seo_suggestionseotitle = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return widget_seo_suggestionseotitle$2();
	return widget_seo_suggestionseotitle$1();
};
const widget_seo_suggestiontitle = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return widget_seo_suggestiontitle$2();
	return widget_seo_suggestiontitle$1();
};
const widget_seo_suggestionwidthdesktop = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return widget_seo_suggestionwidthdesktop$2();
	return widget_seo_suggestionwidthdesktop$1();
};
const widget_seo_suggestionwidthmobile = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return widget_seo_suggestionwidthmobile$2();
	return widget_seo_suggestionwidthmobile$1();
};
const widget_text_description = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return widget_text_description$2();
	return widget_text_description$1();
};
const entrylist_multibutton_create = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entrylist_multibutton_create$2();
	return entrylist_multibutton_create$1();
};
const entrylist_multibutton_publish = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entrylist_multibutton_publish$2();
	return entrylist_multibutton_publish$1();
};
const entrylist_multibutton_unpublish = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entrylist_multibutton_unpublish$2();
	return entrylist_multibutton_unpublish$1();
};
const entrylist_multibutton_schedule = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entrylist_multibutton_schedule$2();
	return entrylist_multibutton_schedule$1();
};
const entrylist_multibutton_clone = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entrylist_multibutton_clone$2();
	return entrylist_multibutton_clone$1();
};
const entrylist_multibutton_draft = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entrylist_multibutton_draft$2();
	return entrylist_multibutton_draft$1();
};
const entrylist_all = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entrylist_all$2();
	return entrylist_all$1();
};
const entrylist_page = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entrylist_page$2();
	return entrylist_page$1();
};
const entrylist_of = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entrylist_of$2();
	return entrylist_of$1();
};
const entrylist_rows = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entrylist_rows$2();
	return entrylist_rows$1();
};
const entrylist_filter = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entrylist_filter$2();
	return entrylist_filter$1();
};
const entrylist_showing = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entrylist_showing$2();
	return entrylist_showing$1();
};
const entrylist_items = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entrylist_items$2();
	return entrylist_items$1();
};
const entrylist_dnd = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entrylist_dnd$2();
	return entrylist_dnd$1();
};
const save_as_draft_and_leave = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return save_as_draft_and_leave$2();
	return save_as_draft_and_leave$1();
};
const changes_saved_as_draft = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return changes_saved_as_draft$2();
	return changes_saved_as_draft$1();
};
const form_password = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return form_password$2();
	return form_password$1();
};
const form_confirmpassword = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return form_confirmpassword$2();
	return form_confirmpassword$1();
};
const confirm_password = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return confirm_password$2();
	return confirm_password$1();
};
const collectionname_description = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return collectionname_description$2();
	return collectionname_description$1();
};
const collectionname_optional = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return collectionname_optional$2();
	return collectionname_optional$1();
};
const collectionname_labelicon = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return collectionname_labelicon$2();
	return collectionname_labelicon$1();
};
const table_search_placeholder = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return table_search_placeholder$2();
	return table_search_placeholder$1();
};
const table_search_aria = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return table_search_aria$2();
	return table_search_aria$1();
};
const table_clear_search = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return table_clear_search$2();
	return table_clear_search$1();
};
const table_search_toggle = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return table_search_toggle$2();
	return table_search_toggle$1();
};
const table_filter_toggle = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return table_filter_toggle$2();
	return table_filter_toggle$1();
};
const table_column_toggle = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return table_column_toggle$2();
	return table_column_toggle$1();
};
const table_density_toggle = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return table_density_toggle$2();
	return table_density_toggle$1();
};
const table_density_label = /* @__NO_SIDE_EFFECTS__ */ (inputs, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return table_density_label$2(inputs);
	return table_density_label$1(inputs);
};
const entrylist_multibutton_show_active = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entrylist_multibutton_show_active$2();
	return entrylist_multibutton_show_active$1();
};
const entrylist_multibutton_show_archived = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entrylist_multibutton_show_archived$2();
	return entrylist_multibutton_show_archived$1();
};
const entrylist_multibutton_viewing_archived = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entrylist_multibutton_viewing_archived$2();
	return entrylist_multibutton_viewing_archived$1();
};
const entrylist_multibutton_viewing_active = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entrylist_multibutton_viewing_active$2();
	return entrylist_multibutton_viewing_active$1();
};
const entrylist_multibutton_toggle_menu = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entrylist_multibutton_toggle_menu$2();
	return entrylist_multibutton_toggle_menu$1();
};
const entrylist_multibutton_available_actions = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return entrylist_multibutton_available_actions$2();
	return entrylist_multibutton_available_actions$1();
};
const config_pagetitle = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return config_pagetitle$2();
	return config_pagetitle$1();
};
const config_body = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return config_body$2();
	return config_body$1();
};
const config_collectionbuilder = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return config_collectionbuilder$2();
	return config_collectionbuilder$1();
};
const config_graphql = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return config_graphql$2();
	return config_graphql$1();
};
const config_thememanagement1 = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return config_thememanagement1$2();
	return config_thememanagement1$1();
};
const config_widgetmanagement1 = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return config_widgetmanagement1$2();
	return config_widgetmanagement1$1();
};
const config_settings = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return config_settings$2();
	return config_settings$1();
};
const config_accessmanagement1 = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return config_accessmanagement1$2();
	return config_accessmanagement1$1();
};
const config_emailpreviews1 = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return config_emailpreviews1$2();
	return config_emailpreviews1$1();
};
const system_permission = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return system_permission$2();
	return system_permission$1();
};
const system_roles = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return system_roles$2();
	return system_roles$1();
};
const marketplace = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return marketplace$2();
	return marketplace$1();
};
const boolean_yes = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return boolean_yes$2();
	return boolean_yes$1();
};
const boolean_no = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return boolean_no$2();
	return boolean_no$1();
};
const twofa_verify_title = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return twofa_verify_title$2();
	return twofa_verify_title$1();
};
const twofa_verify_description = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return twofa_verify_description$2();
	return twofa_verify_description$1();
};
const twofa_code_placeholder = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return twofa_code_placeholder$2();
	return twofa_code_placeholder$1();
};
const twofa_verify_button = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return twofa_verify_button$2();
	return twofa_verify_button$1();
};
const twofa_use_backup_code = /* @__NO_SIDE_EFFECTS__ */ (inputs = {}, options = {}) => {
	const locale = options.locale ?? getLocale();
	if (locale === 'en') return twofa_use_backup_code$2();
	return twofa_use_backup_code$1();
};
export {
	collection_slug as $,
	config_accessmanagement1 as A,
	logo_slogan as B,
	oauth_entertoken as C,
	registration_token as D,
	signup_registrationtoken as E,
	button_cancel as F,
	button_send as G,
	oauth_signup as H,
	colorpicker_hex1 as I,
	widget_seo_powerwords as J,
	widget_seo_suggestiondescription as K,
	widget_seo_suggestioncharacter as L,
	widget_seo_suggestionwidthdesktop as M,
	widget_seo_suggestionwidthmobile as N,
	widget_seo_suggestionseodescription as O,
	widget_seo_suggestiontitle as P,
	widget_seo_suggestionseotitle as Q,
	button_confirm as R,
	uploadmedia_title1 as S,
	collection_name as T,
	collection_name_tooltip1 as U,
	collection_name_tooltip2 as V,
	collection_name_placeholder as W,
	collection_dbname2 as X,
	collectionname_optional as Y,
	collectionname_labelicon as Z,
	collection_icon_tooltip as _,
	error_wrong as a,
	signin_registrationtoken as a$,
	collection_slug_tooltip as a0,
	collection_slug_input as a1,
	collectionname_description as a2,
	collection_description as a3,
	collection_description_placeholder as a4,
	collection_status as a5,
	collection_status_tooltip as a6,
	button_next as a7,
	collection_widgetfield_addrequired as a8,
	collection_widgetfield_drag as a9,
	entrylist_filter as aA,
	adminarea_nouser as aB,
	userpage_title as aC,
	userpage_editavatar as aD,
	userpage_user_id as aE,
	role as aF,
	username as aG,
	email as aH,
	form_password as aI,
	userpage_edit_usersetting as aJ,
	login_new_year as aK,
	login_happy_diwali as aL,
	login_happy_holi2 as aM,
	login_happy_navratri as aN,
	form_signin as aO,
	signin_forgottontoast as aP,
	signin_forgottenpassword as aQ,
	form_resetpassword as aR,
	form_required as aS,
	twofa_verify_title as aT,
	twofa_verify_description as aU,
	twofa_code_placeholder as aV,
	twofa_use_backup_code as aW,
	button_back as aX,
	twofa_verify_button as aY,
	confirm_password as aZ,
	form_confirmpassword as a_,
	button_edit as aa,
	collection_widgetfield_addfields1 as ab,
	button_previous as ac,
	button_save as ad,
	button_delete as ae,
	collection_helptext as af,
	collection_required as ag,
	collection_widgetfields as ah,
	collection_pagetitle as ai,
	collection_addcategory as aj,
	collection_add as ak,
	widgetbuilder_addcolectionfield5 as al,
	system_permission as am,
	system_roles as an,
	boolean_yes as ao,
	boolean_no as ap,
	multibuttontoken_modalbody as aq,
	adminarea_title as ar,
	multibuttontoken_modaltitle as as,
	adminarea_adminarea as at,
	adminarea_emailtoken as au,
	adminarea_showtoken as av,
	adminarea_hideuserlist as aw,
	adminarea_userlist as ax,
	entrylist_dnd as ay,
	entrylist_all as az,
	error_gofrontpage as b,
	applayout_version as b$,
	signin_savenewpassword as b0,
	form_signup as b1,
	db_error_title as b2,
	db_error_description as b3,
	db_error_reason_label as b4,
	db_error_solutions_title as b5,
	db_error_solution_1 as b6,
	db_error_solution_2 as b7,
	db_error_solution_3 as b8,
	db_error_solution_4 as b9,
	entry_status_updated as bA,
	entry_saved as bB,
	entry_deleted_success as bC,
	entry_archived as bD,
	no_collection_found as bE,
	no_entries_selected as bF,
	delete_failed as bG,
	entries_updated as bH,
	entries_cloned as bI,
	entries_scheduled as bJ,
	entries_deleted as bK,
	entries_set_to_test as bL,
	entries_unpublished as bM,
	entries_published as bN,
	entries_archived as bO,
	entrylist_multibutton_draft as bP,
	entrylist_multibutton_create as bQ,
	entrylist_multibutton_show_active as bR,
	entrylist_multibutton_show_archived as bS,
	entrylist_multibutton_viewing_archived as bT,
	entrylist_multibutton_viewing_active as bU,
	entrylist_multibutton_toggle_menu as bV,
	entrylist_multibutton_available_actions as bW,
	button_loading as bX,
	applayout_contentlanguage as bY,
	translationsstatus_completed as bZ,
	entrylist_no_collection2 as b_,
	db_error_reset_setup as ba,
	db_error_refresh_page as bb,
	login_demo_title as bc,
	login_demo_message as bd,
	login_demo_nextreset as be,
	applayout_systemlanguage as bf,
	update_failed as bg,
	button_test as bh,
	entrylist_multibutton_clone as bi,
	entrylist_multibutton_schedule as bj,
	entrylist_multibutton_unpublish as bk,
	entrylist_multibutton_publish as bl,
	button_archive as bm,
	error_scheduling as bn,
	entry_scheduled_status as bo,
	no_entry_for_scheduling as bp,
	error_saving_draft as bq,
	changes_saved_as_draft as br,
	stay_and_continue_editing as bs,
	save_as_draft_and_leave as bt,
	unsaved_changes_body as bu,
	unsaved_changes_title as bv,
	status_reserved_for_system as bw,
	only_admins_can_delete as bx,
	entry_cloned_success as by,
	entry_scheduled as bz,
	table_search_aria as c,
	fields_preview1 as c0,
	fields_no_widgets_found1 as c1,
	iconpicker_placeholder as c2,
	widget_checkbox_description as c3,
	widget_date_description as c4,
	widget_daterange_description1 as c5,
	widget_text_description as c6,
	widget_media_description as c7,
	widget_megamenu_description1 as c8,
	widget_radio_description as c9,
	widget_relation_description as ca,
	widget_richtext_description1 as cb,
	widget_address_description as cc,
	widget_colorpicker_description1 as cd,
	widget_currency_description as ce,
	widget_email_description as cf,
	widget_number_description as cg,
	widget_phonenumber_description1 as ch,
	widget_rating_description as ci,
	widget_remotevideo_description1 as cj,
	widget_seo_description as ck,
	widget_imageupload_upload3 as cl,
	widget_imageupload_drag3 as cm,
	widget_imageupload_replace3 as cn,
	widget_imageupload_allowed3 as co,
	widget_imageupload_browsenew4 as cp,
	widget_imageupload_selectmedia4 as cq,
	widget_imageupload_name3 as cr,
	widget_imageupload_size3 as cs,
	table_clear_search as d,
	error_pagenotfound as e,
	table_search_toggle as f,
	table_filter_toggle as g,
	table_column_toggle as h,
	table_density_toggle as i,
	table_density_label as j,
	entrylist_page as k,
	entrylist_of as l,
	entrylist_showing as m,
	entrylist_items as n,
	entrylist_rows as o,
	config_pagetitle as p,
	config_body as q,
	config_collectionbuilder as r,
	config_graphql as s,
	table_search_placeholder as t,
	config_emailpreviews1 as u,
	dashboard as v,
	marketplace as w,
	config_widgetmanagement1 as x,
	config_thememanagement1 as y,
	config_settings as z
};
//# sourceMappingURL=_index.js.map
