import adapter from "svelte-adapter-uws"; // To generate a high-performance uWebSockets.js server
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: [vitePreprocess()],

  // Enable Svelte 5 runes mode for better HMR and modern reactivity
  compilerOptions: {
    runes: true,
    experimental: {
      async: true,
    },
  },

  kit: {
    experimental: {
      remoteFunctions: true,
    },
    // See https://kit.svelte.dev/docs/adapters for more information about adapters.
    adapter: adapter({
      out: "build", // default: true | The directory to build the server to
      precompress: true, // ✅ Enables precompressing using gzip & brotli
      envPrefix: "", // default: ''
      websocket: true, // ✅ Enable uWebSockets.js support for svelte-realtime
    }),

    alias: {
      $paraglide: "./src/paraglide",
      "@api": "./src/routes/api",
      "@auth": "./src/databases/auth",
      "@collections": "./config/collections",
      "@config": "./config",
      "@components": "./src/components",
      "@content": "./src/content",
      "@databases": "./src/databases",
      "@hooks": "./src/hooks",
      "@root": ".",
      "@services": "./src/services",
      "@src": "./src",
      "@static": "./static",
      "@stores": "./src/stores",
      "@themes": "./src/themes",
      "@types": "./src/types",
      "@utils": "./src/utils",
      "@widgets": "./src/widgets",
    },

    // Use SvelteKit's built-in CSP support
    // Note: CSRF protection is enabled by default in SvelteKit for non-GET requests
    // If specific cross-origin POST/PUT/DELETE requests need to be allowed, configure `trustedOrigins` here.
    csrf: {
      trustedOrigins: [
        "http://127.0.0.1:4173",
        "http://127.0.0.1:4174",
        "http://127.0.0.1:4175",
        "http://127.0.0.1:4176",
        "http://127.0.0.1:4177",
        "http://127.0.0.1:4178",
        "http://127.0.0.1:4179",
        "http://localhost:4173",
      ],
    },
    csp: {
      mode: "nonce", // Use nonce for inline scripts (not hash)
      directives: {
        "default-src": ["self"],
        // Strict CSP: No unsafe-inline or unsafe-eval in production.
        // Nonce-based protection is automatically handled by SvelteKit.
        "script-src": ["self", "blob:", "https://*.iconify.design", "https://code.iconify.design"],
        "worker-src": ["self", "blob:"],
        "style-src": ["self", "https://*.iconify.design"],
        "img-src": [
          "self",
          "data:",
          "blob:",
          "https://*.iconify.design",
          "https://*.simplesvg.com",
          "https://*.unisvg.com",
          "https://placehold.co",
          "https://api.qrserver.com",
          "https://github.com",
          "https://raw.githubusercontent.com",
        ],
        "font-src": ["self", "data:"],
        "connect-src": [
          "self",
          "https://*.iconify.design",
          "https://*.simplesvg.com",
          "https://*.unisvg.com",
          "https://code.iconify.design",
          "https://raw.githubusercontent.com",
          "wss:",
          "ws:",
        ],
        "object-src": ["none"],
        "base-uri": ["self"],
        "form-action": ["self"],
        "frame-src": ["self", "https://127.0.0.1:5173", "https://localhost:5173"],
      },
    },
  },

  // plugin options
  vitePlugin: {
    // experimental options
    experimental: {},
  },
};

export default config;
