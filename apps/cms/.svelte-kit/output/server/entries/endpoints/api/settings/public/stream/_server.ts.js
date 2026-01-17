import { s as subscribeToSettingsChanges } from '../../../../../../chunks/settingsVersion.js';
const GET = async () => {
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(`data: ${JSON.stringify({ type: 'connected' })}

`);
			const unsubscribe = subscribeToSettingsChanges((version) => {
				controller.enqueue(`data: ${JSON.stringify({ type: 'update', version })}

`);
			});
			const heartbeat = setInterval(() => {
				try {
					controller.enqueue(`: heartbeat

`);
				} catch {
					clearInterval(heartbeat);
				}
			}, 3e4);
			return () => {
				clearInterval(heartbeat);
				unsubscribe();
			};
		}
	});
	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
export { GET };
//# sourceMappingURL=_server.ts.js.map
