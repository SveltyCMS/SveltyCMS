import type { Translation } from '../i18n-types';

const es: Translation = {
	// SideBar left
	SBL_Search: 'Buscar ...',
	SBL_Admin: 'Admin',
	SBL_Admin_User: 'Usuario Admin',
	SBL_SystemLanguage: 'Idioma del sistema',
	SBL_isDark: 'Cambiar a',
	SBL_Light: 'Claro',
	SBL_Dark: 'Dunkel',
	SBL_Mode: 'Oscuro',
	SBL_Version: 'Versión',
	SBL_Ver: 'Ver.',
	SBL_Save: 'Guardar',
	SBL_Save_message: 'Datos guardados con éxito',
	SBL_SignOut: 'Cerrar sesión',

	// Collections
	CollectionCategory_Content: 'Contenido',
	CollectionCategory_Menu: 'Menú',
	CollectionCategory_Media: 'Media',

	// SideBar Right

	// Error
	ERROR_Pagenotfound: 'Página no encontrada',
	ERROR_Wrong: 'Lo sentimos, algo ha ido mal',
	ERROR_GoHome: 'A la página de inicio',

	//LOADING
	LOADING_Wait: 'Por favor, espere',
	LOADING_Loading: 'Se está cargando...',

	// USER
	USER_Setting: 'configuración del usuario',
	USER_ID: 'ID de usuario',
	USER_Username: 'Nombre de usuario',
	USER_FirstName: 'Nombre',
	USER_LastName: 'Apellido',
	USER_Email: 'Email',
	USER_Password: 'Contraseña',
	USER_NewPassword: 'Nueva contraseña:',
	USER_Edit: 'Editar usuario',
	USER_Fail: 'Email ya en uso',
	USER_Delete: 'Eliminar usuario',
	USER_Profile: 'Perfil de usuario',
	USER_Edit_Avatar: 'Editar Avatar',
	USER_Role: 'Rol',
	USER_Generate: 'Email token de registro',
	USER_ListShow: 'Mostrar lista de usuarios',
	USER_ListCollapse: 'Cerrar lista de usuarios',
	USER_EmailToken: 'Enviar email de registro de usuario',
	USER_AdminArea: 'Área de administración:',

	// Tanstack
	TANSTACK_UserList: 'Lista de usuarios:',
	TANSTACK_Column: 'Columnas',
	TANSTACK_Toggle: 'Alternar todos',
	TANSTACK_Filter: 'Filtro de facetas',
	TANSTACK_Export: 'Exportación XML',
	TANSTACK_Page: 'Página',
	TANSTACK_Show: 'Mostrar página',
	TANSTACK_of: 'De',
	TANSTACK_Total: 'Total',
	TANSTACK_Row: 'Fila',
	TANSTACK_Rows: 'filas',

	// Login
	LOGIN_SignIn: 'Iniciar sesión',
	LOGIN_SignUp: 'Registrarse',
	LOGIN_Required: '* Requerido',
	LOGIN_Username: 'Nombre de usuario',
	LOGIN_EmailAddress: 'Dirección de correo electrónico',
	LOGIN_Password: 'Contraseña',
	LOGIN_Token: 'Identificador de inicio de sesión',
	LOGIN_ConfirmPassword: 'Confirmar contraseña',
	LOGIN_ForgottenPassword: 'Contraseña olvidada',
	LOGIN_SendResetMail: 'Enviar contraseña por correo electrónico',
	LOGIN_ResetPassword: 'Restablecer contraseña',
	LOGIN_ResetPasswordSave: 'Guardar nueva contraseña',
	LOGIN_SignInSuccess: 'Iniciar sesión con éxito',

	LOGIN_ZOD_Username_string: 'El nombre de usuario es obligatorio',
	LOGIN_ZOD_Username_regex: 'El nombre debe contener sólo letras, dígitos y @$!%*#',
	LOGIN_ZOD_Username_min: 'El nombre debe tener al menos 2 caracteres',
	LOGIN_ZOD_Username_max: 'El nombre debe tener sólo 24 caracteres',
	LOGIN_ZOD_Email_string: 'El correo electrónico es obligatorio',
	LOGIN_ZOD_Email_email: 'El correo electrónico debe ser un correo electrónico válido',
	LOGIN_ZOD_Password_string: 'Se requiere contraseña',
	LOGIN_ZOD_Password_regex:
		'La contraseña debe tener al menos 8 caracteres y contener al menos una letra, un número y un carácter especial',
	LOGIN_ZOD_Confirm_password_string: 'Se requiere confirmación de contraseña',
	LOGIN_ZOD_Confirm_password_regex:
		'La contraseña debe tener al menos 8 caracteres y contener al menos una letra, un número y un carácter especial',
	LOGIN_ZOD_Token_string: 'Se requiere Auth Token',
	LOGIN_ZOD_Password_match: 'La contraseña y la confirmación deben coincidir',

	LOGIN_ZOD_General_Unkown: 'Se ha producido un error desconocido',
	LOGIN_ZOD_General_Error: 'Entrada no válida',
	LOGIN_ZOD_Email_Error_inUse: 'Correo electrónico ya utilizado',
	LOGIN_ZOD_Email_Error_send: 'Error al enviar un e-mail',
	LOGIN_ZOD_Email_Error_Signup: 'LOGIN_ZOD_Signup_unkown',
	LOGIN_ZOD_Email_Error_SignupKey: 'Correo electrónico o contraseña incorrectos',
	LOGIN_ZOD_Token_Error: 'Token incorrecto!',
	LOGIN_ZOD_Token_Expired: 'Token expirado!',
	LOGIN_ZOD_Forgotton_Error: 'No hay cuenta en esta dirección de correo electrónico',
	LOGIN_ZOD_Forgotton_email:
		'Hola,<br><br>Hemos recibido una solicitud para restablecer su contraseña. El token de restablecimiento de contraseña es:<br><br>{token:string}<br><br>Por favor, sigue el siguiente enlace para restablecer tu contraseña:<br>{link:string}<br><br>Si no has solicitado este restablecimiento, por favor, ignora este mensaje.<br><br>Atentamente,<br>Su equipo de soporte',

	// Entry List
	ENTRYLIST_Create: 'Crear',
	ENTRYLIST_Publish: 'Publicar',
	ENTRYLIST_Unpublish: 'Archivar',
	ENTRYLIST_Schedule: 'Programar',
	ENTRYLIST_Clone: 'Copiar',
	ENTRYLIST_Delete: 'Borrar',
	ENTRYLIST_Delete_title: 'Confirmar borrado',
	ENTRYLIST_Delete_body: '¿Seguro que desea continuar?',
	ENTRYLIST_Delete_cancel: 'Cancelar',
	ENTRYLIST_Delete_confirm: 'Confirmar',
	ENTRYLIST_Search: 'Buscar',
	ENTRYLIST_Loading: 'Cargando ...',
	ENTRYLIST_Showing: 'Mostrando',
	ENTRYLIST_to: 'a',
	ENTRYLIST_of: 'de',
	ENTRYLIST_Rows: 'filas”',
	ENTRYLIST_RowsItems: 'Artículos',
	ENTRYLIST_Previous: 'Anterior',
	ENTRYLIST_Next: 'Siguiente',

	// Fields

	// Form
	FORM_Create: 'Crear',
	FORM_CloseMenu: 'Cerrar menú',
	FORM_TT_Closes: 'Cerrar sin guardar',
	FORM_Required: 'Erforderlich',
	// Alert

	// Collections
	Collections: 'Colecciones',
	Media: 'Medios',

	COLLECTION_TEST_User: 'Usuario',
	COLLECTION_TEST_Prefix: 'Prefijo',
	COLLECTION_TEST_Prefix_data: ['Sr.', 'Sra.', 'Srta.', 'Dr.'],
	COLLECTION_TEST_Prefix_placeholder: 'Introducir prefijo',
	COLLECTION_TEST_First: 'Nombre',
	COLLECTION_TEST_First_placeholder: 'Introduzca los nombres',
	COLLECTION_TEST_Middle: 'Segundo nombre',
	COLLECTION_TEST_Middle_placeholder: 'Medio (Sólo lectura)',
	COLLECTION_TEST_Last: 'Apellidos',
	COLLECTION_TEST_Last_placeholder: 'Introduzca el apellido',

	COLLECTION_TEST_Full_Text_Option: 'Opción de texto completo',
	COLLECTION_TEST_Full_Text_Option_Placeholder: 'Introducir texto completo',

	// Widgets
	WIDGET_Address_SearchMap: 'Buscar en mapa ...',
	WIDGET_Address_GetAddress: 'Obtener de la dirección',
	WIDGET_Address_GetMap: 'Obtener dirección',
	WIDGET_Address_Geocoordinates: 'Geocoordenadas',
	WIDGET_Address_Latitude: 'Latitud',
	WIDGET_Address_Longitude: 'Longitud',
	WIDGET_Address_Name: 'Nombre',
	WIDGET_Address_Street: 'Calle',
	WIDGET_Address_Zip: 'Código postal',
	WIDGET_Address_City: 'Ciudad',
	WIDGET_Address_SearchCountry: 'Buscar país ...',

	WIDGET_Relation_ChoseExisting: 'Seleccionar existente...',
	WIDGET_Relation_Edit: 'Editar',
	WIDGET_Relation_AddNew: 'Añadir nueva',

	WIDGET_Seo_Suggetion_TitlePerfect: 'Tu título tiene más de 50 caracteres. ¡Perfecto!',
	WIDGET_Seo_Suggetion_TitleGood:
		'Tu título tiene más de 30 caracteres. Prueba con más de 50. ¡Bien!',
	WIDGET_Seo_Suggetion_TitleBad:
		'Tu título es demasiado corto. Asegúrate de que tu título tiene al menos 50 caracteres. ¡Malo!',
	WIDGET_Seo_Suggetion_DescriptionPerfect:
		'Tu descripción tiene entre 120 y 165 caracteres. ¡Perfecto!',
	WIDGET_Seo_Suggetion_DescriptionGood: 'Tu descripción tiene más de 90 caracteres. ¡Bien!',
	WIDGET_Seo_Suggetion_DescriptionBad: 'Tu descripción tiene menos de 90 caracteres. ¡Malo!',
	WIDGET_Seo_Suggetion_SentencePerfect: 'Tu descripción tiene entre 2 y 4 frases. ¡Perfecto!',
	WIDGET_Seo_Suggetion_SentenceBad:
		'Tu descripción sólo tiene 1 frase. Asegúrate de que tu descripción tenga entre 2 y 4 frases.',

	WIDGET_Seo_Suggetion_NumberPerfect: 'Tu título utiliza números. ¡Perfecto!',
	WIDGET_Seo_Suggetion_NumberBad:
		'Tu título no usa números. Usar números en tu título puede aumentar tu CTR.',
	WIDGET_Seo_Suggetion_PowerWordTitle: `Tu título contiene la palabra poderosa ¡Perfecto!`,
	WIDGET_Seo_Suggetion_PowerWordDescription: `ITu descripción utiliza la palabra poderosa palabra. ¡Perfecto!`,
	WIDGET_Seo_Suggetion_ctaKeywordsTitle: `Tu título contiene la palabra clave CTA. Bien!`,
	WIDGET_Seo_Suggetion_ctaKeywordsDescription: `Tu descripción contiene la palabra clave CTA. Bien!`,
	WIDGET_Seo_Suggetion_Title: 'Título:',
	WIDGET_Seo_Suggetion_Character: 'Carácter:',
	WIDGET_Seo_Suggetion_WidthDesktop: '- Escritorio:',
	WIDGET_Seo_Suggetion_WidthMobile: 'Móvil: ',
	WIDGET_Seo_Suggetion_SeoTitle: 'Título SEO: ',
	WIDGET_Seo_Suggetion_Description: 'Descripción:',
	WIDGET_Seo_Suggetion_SeoDescription: 'Descripción SEO',
	WIDGET_Seo_Suggetion_SeoPreview: 'Vista previa SEO',
	WIDGET_Seo_Suggetion_ListOfSuggestion: 'Sugerencias SEO:',
	WIDGET_Seo_Suggetion_Text:
		'Optimizar el título y la descripción para los resultados de búsqueda de Google'
};

export default es;
