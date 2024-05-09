import inquirer from 'inquirer';

export async function confirmAction(message) {
	const response = await inquirer.prompt({
		type: 'expand',
		name: 'confirmAction',
		message: message,
		choices: [
			{ key: 'c', name: 'Cancel', value: 'cancel' },
			{ key: 's', name: 'Save and Continue', value: 'save' }
		],
		default: 'save'
	});

	return response.confirmAction;
}
