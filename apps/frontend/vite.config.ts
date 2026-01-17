import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port: 5174,
		strictPort: true,
		fs: {
			allow: ['..']
		}
	},
	optimizeDeps: {
		include: []
	}
});
