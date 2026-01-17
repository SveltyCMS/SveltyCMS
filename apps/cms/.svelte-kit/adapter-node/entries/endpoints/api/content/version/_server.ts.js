import { json } from '@sveltejs/kit';
import { contentManager } from '../../../../../chunks/ContentManager.js';
const GET = async () => {
	const version = contentManager.getContentVersion();
	return json({ version });
};
export { GET };
//# sourceMappingURL=_server.ts.js.map
