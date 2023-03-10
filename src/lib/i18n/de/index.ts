import type { Translation } from '../i18n-types';

const de: Translation = {
	// Test
	HI: 'Hallo {name}! Übersetzung geht!',

	// SideBar left
	SBL_Search: 'Suchen ...',
	SBL_Admin: 'Admin',
	SBL_Admin_User: 'Admin Benutzer',
	SBL_SystemLanguage: 'Systemspache',
	SBL_English: 'Englisch',
	SBL_German: 'Deutsch',
	SBL_isDark: 'Wechsel zum',
	SBL_Light: 'Hell',
	SBL_Dark: 'Dunkel',
	SBL_Mode: 'Modus',
	SBL_Version: 'Version',
	SBL_Ver: 'Ver.',
	SBL_Save: 'Speichern',
	SBL_Save_message: 'Daten erfolgreich gespeichert',
	SBL_SignOut: 'Abmelden',

	// SideBar Right

	// Error
	ERROR_Pagenotfound: 'Seite nicht gefunden',
	ERROR_Wrong: 'Es tut uns leid, etwas ist schief gelaufen.',
	ERROR_GoHome: 'Zur Startseite',

	// USER
	USER_Setting: 'Benutzereinstellungen',
	USER_ID: 'Benutzer-ID',
	USER_Username: 'Benutzername',
	USER_FirstName: 'Vorname',
	USER_LastName: 'Nachname',
	USER_Email: 'E-Mail',
	USER_Password: 'Passwort',
	USER_Edit: 'Benutzer bearbeiten',
	USER_Fail: 'E-Mail bereits in Gebrauch',
	USER_Delete: 'Benutzer löschen',
	USER_Profile: 'Benutzerprofil',
	USER_Edit_Avatar: 'Avatar bearbeiten',
	USER_Role: 'Rolle',
	USER_Generate: 'Email Registrierungstoken',
	USER_ListShow: 'Benutzerliste anzeigen',
	USER_ListCollapse: 'Benutzerliste schließen',
	USER_EmailToken: 'Email Benutzerregistrierungstoken',

	// Login
	LOGIN_SignIn: 'Anmelden',
	LOGIN_SignUp: 'Registrieren',
	LOGIN_Required: '* Erforderlich',
	LOGIN_Username: 'Benutzername',
	LOGIN_EmailAddress: 'E-Mail Adresse',
	LOGIN_Password: 'Passwort',
	LOGIN_Token: 'Anmeldungs Token',
	LOGIN_ConfirmPassword: 'Passwort bestätigen',
	LOGIN_ForgottenPassword: 'Kennwort vergessen',
	LOGIN_SendResetMail: 'E-Mail Passwort senden',
	LOGIN_ResetPassword: 'Passwort zurücksetzen',
	LOGIN_ResetPasswordSave: 'Neues Password speichern',

	LOGIN_ZOD_Username_string: 'Benutzername ist erforderlich',
	LOGIN_ZOD_Username_regex: 'Der Name darf nur Buchstaben, Ziffern und @$!%*# enthalten',
	LOGIN_ZOD_Username_min: 'Name muss aus mindestens 2 Zeichen bestehen',
	LOGIN_ZOD_Username_max: 'Der Name darf nur 24 Zeichen lang sein',
	LOGIN_ZOD_Email_string: 'E-Mail ist erforderlich',
	LOGIN_ZOD_Email_email: 'E-Mail muss eine gültige E-Mail sein',
	LOGIN_ZOD_Password_string: 'Passwort ist erforderlich',
	LOGIN_ZOD_Password_regex:
		'Das Passwort muss mindestens 8 Zeichen lang sein und mindestens einen Buchstaben, eine Zahl und ein Sonderzeichen enthalten.',
	LOGIN_ZOD_Confirm_password_string: 'Passwortbestätigung ist erforderlich',
	LOGIN_ZOD_Confirm_password_regex:
		'Das Passwort muss aus mindestens 8 Zeichen bestehen und mindestens einen Buchstaben, eine Zahl und ein Sonderzeichen enthalten.',
	LOGIN_ZOD_Token_string: 'Auth Token ist erforderlich',
	LOGIN_ZOD_Password_match: 'Passwort und Bestätigung müssen übereinstimmen',

	LOGIN_ZOD_General_Unkown: 'Unbekannter Fehler aufgetreten',
	LOGIN_ZOD_General_Error: 'Ungültige Eingabe',
	LOGIN_ZOD_Email_Error_inUse: 'E-Mail bereits in Gebrauch',
	LOGIN_ZOD_Email_Error_send: 'Fehler beim Senden einer E-Mail',
	LOGIN_ZOD_Email_Error_Signup: 'LOGIN_ZOD_Signup_unkown',
	LOGIN_ZOD_Email_Error_SignupKey: 'Falsche E-Mail oder falsches Passwort',
	LOGIN_ZOD_Token_Error: 'Token ist falsch!',
	LOGIN_ZOD_Token_Expired: 'Token ist abgelaufen!',
	LOGIN_ZOD_Forgotton_Error: 'Kein Konto unter dieser E-Mail-Adresse',
	LOGIN_ZOD_Forgotton_email:
		'Hallo,<br><br>Wir haben eine Anfrage erhalten, Ihr Passwort zurückzusetzen. Ihr Passwort-Reset-Token lautet:<br><br>{token:string}<br><br>Bitte folgen Sie dem untenstehenden Link, um Ihr Passwort zurückzusetzen:<br>{link:string}<br><br>Falls Sie diese Rücksetzung nicht angefordert haben, ignorieren Sie bitte diese Nachricht.<br><br>Mit freundlichen Grüßen,<br>Ihr Support Team',

	// Entry List
	ENTRYLIST_Create: 'Erstellen',
	ENTRYLIST_Publish: 'Publizieren',
	ENTRYLIST_Unpublish: 'Archivieren',
	ENTRYLIST_Schedule: 'Planen',
	ENTRYLIST_Clone: 'Kopieren',
	ENTRYLIST_Delete: 'Löschen',
	ENTRYLIST_Delete_title: 'Bitte bestätigen Sie die Löschung',
	ENTRYLIST_Delete_body: 'Sind Sie sicher, dass Sie fortfahren möchten?',
	ENTRYLIST_Delete_cancel: 'Abbrechen',
	ENTRYLIST_Delete_confirm: 'Bestätigen',
	ENTRYLIST_Search: 'Suchen',
	ENTRYLIST_Loading: 'Laden ...',
	ENTRYLIST_Showing: 'Es werden',
	ENTRYLIST_to: 'bis',
	ENTRYLIST_of: 'von',
	ENTRYLIST_Entries: 'Einträgen angezeigt',
	ENTRYLIST_EntriesItems: 'Einträge',
	ENTRYLIST_Previous: 'Zurück',
	ENTRYLIST_Next: 'Weiter',

	// Fields

	// Form
	FORM_Create: 'Erstellen',
	FORM_CloseMenu: 'Menü schließen',
	FORM_TT_Closes: 'Schließen ohne Speichern',
	FORM_Required: 'Erforderlich',
	// Alert

	// Collections
	Collections: 'Sammlungen',
	Media: 'Medien',

	COLLECTION_TEST_User: 'Benutzer',
	COLLECTION_TEST_Prefix: 'Präfix',
	COLLECTION_TEST_Prefix_placeholder: 'Präfix eingeben',
	COLLECTION_TEST_First: 'Vornamen',
	COLLECTION_TEST_First_placeholder: 'Vornamen eingeben',
	COLLECTION_TEST_Middle: 'Mittel',
	COLLECTION_TEST_Middle_placeholder: 'Mittel (Schreibgeschützt)',
	COLLECTION_TEST_Last: 'Nachname',
	COLLECTION_TEST_Last_placeholder: 'Nachname eingeben',

	// Widgets
	WIDGET_Address_SearchMap: 'Suche in Karte ...',
	WIDGET_Address_GetAddress: 'Hole von Adresse',
	WIDGET_Address_GetMap: 'Adresse Abrufen',
	WIDGET_Address_Geocoordinates: 'Geokoordinaten',
	WIDGET_Address_Latitude: 'Breitengrad',
	WIDGET_Address_Longitude: 'Längengrad',
	WIDGET_Address_Name: 'Name',
	WIDGET_Address_Street: 'Straße',
	WIDGET_Address_Zip: 'Postleitzahl',
	WIDGET_Address_City: 'Ort',
	WIDGET_Address_SearchCountry: 'Land suchen ...',

	WIDGET_Relation_ChoseExisting: 'Vorhandene auswählen...',
	WIDGET_Relation_Edit: 'Bearbeiten',
	WIDGET_Relation_AddNew: 'Neu hinzufügen',

	WIDGET_Seo_Suggetion_TitlePerfect: 'Ihr Titel hat mehr als 50 Zeichen. Perfekt!',
	WIDGET_Seo_Suggetion_TitleGood:
		'Ihr Titel besteht aus mehr als 30 Zeichen. Versuchen Sie 50+. Gut!',
	WIDGET_Seo_Suggetion_TitleBad:
		'Ihr Titel ist zu kurz. Stellen Sie sicher, dass Ihr Titel mindestens 50 Zeichen lang ist. Schlecht!',
	WIDGET_Seo_Suggetion_DescriptionPerfect:
		'Ihre Beschreibung hat zwischen 120 und 165 Zeichen. Perfekt!',
	WIDGET_Seo_Suggetion_DescriptionGood: 'Ihre Beschreibung besteht aus mehr als 90 Zeichen. Gut!',
	WIDGET_Seo_Suggetion_DescriptionBad: 'Ihre Beschreibung hat weniger als 90 Zeichen. Schlecht!',
	WIDGET_Seo_Suggetion_SentencePerfect:
		'Ihre Beschreibung ist zwischen 2 und 4 Sätzen lang. Perfekt!',
	WIDGET_Seo_Suggetion_SentenceBad:
		'Ihre Beschreibung ist nur 1 Satz lang. Stellen Sie sicher, dass Ihre Beschreibung 2 bis 4 Sätze lang ist.',

	WIDGET_Seo_Suggetion_NumberPerfect: 'Ihr Titel verwendet Zahlen. Perfekt!',
	WIDGET_Seo_Suggetion_NumberBad:
		'Ihr Titel verwendet keine Zahlen. Die Verwendung von Zahlen in Ihrem Titel kann Ihre CTR erhöhen.',
	WIDGET_Seo_Suggetion_PowerWordTitle: `Ihr Titel enthält das Power Word Wort Perfect!`,
	WIDGET_Seo_Suggetion_PowerWordDescription: `Ihre Beschreibung verwendet das Power-Word-Wort. Perfekt!`,
	WIDGET_Seo_Suggetion_ctaKeywordsTitle: `Ihr Titel enthält das CTA-Schlüsselwort. Gut!`,
	WIDGET_Seo_Suggetion_ctaKeywordsDescription: `Ihre Beschreibung enthält das CTA-Schlüsselwort. Gut!`,
	WIDGET_Seo_Suggetion_Title: 'Titel:',
	WIDGET_Seo_Suggetion_Character: 'Zeichen:',
	WIDGET_Seo_Suggetion_WidthDesktop: '- Desktop:',
	WIDGET_Seo_Suggetion_WidthMobile: 'Mobil: ',
	WIDGET_Seo_Suggetion_SeoTitle: 'SEO Titel: ',
	WIDGET_Seo_Suggetion_Description: 'Beschreibung:',
	WIDGET_Seo_Suggetion_SeoDescription: 'SEO Beschreibung',
	WIDGET_Seo_Suggetion_SeoPreview: 'SEO-Vorschau',
	WIDGET_Seo_Suggetion_ListOfSuggestion: 'SEO Vorschläge:',
	WIDGET_Seo_Suggetion_Text: 'Titel und Beschreibung für Google-Suchergebnisse optimieren'
};

export default de;
