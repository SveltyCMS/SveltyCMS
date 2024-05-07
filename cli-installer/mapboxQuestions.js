export const mapboxQuestions = [
	{
		type: 'confirm',
		name: 'USE_MAPBOX',
		message: 'Do you want to enable Mapbox?',
		default: false
	},
	{
		type: 'input',
		name: 'MAPBOX_API_TOKEN',
		message: 'Enter the Mapbox API token (leave blank if not required):'
	}
];
