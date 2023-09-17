// Plesk Passanager
async function loadApp() {
	process.env.BODY_SIZE_LIMIT = '104857600';
	process.env.PORT = '4173';
	import('./build/index.js');
}
loadApp();
