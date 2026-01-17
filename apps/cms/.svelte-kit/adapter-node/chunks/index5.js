import {
	H as HYDRATION_START,
	c as HYDRATION_END,
	S as STALE_REACTION,
	E as ELEMENT_PRESERVE_ATTRIBUTE_CASE,
	d as ELEMENT_IS_INPUT,
	e as ELEMENT_IS_NAMESPACED,
	a as subscribe_to_store
} from './utils2.js';
import { clsx as clsx$1 } from 'clsx';
import * as devalue from 'devalue';
function lifecycle_outside_component(name) {
	{
		throw new Error(`https://svelte.dev/e/lifecycle_outside_component`);
	}
}
const DOM_BOOLEAN_ATTRIBUTES = [
	'allowfullscreen',
	'async',
	'autofocus',
	'autoplay',
	'checked',
	'controls',
	'default',
	'disabled',
	'formnovalidate',
	'indeterminate',
	'inert',
	'ismap',
	'loop',
	'multiple',
	'muted',
	'nomodule',
	'novalidate',
	'open',
	'playsinline',
	'readonly',
	'required',
	'reversed',
	'seamless',
	'selected',
	'webkitdirectory',
	'defer',
	'disablepictureinpicture',
	'disableremoteplayback'
];
function is_boolean_attribute(name) {
	return DOM_BOOLEAN_ATTRIBUTES.includes(name);
}
const PASSIVE_EVENTS = ['touchstart', 'touchmove'];
function is_passive_event(name) {
	return PASSIVE_EVENTS.includes(name);
}
const ATTR_REGEX = /[&"<]/g;
const CONTENT_REGEX = /[&<]/g;
function escape_html(value, is_attr) {
	const str = String(value ?? '');
	const pattern = is_attr ? ATTR_REGEX : CONTENT_REGEX;
	pattern.lastIndex = 0;
	let escaped = '';
	let last = 0;
	while (pattern.test(str)) {
		const i = pattern.lastIndex - 1;
		const ch = str[i];
		escaped += str.substring(last, i) + (ch === '&' ? '&amp;' : ch === '"' ? '&quot;' : '&lt;');
		last = i + 1;
	}
	return escaped + str.substring(last);
}
const replacements = {
	translate: /* @__PURE__ */ new Map([
		[true, 'yes'],
		[false, 'no']
	])
};
function attr(name, value, is_boolean = false) {
	if (name === 'hidden' && value !== 'until-found') {
		is_boolean = true;
	}
	if (value == null || (!value && is_boolean)) return '';
	const normalized = (name in replacements && replacements[name].get(value)) || value;
	const assignment = is_boolean ? '' : `="${escape_html(normalized, true)}"`;
	return ` ${name}${assignment}`;
}
function clsx(value) {
	if (typeof value === 'object') {
		return clsx$1(value);
	} else {
		return value ?? '';
	}
}
const whitespace = [...' 	\n\r\f \v\uFEFF'];
function to_class(value, hash, directives) {
	var classname = value == null ? '' : '' + value;
	if (hash) {
		classname = classname ? classname + ' ' + hash : hash;
	}
	if (directives) {
		for (var key in directives) {
			if (directives[key]) {
				classname = classname ? classname + ' ' + key : key;
			} else if (classname.length) {
				var len = key.length;
				var a = 0;
				while ((a = classname.indexOf(key, a)) >= 0) {
					var b = a + len;
					if ((a === 0 || whitespace.includes(classname[a - 1])) && (b === classname.length || whitespace.includes(classname[b]))) {
						classname = (a === 0 ? '' : classname.substring(0, a)) + classname.substring(b + 1);
					} else {
						a = b;
					}
				}
			}
		}
	}
	return classname === '' ? null : classname;
}
function append_styles(styles, important = false) {
	var separator = important ? ' !important;' : ';';
	var css = '';
	for (var key in styles) {
		var value = styles[key];
		if (value != null && value !== '') {
			css += ' ' + key + ': ' + value + separator;
		}
	}
	return css;
}
function to_css_name(name) {
	if (name[0] !== '-' || name[1] !== '-') {
		return name.toLowerCase();
	}
	return name;
}
function to_style(value, styles) {
	if (styles) {
		var new_style = '';
		var normal_styles;
		var important_styles;
		if (Array.isArray(styles)) {
			normal_styles = styles[0];
			important_styles = styles[1];
		} else {
			normal_styles = styles;
		}
		if (value) {
			value = String(value)
				.replaceAll(/\s*\/\*.*?\*\/\s*/g, '')
				.trim();
			var in_str = false;
			var in_apo = 0;
			var in_comment = false;
			var reserved_names = [];
			if (normal_styles) {
				reserved_names.push(...Object.keys(normal_styles).map(to_css_name));
			}
			if (important_styles) {
				reserved_names.push(...Object.keys(important_styles).map(to_css_name));
			}
			var start_index = 0;
			var name_index = -1;
			const len = value.length;
			for (var i = 0; i < len; i++) {
				var c = value[i];
				if (in_comment) {
					if (c === '/' && value[i - 1] === '*') {
						in_comment = false;
					}
				} else if (in_str) {
					if (in_str === c) {
						in_str = false;
					}
				} else if (c === '/' && value[i + 1] === '*') {
					in_comment = true;
				} else if (c === '"' || c === "'") {
					in_str = c;
				} else if (c === '(') {
					in_apo++;
				} else if (c === ')') {
					in_apo--;
				}
				if (!in_comment && in_str === false && in_apo === 0) {
					if (c === ':' && name_index === -1) {
						name_index = i;
					} else if (c === ';' || i === len - 1) {
						if (name_index !== -1) {
							var name = to_css_name(value.substring(start_index, name_index).trim());
							if (!reserved_names.includes(name)) {
								if (c !== ';') {
									i++;
								}
								var property = value.substring(start_index, i).trim();
								new_style += ' ' + property + ';';
							}
						}
						start_index = i + 1;
						name_index = -1;
					}
				}
			}
		}
		if (normal_styles) {
			new_style += append_styles(normal_styles);
		}
		if (important_styles) {
			new_style += append_styles(important_styles, true);
		}
		new_style = new_style.trim();
		return new_style === '' ? null : new_style;
	}
	return value == null ? null : String(value);
}
const BLOCK_OPEN = `<!--${HYDRATION_START}-->`;
const BLOCK_CLOSE = `<!--${HYDRATION_END}-->`;
const EMPTY_COMMENT = `<!---->`;
let controller = null;
function abort() {
	controller?.abort(STALE_REACTION);
	controller = null;
}
function await_invalid() {
	const error = new Error(`await_invalid
Encountered asynchronous work while rendering synchronously.
https://svelte.dev/e/await_invalid`);
	error.name = 'Svelte error';
	throw error;
}
function invalid_csp() {
	const error = new Error(`invalid_csp
\`csp.nonce\` was set while \`csp.hash\` was \`true\`. These options cannot be used simultaneously.
https://svelte.dev/e/invalid_csp`);
	error.name = 'Svelte error';
	throw error;
}
function server_context_required() {
	const error = new Error(`server_context_required
Could not resolve \`render\` context.
https://svelte.dev/e/server_context_required`);
	error.name = 'Svelte error';
	throw error;
}
var ssr_context = null;
function set_ssr_context(v) {
	ssr_context = v;
}
function getContext(key) {
	const context_map = get_or_init_context_map();
	const result =
		/** @type {T} */
		context_map.get(key);
	return result;
}
function setContext(key, context) {
	get_or_init_context_map().set(key, context);
	return context;
}
function getAllContexts() {
	return get_or_init_context_map();
}
function get_or_init_context_map(name) {
	if (ssr_context === null) {
		lifecycle_outside_component();
	}
	return (ssr_context.c ??= new Map(get_parent_context(ssr_context) || void 0));
}
function push(fn) {
	ssr_context = { p: ssr_context, c: null, r: null };
}
function pop() {
	ssr_context = /** @type {SSRContext} */ ssr_context.p;
}
function get_parent_context(ssr_context2) {
	let parent = ssr_context2.p;
	while (parent !== null) {
		const context_map = parent.c;
		if (context_map !== null) {
			return context_map;
		}
		parent = parent.p;
	}
	return null;
}
function unresolved_hydratable(key, stack) {
	{
		console.warn(`https://svelte.dev/e/unresolved_hydratable`);
	}
}
function get_render_context() {
	const store = als?.getStore();
	{
		server_context_required();
	}
	return store;
}
let als = null;
let text_encoder;
let crypto;
async function sha256(data) {
	text_encoder ??= new TextEncoder();
	crypto ??= globalThis.crypto?.subtle?.digest
		? globalThis.crypto
		: // @ts-ignore - we don't install node types in the prod build
			(await import('node:crypto')).webcrypto;
	const hash_buffer = await crypto.subtle.digest('SHA-256', text_encoder.encode(data));
	return base64_encode(hash_buffer);
}
function base64_encode(bytes) {
	if (globalThis.Buffer) {
		return globalThis.Buffer.from(bytes).toString('base64');
	}
	let binary = '';
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}
class Renderer {
	/**
	 * The contents of the renderer.
	 * @type {RendererItem[]}
	 */
	#out = [];
	/**
	 * Any `onDestroy` callbacks registered during execution of this renderer.
	 * @type {(() => void)[] | undefined}
	 */
	#on_destroy = void 0;
	/**
	 * Whether this renderer is a component body.
	 * @type {boolean}
	 */
	#is_component_body = false;
	/**
	 * The type of string content that this renderer is accumulating.
	 * @type {RendererType}
	 */
	type;
	/** @type {Renderer | undefined} */
	#parent;
	/**
	 * Asynchronous work associated with this renderer
	 * @type {Promise<void> | undefined}
	 */
	promise = void 0;
	/**
	 * State which is associated with the content tree as a whole.
	 * It will be re-exposed, uncopied, on all children.
	 * @type {SSRState}
	 * @readonly
	 */
	global;
	/**
	 * State that is local to the branch it is declared in.
	 * It will be shallow-copied to all children.
	 *
	 * @type {{ select_value: string | undefined }}
	 */
	local;
	/**
	 * @param {SSRState} global
	 * @param {Renderer | undefined} [parent]
	 */
	constructor(global, parent) {
		this.#parent = parent;
		this.global = global;
		this.local = parent ? { ...parent.local } : { select_value: void 0 };
		this.type = parent ? parent.type : 'body';
	}
	/**
	 * @param {(renderer: Renderer) => void} fn
	 */
	head(fn) {
		const head2 = new Renderer(this.global, this);
		head2.type = 'head';
		this.#out.push(head2);
		head2.child(fn);
	}
	/**
	 * @param {Array<Promise<void>>} blockers
	 * @param {(renderer: Renderer) => void} fn
	 */
	async_block(blockers, fn) {
		this.#out.push(BLOCK_OPEN);
		this.async(blockers, fn);
		this.#out.push(BLOCK_CLOSE);
	}
	/**
	 * @param {Array<Promise<void>>} blockers
	 * @param {(renderer: Renderer) => void} fn
	 */
	async(blockers, fn) {
		let callback = fn;
		if (blockers.length > 0) {
			const context = ssr_context;
			callback = (renderer) => {
				return Promise.all(blockers).then(() => {
					const previous_context = ssr_context;
					try {
						set_ssr_context(context);
						return fn(renderer);
					} finally {
						set_ssr_context(previous_context);
					}
				});
			};
		}
		this.child(callback);
	}
	/**
	 * @param {Array<() => void>} thunks
	 */
	run(thunks) {
		const context = ssr_context;
		let promise = Promise.resolve(thunks[0]());
		const promises = [promise];
		for (const fn of thunks.slice(1)) {
			promise = promise.then(() => {
				const previous_context = ssr_context;
				set_ssr_context(context);
				try {
					return fn();
				} finally {
					set_ssr_context(previous_context);
				}
			});
			promises.push(promise);
		}
		return promises;
	}
	/**
	 * Create a child renderer. The child renderer inherits the state from the parent,
	 * but has its own content.
	 * @param {(renderer: Renderer) => MaybePromise<void>} fn
	 */
	child(fn) {
		const child = new Renderer(this.global, this);
		this.#out.push(child);
		const parent = ssr_context;
		set_ssr_context({
			...ssr_context,
			p: parent,
			c: null,
			r: child
		});
		const result = fn(child);
		set_ssr_context(parent);
		if (result instanceof Promise) {
			if (child.global.mode === 'sync') {
				await_invalid();
			}
			result.catch(() => {});
			child.promise = result;
		}
		return child;
	}
	/**
	 * Create a component renderer. The component renderer inherits the state from the parent,
	 * but has its own content. It is treated as an ordering boundary for ondestroy callbacks.
	 * @param {(renderer: Renderer) => MaybePromise<void>} fn
	 * @param {Function} [component_fn]
	 * @returns {void}
	 */
	component(fn, component_fn) {
		push();
		const child = this.child(fn);
		child.#is_component_body = true;
		pop();
	}
	/**
	 * @param {Record<string, any>} attrs
	 * @param {(renderer: Renderer) => void} fn
	 * @param {string | undefined} [css_hash]
	 * @param {Record<string, boolean> | undefined} [classes]
	 * @param {Record<string, string> | undefined} [styles]
	 * @param {number | undefined} [flags]
	 * @returns {void}
	 */
	select(attrs, fn, css_hash, classes, styles, flags) {
		const { value, ...select_attrs } = attrs;
		this.push(`<select${attributes(select_attrs, css_hash, classes, styles, flags)}>`);
		this.child((renderer) => {
			renderer.local.select_value = value;
			fn(renderer);
		});
		this.push('</select>');
	}
	/**
	 * @param {Record<string, any>} attrs
	 * @param {string | number | boolean | ((renderer: Renderer) => void)} body
	 * @param {string | undefined} [css_hash]
	 * @param {Record<string, boolean> | undefined} [classes]
	 * @param {Record<string, string> | undefined} [styles]
	 * @param {number | undefined} [flags]
	 */
	option(attrs, body, css_hash, classes, styles, flags) {
		this.#out.push(`<option${attributes(attrs, css_hash, classes, styles, flags)}`);
		const close = (renderer, value, { head: head2, body: body2 }) => {
			if ('value' in attrs) {
				value = attrs.value;
			}
			if (value === this.local.select_value) {
				renderer.#out.push(' selected');
			}
			renderer.#out.push(`>${body2}</option>`);
			if (head2) {
				renderer.head((child) => child.push(head2));
			}
		};
		if (typeof body === 'function') {
			this.child((renderer) => {
				const r = new Renderer(this.global, this);
				body(r);
				if (this.global.mode === 'async') {
					return r.#collect_content_async().then((content) => {
						close(renderer, content.body.replaceAll('<!---->', ''), content);
					});
				} else {
					const content = r.#collect_content();
					close(renderer, content.body.replaceAll('<!---->', ''), content);
				}
			});
		} else {
			close(this, body, { body });
		}
	}
	/**
	 * @param {(renderer: Renderer) => void} fn
	 */
	title(fn) {
		const path = this.get_path();
		const close = (head2) => {
			this.global.set_title(head2, path);
		};
		this.child((renderer) => {
			const r = new Renderer(renderer.global, renderer);
			fn(r);
			if (renderer.global.mode === 'async') {
				return r.#collect_content_async().then((content) => {
					close(content.head);
				});
			} else {
				const content = r.#collect_content();
				close(content.head);
			}
		});
	}
	/**
	 * @param {string | (() => Promise<string>)} content
	 */
	push(content) {
		if (typeof content === 'function') {
			this.child(async (renderer) => renderer.push(await content()));
		} else {
			this.#out.push(content);
		}
	}
	/**
	 * @param {() => void} fn
	 */
	on_destroy(fn) {
		(this.#on_destroy ??= []).push(fn);
	}
	/**
	 * @returns {number[]}
	 */
	get_path() {
		return this.#parent ? [...this.#parent.get_path(), this.#parent.#out.indexOf(this)] : [];
	}
	/**
	 * @deprecated this is needed for legacy component bindings
	 */
	copy() {
		const copy = new Renderer(this.global, this.#parent);
		copy.#out = this.#out.map((item) => (item instanceof Renderer ? item.copy() : item));
		copy.promise = this.promise;
		return copy;
	}
	/**
	 * @param {Renderer} other
	 * @deprecated this is needed for legacy component bindings
	 */
	subsume(other) {
		if (this.global.mode !== other.global.mode) {
			throw new Error("invariant: A renderer cannot switch modes. If you're seeing this, there's a compiler bug. File an issue!");
		}
		this.local = other.local;
		this.#out = other.#out.map((item) => {
			if (item instanceof Renderer) {
				item.subsume(item);
			}
			return item;
		});
		this.promise = other.promise;
		this.type = other.type;
	}
	get length() {
		return this.#out.length;
	}
	/**
	 * Only available on the server and when compiling with the `server` option.
	 * Takes a component and returns an object with `body` and `head` properties on it, which you can use to populate the HTML when server-rendering your app.
	 * @template {Record<string, any>} Props
	 * @param {Component<Props>} component
	 * @param {{ props?: Omit<Props, '$$slots' | '$$events'>; context?: Map<any, any>; idPrefix?: string; csp?: Csp }} [options]
	 * @returns {RenderOutput}
	 */
	static render(component, options = {}) {
		let sync;
		const result =
			/** @type {RenderOutput} */
			{};
		Object.defineProperties(result, {
			html: {
				get: () => {
					return (sync ??= Renderer.#render(component, options)).body;
				}
			},
			head: {
				get: () => {
					return (sync ??= Renderer.#render(component, options)).head;
				}
			},
			body: {
				get: () => {
					return (sync ??= Renderer.#render(component, options)).body;
				}
			},
			hashes: {
				value: {
					script: ''
				}
			},
			then: {
				value:
					/**
					 * this is not type-safe, but honestly it's the best I can do right now, and it's a straightforward function.
					 *
					 * @template TResult1
					 * @template [TResult2=never]
					 * @param { (value: SyncRenderOutput) => TResult1 } onfulfilled
					 * @param { (reason: unknown) => TResult2 } onrejected
					 */
					(onfulfilled, onrejected) => {
						{
							const result2 = (sync ??= Renderer.#render(component, options));
							const user_result = onfulfilled({
								head: result2.head,
								body: result2.body,
								html: result2.body,
								hashes: { script: [] }
							});
							return Promise.resolve(user_result);
						}
					}
			}
		});
		return result;
	}
	/**
	 * Collect all of the `onDestroy` callbacks registered during rendering. In an async context, this is only safe to call
	 * after awaiting `collect_async`.
	 *
	 * Child renderers are "porous" and don't affect execution order, but component body renderers
	 * create ordering boundaries. Within a renderer, callbacks run in order until hitting a component boundary.
	 * @returns {Iterable<() => void>}
	 */
	*#collect_on_destroy() {
		for (const component of this.#traverse_components()) {
			yield* component.#collect_ondestroy();
		}
	}
	/**
	 * Performs a depth-first search of renderers, yielding the deepest components first, then additional components as we backtrack up the tree.
	 * @returns {Iterable<Renderer>}
	 */
	*#traverse_components() {
		for (const child of this.#out) {
			if (typeof child !== 'string') {
				yield* child.#traverse_components();
			}
		}
		if (this.#is_component_body) {
			yield this;
		}
	}
	/**
	 * @returns {Iterable<() => void>}
	 */
	*#collect_ondestroy() {
		if (this.#on_destroy) {
			for (const fn of this.#on_destroy) {
				yield fn;
			}
		}
		for (const child of this.#out) {
			if (child instanceof Renderer && !child.#is_component_body) {
				yield* child.#collect_ondestroy();
			}
		}
	}
	/**
	 * Render a component. Throws if any of the children are performing asynchronous work.
	 *
	 * @template {Record<string, any>} Props
	 * @param {Component<Props>} component
	 * @param {{ props?: Omit<Props, '$$slots' | '$$events'>; context?: Map<any, any>; idPrefix?: string }} options
	 * @returns {AccumulatedContent}
	 */
	static #render(component, options) {
		var previous_context = ssr_context;
		try {
			const renderer = Renderer.#open_render('sync', component, options);
			const content = renderer.#collect_content();
			return Renderer.#close_render(content, renderer);
		} finally {
			abort();
			set_ssr_context(previous_context);
		}
	}
	/**
	 * Render a component.
	 *
	 * @template {Record<string, any>} Props
	 * @param {Component<Props>} component
	 * @param {{ props?: Omit<Props, '$$slots' | '$$events'>; context?: Map<any, any>; idPrefix?: string; csp?: Csp }} options
	 * @returns {Promise<AccumulatedContent & { hashes: { script: Sha256Source[] } }>}
	 */
	static async #render_async(component, options) {
		const previous_context = ssr_context;
		try {
			const renderer = Renderer.#open_render('async', component, options);
			const content = await renderer.#collect_content_async();
			const hydratables = await renderer.#collect_hydratables();
			if (hydratables !== null) {
				content.head = hydratables + content.head;
			}
			return Renderer.#close_render(content, renderer);
		} finally {
			set_ssr_context(previous_context);
			abort();
		}
	}
	/**
	 * Collect all of the code from the `out` array and return it as a string, or a promise resolving to a string.
	 * @param {AccumulatedContent} content
	 * @returns {AccumulatedContent}
	 */
	#collect_content(content = { head: '', body: '' }) {
		for (const item of this.#out) {
			if (typeof item === 'string') {
				content[this.type] += item;
			} else if (item instanceof Renderer) {
				item.#collect_content(content);
			}
		}
		return content;
	}
	/**
	 * Collect all of the code from the `out` array and return it as a string.
	 * @param {AccumulatedContent} content
	 * @returns {Promise<AccumulatedContent>}
	 */
	async #collect_content_async(content = { head: '', body: '' }) {
		await this.promise;
		for (const item of this.#out) {
			if (typeof item === 'string') {
				content[this.type] += item;
			} else if (item instanceof Renderer) {
				await item.#collect_content_async(content);
			}
		}
		return content;
	}
	async #collect_hydratables() {
		const ctx = get_render_context().hydratable;
		for (const [_, key] of ctx.unresolved_promises) {
			unresolved_hydratable(key, ctx.lookup.get(key)?.stack ?? '<missing stack trace>');
		}
		for (const comparison of ctx.comparisons) {
			await comparison;
		}
		return await this.#hydratable_block(ctx);
	}
	/**
	 * @template {Record<string, any>} Props
	 * @param {'sync' | 'async'} mode
	 * @param {import('svelte').Component<Props>} component
	 * @param {{ props?: Omit<Props, '$$slots' | '$$events'>; context?: Map<any, any>; idPrefix?: string; csp?: Csp }} options
	 * @returns {Renderer}
	 */
	static #open_render(mode, component, options) {
		const renderer = new Renderer(new SSRState(mode, options.idPrefix ? options.idPrefix + '-' : '', options.csp));
		renderer.push(BLOCK_OPEN);
		if (options.context) {
			push();
			ssr_context.c = options.context;
			ssr_context.r = renderer;
		}
		component(renderer, options.props ?? {});
		if (options.context) {
			pop();
		}
		renderer.push(BLOCK_CLOSE);
		return renderer;
	}
	/**
	 * @param {AccumulatedContent} content
	 * @param {Renderer} renderer
	 * @returns {AccumulatedContent & { hashes: { script: Sha256Source[] } }}
	 */
	static #close_render(content, renderer) {
		for (const cleanup of renderer.#collect_on_destroy()) {
			cleanup();
		}
		let head2 = content.head + renderer.global.get_title();
		let body = content.body;
		for (const { hash, code } of renderer.global.css) {
			head2 += `<style id="${hash}">${code}</style>`;
		}
		return {
			head: head2,
			body,
			hashes: {
				script: renderer.global.csp.script_hashes
			}
		};
	}
	/**
	 * @param {HydratableContext} ctx
	 */
	async #hydratable_block(ctx) {
		if (ctx.lookup.size === 0) {
			return null;
		}
		let entries = [];
		let has_promises = false;
		for (const [k, v] of ctx.lookup) {
			if (v.promises) {
				has_promises = true;
				for (const p of v.promises) await p;
			}
			entries.push(`[${devalue.uneval(k)},${v.serialized}]`);
		}
		let prelude = `const h = (window.__svelte ??= {}).h ??= new Map();`;
		if (has_promises) {
			prelude = `const r = (v) => Promise.resolve(v);
				${prelude}`;
		}
		const body = `
			{
				${prelude}

				for (const [k, v] of [
					${entries.join(',\n					')}
				]) {
					h.set(k, v);
				}
			}
		`;
		let csp_attr = '';
		if (this.global.csp.nonce) {
			csp_attr = ` nonce="${this.global.csp.nonce}"`;
		} else if (this.global.csp.hash) {
			const hash = await sha256(body);
			this.global.csp.script_hashes.push(`sha256-${hash}`);
		}
		return `
		<script${csp_attr}>${body}<\/script>`;
	}
}
class SSRState {
	/** @readonly @type {Csp & { script_hashes: Sha256Source[] }} */
	csp;
	/** @readonly @type {'sync' | 'async'} */
	mode;
	/** @readonly @type {() => string} */
	uid;
	/** @readonly @type {Set<{ hash: string; code: string }>} */
	css = /* @__PURE__ */ new Set();
	/** @type {{ path: number[], value: string }} */
	#title = { path: [], value: '' };
	/**
	 * @param {'sync' | 'async'} mode
	 * @param {string} id_prefix
	 * @param {Csp} csp
	 */
	constructor(mode, id_prefix = '', csp = { hash: false }) {
		this.mode = mode;
		this.csp = { ...csp, script_hashes: [] };
		let uid = 1;
		this.uid = () => `${id_prefix}s${uid++}`;
	}
	get_title() {
		return this.#title.value;
	}
	/**
	 * Performs a depth-first (lexicographic) comparison using the path. Rejects sets
	 * from earlier than or equal to the current value.
	 * @param {string} value
	 * @param {number[]} path
	 */
	set_title(value, path) {
		const current = this.#title.path;
		let i = 0;
		let l = Math.min(path.length, current.length);
		while (i < l && path[i] === current[i]) i += 1;
		if (path[i] === void 0) return;
		if (current[i] === void 0 || path[i] > current[i]) {
			this.#title.path = path;
			this.#title.value = value;
		}
	}
}
const INVALID_ATTR_NAME_CHAR_REGEX =
	/[\s'">/=\u{FDD0}-\u{FDEF}\u{FFFE}\u{FFFF}\u{1FFFE}\u{1FFFF}\u{2FFFE}\u{2FFFF}\u{3FFFE}\u{3FFFF}\u{4FFFE}\u{4FFFF}\u{5FFFE}\u{5FFFF}\u{6FFFE}\u{6FFFF}\u{7FFFE}\u{7FFFF}\u{8FFFE}\u{8FFFF}\u{9FFFE}\u{9FFFF}\u{AFFFE}\u{AFFFF}\u{BFFFE}\u{BFFFF}\u{CFFFE}\u{CFFFF}\u{DFFFE}\u{DFFFF}\u{EFFFE}\u{EFFFF}\u{FFFFE}\u{FFFFF}\u{10FFFE}\u{10FFFF}]/u;
function render(component, options = {}) {
	if (options.csp?.hash && options.csp.nonce) {
		invalid_csp();
	}
	return Renderer.render(
		/** @type {Component<Props>} */
		component,
		options
	);
}
function head(hash, renderer, fn) {
	renderer.head((renderer2) => {
		renderer2.push(`<!--${hash}-->`);
		renderer2.child(fn);
		renderer2.push(EMPTY_COMMENT);
	});
}
function attributes(attrs, css_hash, classes, styles, flags = 0) {
	if (styles) {
		attrs.style = to_style(attrs.style, styles);
	}
	if (attrs.class) {
		attrs.class = clsx(attrs.class);
	}
	if (css_hash || classes) {
		attrs.class = to_class(attrs.class, css_hash, classes);
	}
	let attr_str = '';
	let name;
	const is_html = (flags & ELEMENT_IS_NAMESPACED) === 0;
	const lowercase = (flags & ELEMENT_PRESERVE_ATTRIBUTE_CASE) === 0;
	const is_input = (flags & ELEMENT_IS_INPUT) !== 0;
	for (name in attrs) {
		if (typeof attrs[name] === 'function') continue;
		if (name[0] === '$' && name[1] === '$') continue;
		if (INVALID_ATTR_NAME_CHAR_REGEX.test(name)) continue;
		var value = attrs[name];
		if (lowercase) {
			name = name.toLowerCase();
		}
		if (is_input) {
			if (name === 'defaultvalue' || name === 'defaultchecked') {
				name = name === 'defaultvalue' ? 'value' : 'checked';
				if (attrs[name]) continue;
			}
		}
		attr_str += attr(name, value, is_html && is_boolean_attribute(name));
	}
	return attr_str;
}
function spread_props(props) {
	const merged_props = {};
	let key;
	for (let i = 0; i < props.length; i++) {
		const obj = props[i];
		for (key in obj) {
			const desc = Object.getOwnPropertyDescriptor(obj, key);
			if (desc) {
				Object.defineProperty(merged_props, key, desc);
			} else {
				merged_props[key] = obj[key];
			}
		}
	}
	return merged_props;
}
function stringify(value) {
	return typeof value === 'string' ? value : value == null ? '' : value + '';
}
function attr_class(value, hash, directives) {
	var result = to_class(value, hash, directives);
	return result ? ` class="${escape_html(result, true)}"` : '';
}
function attr_style(value, directives) {
	var result = to_style(value, directives);
	return result ? ` style="${escape_html(result, true)}"` : '';
}
function store_get(store_values, store_name, store) {
	if (store_name in store_values && store_values[store_name][0] === store) {
		return store_values[store_name][2];
	}
	store_values[store_name]?.[1]();
	store_values[store_name] = [store, null, void 0];
	const unsub = subscribe_to_store(
		store,
		/** @param {any} v */
		(v) => (store_values[store_name][2] = v)
	);
	store_values[store_name][1] = unsub;
	return store_values[store_name][2];
}
function unsubscribe_stores(store_values) {
	for (const store_name in store_values) {
		store_values[store_name][1]();
	}
}
function bind_props(props_parent, props_now) {
	for (const key in props_now) {
		const initial_value = props_parent[key];
		const value = props_now[key];
		if (initial_value === void 0 && value !== void 0 && Object.getOwnPropertyDescriptor(props_parent, key)?.set) {
			props_parent[key] = value;
		}
	}
}
function ensure_array_like(array_like_or_iterator) {
	if (array_like_or_iterator) {
		return array_like_or_iterator.length !== void 0 ? array_like_or_iterator : Array.from(array_like_or_iterator);
	}
	return [];
}
function props_id(renderer) {
	const uid = renderer.global.uid();
	renderer.push('<!--$' + uid + '-->');
	return uid;
}
export {
	attr as a,
	attr_style as b,
	stringify as c,
	escape_html as d,
	ensure_array_like as e,
	attributes as f,
	attr_class as g,
	bind_props as h,
	clsx as i,
	getContext as j,
	getAllContexts as k,
	head as l,
	store_get as m,
	setContext as n,
	is_passive_event as o,
	props_id as p,
	spread_props as q,
	render as r,
	ssr_context as s,
	unsubscribe_stores as u
};
//# sourceMappingURL=index5.js.map
