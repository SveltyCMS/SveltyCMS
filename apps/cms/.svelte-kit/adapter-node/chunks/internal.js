import {
	g as HYDRATION_ERROR,
	C as COMMENT_NODE,
	c as HYDRATION_END,
	h as get_next_sibling,
	H as HYDRATION_START,
	i as HYDRATION_START_ELSE,
	j as effect_tracking,
	k as get,
	l as source,
	f as render_effect,
	u as untrack,
	m as increment,
	q as queue_micro_task,
	o as active_effect,
	p as block,
	v as branch,
	B as Batch,
	w as pause_effect,
	x as create_text,
	y as defer_effect,
	z as set_active_effect,
	D as set_active_reaction,
	F as set_component_context,
	G as handle_error,
	I as active_reaction,
	J as component_context,
	K as move_effect,
	L as set_signal_status,
	M as DIRTY,
	N as schedule_effect,
	O as MAYBE_DIRTY,
	P as internal_set,
	Q as destroy_effect,
	R as invoke_error_boundary,
	T as svelte_boundary_reset_onerror,
	U as EFFECT_TRANSPARENT,
	V as EFFECT_PRESERVED,
	W as BOUNDARY_EFFECT,
	X as define_property,
	Y as init_operations,
	Z as get_first_child,
	_ as hydration_failed,
	$ as clear_text_content,
	a0 as array_from,
	a1 as component_root,
	a2 as push,
	a3 as pop,
	a4 as set,
	a5 as LEGACY_PROPS,
	a6 as flushSync,
	a7 as mutable_source
} from './utils2.js';
import { o as is_passive_event, r as render, n as setContext } from './index5.js';
import 'clsx';
import './environment.js';
import './server.js';
let public_env = {};
function set_private_env(environment) {}
function set_public_env(environment) {
	public_env = environment;
}
function hydration_mismatch(location) {
	{
		console.warn(`https://svelte.dev/e/hydration_mismatch`);
	}
}
function svelte_boundary_reset_noop() {
	{
		console.warn(`https://svelte.dev/e/svelte_boundary_reset_noop`);
	}
}
let hydrating = false;
function set_hydrating(value) {
	hydrating = value;
}
let hydrate_node;
function set_hydrate_node(node) {
	if (node === null) {
		hydration_mismatch();
		throw HYDRATION_ERROR;
	}
	return (hydrate_node = node);
}
function hydrate_next() {
	return set_hydrate_node(get_next_sibling(hydrate_node));
}
function next(count = 1) {
	if (hydrating) {
		var i = count;
		var node = hydrate_node;
		while (i--) {
			node = /** @type {TemplateNode} */ get_next_sibling(node);
		}
		hydrate_node = node;
	}
}
function skip_nodes(remove = true) {
	var depth = 0;
	var node = hydrate_node;
	while (true) {
		if (node.nodeType === COMMENT_NODE) {
			var data =
				/** @type {Comment} */
				node.data;
			if (data === HYDRATION_END) {
				if (depth === 0) return node;
				depth -= 1;
			} else if (data === HYDRATION_START || data === HYDRATION_START_ELSE) {
				depth += 1;
			}
		}
		var next2 =
			/** @type {TemplateNode} */
			get_next_sibling(node);
		if (remove) node.remove();
		node = next2;
	}
}
function createSubscriber(start) {
	let subscribers = 0;
	let version = source(0);
	let stop;
	return () => {
		if (effect_tracking()) {
			get(version);
			render_effect(() => {
				if (subscribers === 0) {
					stop = untrack(() => start(() => increment(version)));
				}
				subscribers += 1;
				return () => {
					queue_micro_task(() => {
						subscribers -= 1;
						if (subscribers === 0) {
							stop?.();
							stop = void 0;
							increment(version);
						}
					});
				};
			});
		}
	};
}
var flags = EFFECT_TRANSPARENT | EFFECT_PRESERVED | BOUNDARY_EFFECT;
function boundary(node, props, children) {
	new Boundary(node, props, children);
}
class Boundary {
	/** @type {Boundary | null} */
	parent;
	is_pending = false;
	/** @type {TemplateNode} */
	#anchor;
	/** @type {TemplateNode | null} */
	#hydrate_open = hydrating ? hydrate_node : null;
	/** @type {BoundaryProps} */
	#props;
	/** @type {((anchor: Node) => void)} */
	#children;
	/** @type {Effect} */
	#effect;
	/** @type {Effect | null} */
	#main_effect = null;
	/** @type {Effect | null} */
	#pending_effect = null;
	/** @type {Effect | null} */
	#failed_effect = null;
	/** @type {DocumentFragment | null} */
	#offscreen_fragment = null;
	/** @type {TemplateNode | null} */
	#pending_anchor = null;
	#local_pending_count = 0;
	#pending_count = 0;
	#is_creating_fallback = false;
	/** @type {Set<Effect>} */
	#dirty_effects = /* @__PURE__ */ new Set();
	/** @type {Set<Effect>} */
	#maybe_dirty_effects = /* @__PURE__ */ new Set();
	/**
	 * A source containing the number of pending async deriveds/expressions.
	 * Only created if `$effect.pending()` is used inside the boundary,
	 * otherwise updating the source results in needless `Batch.ensure()`
	 * calls followed by no-op flushes
	 * @type {Source<number> | null}
	 */
	#effect_pending = null;
	#effect_pending_subscriber = createSubscriber(() => {
		this.#effect_pending = source(this.#local_pending_count);
		return () => {
			this.#effect_pending = null;
		};
	});
	/**
	 * @param {TemplateNode} node
	 * @param {BoundaryProps} props
	 * @param {((anchor: Node) => void)} children
	 */
	constructor(node, props, children) {
		this.#anchor = node;
		this.#props = props;
		this.#children = children;
		this.parent = /** @type {Effect} */ active_effect.b;
		this.is_pending = !!this.#props.pending;
		this.#effect = block(() => {
			active_effect.b = this;
			if (hydrating) {
				const comment = this.#hydrate_open;
				hydrate_next();
				const server_rendered_pending =
					/** @type {Comment} */
					comment.nodeType === COMMENT_NODE && /** @type {Comment} */ comment.data === HYDRATION_START_ELSE;
				if (server_rendered_pending) {
					this.#hydrate_pending_content();
				} else {
					this.#hydrate_resolved_content();
					if (this.#pending_count === 0) {
						this.is_pending = false;
					}
				}
			} else {
				var anchor = this.#get_anchor();
				try {
					this.#main_effect = branch(() => children(anchor));
				} catch (error) {
					this.error(error);
				}
				if (this.#pending_count > 0) {
					this.#show_pending_snippet();
				} else {
					this.is_pending = false;
				}
			}
			return () => {
				this.#pending_anchor?.remove();
			};
		}, flags);
		if (hydrating) {
			this.#anchor = hydrate_node;
		}
	}
	#hydrate_resolved_content() {
		try {
			this.#main_effect = branch(() => this.#children(this.#anchor));
		} catch (error) {
			this.error(error);
		}
	}
	#hydrate_pending_content() {
		const pending = this.#props.pending;
		if (!pending) {
			return;
		}
		this.#pending_effect = branch(() => pending(this.#anchor));
		Batch.enqueue(() => {
			var anchor = this.#get_anchor();
			this.#main_effect = this.#run(() => {
				Batch.ensure();
				return branch(() => this.#children(anchor));
			});
			if (this.#pending_count > 0) {
				this.#show_pending_snippet();
			} else {
				pause_effect(
					/** @type {Effect} */
					this.#pending_effect,
					() => {
						this.#pending_effect = null;
					}
				);
				this.is_pending = false;
			}
		});
	}
	#get_anchor() {
		var anchor = this.#anchor;
		if (this.is_pending) {
			this.#pending_anchor = create_text();
			this.#anchor.before(this.#pending_anchor);
			anchor = this.#pending_anchor;
		}
		return anchor;
	}
	/**
	 * Defer an effect inside a pending boundary until the boundary resolves
	 * @param {Effect} effect
	 */
	defer_effect(effect) {
		defer_effect(effect, this.#dirty_effects, this.#maybe_dirty_effects);
	}
	/**
	 * Returns `false` if the effect exists inside a boundary whose pending snippet is shown
	 * @returns {boolean}
	 */
	is_rendered() {
		return !this.is_pending && (!this.parent || this.parent.is_rendered());
	}
	has_pending_snippet() {
		return !!this.#props.pending;
	}
	/**
	 * @param {() => Effect | null} fn
	 */
	#run(fn) {
		var previous_effect = active_effect;
		var previous_reaction = active_reaction;
		var previous_ctx = component_context;
		set_active_effect(this.#effect);
		set_active_reaction(this.#effect);
		set_component_context(this.#effect.ctx);
		try {
			return fn();
		} catch (e) {
			handle_error(e);
			return null;
		} finally {
			set_active_effect(previous_effect);
			set_active_reaction(previous_reaction);
			set_component_context(previous_ctx);
		}
	}
	#show_pending_snippet() {
		const pending =
			/** @type {(anchor: Node) => void} */
			this.#props.pending;
		if (this.#main_effect !== null) {
			this.#offscreen_fragment = document.createDocumentFragment();
			this.#offscreen_fragment.append(
				/** @type {TemplateNode} */
				this.#pending_anchor
			);
			move_effect(this.#main_effect, this.#offscreen_fragment);
		}
		if (this.#pending_effect === null) {
			this.#pending_effect = branch(() => pending(this.#anchor));
		}
	}
	/**
	 * Updates the pending count associated with the currently visible pending snippet,
	 * if any, such that we can replace the snippet with content once work is done
	 * @param {1 | -1} d
	 */
	#update_pending_count(d) {
		if (!this.has_pending_snippet()) {
			if (this.parent) {
				this.parent.#update_pending_count(d);
			}
			return;
		}
		this.#pending_count += d;
		if (this.#pending_count === 0) {
			this.is_pending = false;
			for (const e of this.#dirty_effects) {
				set_signal_status(e, DIRTY);
				schedule_effect(e);
			}
			for (const e of this.#maybe_dirty_effects) {
				set_signal_status(e, MAYBE_DIRTY);
				schedule_effect(e);
			}
			this.#dirty_effects.clear();
			this.#maybe_dirty_effects.clear();
			if (this.#pending_effect) {
				pause_effect(this.#pending_effect, () => {
					this.#pending_effect = null;
				});
			}
			if (this.#offscreen_fragment) {
				this.#anchor.before(this.#offscreen_fragment);
				this.#offscreen_fragment = null;
			}
		}
	}
	/**
	 * Update the source that powers `$effect.pending()` inside this boundary,
	 * and controls when the current `pending` snippet (if any) is removed.
	 * Do not call from inside the class
	 * @param {1 | -1} d
	 */
	update_pending_count(d) {
		this.#update_pending_count(d);
		this.#local_pending_count += d;
		if (this.#effect_pending) {
			internal_set(this.#effect_pending, this.#local_pending_count);
		}
	}
	get_effect_pending() {
		this.#effect_pending_subscriber();
		return get(
			/** @type {Source<number>} */
			this.#effect_pending
		);
	}
	/** @param {unknown} error */
	error(error) {
		var onerror = this.#props.onerror;
		let failed = this.#props.failed;
		if (this.#is_creating_fallback || (!onerror && !failed)) {
			throw error;
		}
		if (this.#main_effect) {
			destroy_effect(this.#main_effect);
			this.#main_effect = null;
		}
		if (this.#pending_effect) {
			destroy_effect(this.#pending_effect);
			this.#pending_effect = null;
		}
		if (this.#failed_effect) {
			destroy_effect(this.#failed_effect);
			this.#failed_effect = null;
		}
		if (hydrating) {
			set_hydrate_node(
				/** @type {TemplateNode} */
				this.#hydrate_open
			);
			next();
			set_hydrate_node(skip_nodes());
		}
		var did_reset = false;
		var calling_on_error = false;
		const reset = () => {
			if (did_reset) {
				svelte_boundary_reset_noop();
				return;
			}
			did_reset = true;
			if (calling_on_error) {
				svelte_boundary_reset_onerror();
			}
			Batch.ensure();
			this.#local_pending_count = 0;
			if (this.#failed_effect !== null) {
				pause_effect(this.#failed_effect, () => {
					this.#failed_effect = null;
				});
			}
			this.is_pending = this.has_pending_snippet();
			this.#main_effect = this.#run(() => {
				this.#is_creating_fallback = false;
				return branch(() => this.#children(this.#anchor));
			});
			if (this.#pending_count > 0) {
				this.#show_pending_snippet();
			} else {
				this.is_pending = false;
			}
		};
		var previous_reaction = active_reaction;
		try {
			set_active_reaction(null);
			calling_on_error = true;
			onerror?.(error, reset);
			calling_on_error = false;
		} catch (error2) {
			invoke_error_boundary(error2, this.#effect && this.#effect.parent);
		} finally {
			set_active_reaction(previous_reaction);
		}
		if (failed) {
			queue_micro_task(() => {
				this.#failed_effect = this.#run(() => {
					Batch.ensure();
					this.#is_creating_fallback = true;
					try {
						return branch(() => {
							failed(
								this.#anchor,
								() => error,
								() => reset
							);
						});
					} catch (error2) {
						invoke_error_boundary(
							error2,
							/** @type {Effect} */
							this.#effect.parent
						);
						return null;
					} finally {
						this.#is_creating_fallback = false;
					}
				});
			});
		}
	}
}
const all_registered_events = /* @__PURE__ */ new Set();
const root_event_handles = /* @__PURE__ */ new Set();
let last_propagated_event = null;
function handle_event_propagation(event) {
	var handler_element = this;
	var owner_document =
		/** @type {Node} */
		handler_element.ownerDocument;
	var event_name = event.type;
	var path = event.composedPath?.() || [];
	var current_target =
		/** @type {null | Element} */
		path[0] || event.target;
	last_propagated_event = event;
	var path_idx = 0;
	var handled_at = last_propagated_event === event && event.__root;
	if (handled_at) {
		var at_idx = path.indexOf(handled_at);
		if (at_idx !== -1 && (handler_element === document || handler_element === /** @type {any} */ window)) {
			event.__root = handler_element;
			return;
		}
		var handler_idx = path.indexOf(handler_element);
		if (handler_idx === -1) {
			return;
		}
		if (at_idx <= handler_idx) {
			path_idx = at_idx;
		}
	}
	current_target = /** @type {Element} */ path[path_idx] || event.target;
	if (current_target === handler_element) return;
	define_property(event, 'currentTarget', {
		configurable: true,
		get() {
			return current_target || owner_document;
		}
	});
	var previous_reaction = active_reaction;
	var previous_effect = active_effect;
	set_active_reaction(null);
	set_active_effect(null);
	try {
		var throw_error;
		var other_errors = [];
		while (current_target !== null) {
			var parent_element = current_target.assignedSlot || current_target.parentNode || /** @type {any} */ current_target.host || null;
			try {
				var delegated = current_target['__' + event_name];
				if (
					delegated != null &&
					(!(/** @type {any} */ current_target.disabled) || // DOM could've been updated already by the time this is reached, so we check this as well
						// -> the target could not have been disabled because it emits the event in the first place
						event.target === current_target)
				) {
					delegated.call(current_target, event);
				}
			} catch (error) {
				if (throw_error) {
					other_errors.push(error);
				} else {
					throw_error = error;
				}
			}
			if (event.cancelBubble || parent_element === handler_element || parent_element === null) {
				break;
			}
			current_target = parent_element;
		}
		if (throw_error) {
			for (let error of other_errors) {
				queueMicrotask(() => {
					throw error;
				});
			}
			throw throw_error;
		}
	} finally {
		event.__root = handler_element;
		delete event.currentTarget;
		set_active_reaction(previous_reaction);
		set_active_effect(previous_effect);
	}
}
function assign_nodes(start, end) {
	var effect =
		/** @type {Effect} */
		active_effect;
	if (effect.nodes === null) {
		effect.nodes = { start, end, a: null, t: null };
	}
}
function mount(component, options2) {
	return _mount(component, options2);
}
function hydrate(component, options2) {
	init_operations();
	options2.intro = options2.intro ?? false;
	const target = options2.target;
	const was_hydrating = hydrating;
	const previous_hydrate_node = hydrate_node;
	try {
		var anchor = get_first_child(target);
		while (anchor && (anchor.nodeType !== COMMENT_NODE || /** @type {Comment} */ anchor.data !== HYDRATION_START)) {
			anchor = get_next_sibling(anchor);
		}
		if (!anchor) {
			throw HYDRATION_ERROR;
		}
		set_hydrating(true);
		set_hydrate_node(
			/** @type {Comment} */
			anchor
		);
		const instance = _mount(component, { ...options2, anchor });
		set_hydrating(false);
		return (
			/**  @type {Exports} */
			instance
		);
	} catch (error) {
		if (error instanceof Error && error.message.split('\n').some((line) => line.startsWith('https://svelte.dev/e/'))) {
			throw error;
		}
		if (error !== HYDRATION_ERROR) {
			console.warn('Failed to hydrate: ', error);
		}
		if (options2.recover === false) {
			hydration_failed();
		}
		init_operations();
		clear_text_content(target);
		set_hydrating(false);
		return mount(component, options2);
	} finally {
		set_hydrating(was_hydrating);
		set_hydrate_node(previous_hydrate_node);
	}
}
const document_listeners = /* @__PURE__ */ new Map();
function _mount(Component, { target, anchor, props = {}, events, context, intro = true }) {
	init_operations();
	var registered_events = /* @__PURE__ */ new Set();
	var event_handle = (events2) => {
		for (var i = 0; i < events2.length; i++) {
			var event_name = events2[i];
			if (registered_events.has(event_name)) continue;
			registered_events.add(event_name);
			var passive = is_passive_event(event_name);
			target.addEventListener(event_name, handle_event_propagation, { passive });
			var n = document_listeners.get(event_name);
			if (n === void 0) {
				document.addEventListener(event_name, handle_event_propagation, { passive });
				document_listeners.set(event_name, 1);
			} else {
				document_listeners.set(event_name, n + 1);
			}
		}
	};
	event_handle(array_from(all_registered_events));
	root_event_handles.add(event_handle);
	var component = void 0;
	var unmount2 = component_root(() => {
		var anchor_node = anchor ?? target.appendChild(create_text());
		boundary(
			/** @type {TemplateNode} */
			anchor_node,
			{
				pending: () => {}
			},
			(anchor_node2) => {
				if (context) {
					push({});
					var ctx =
						/** @type {ComponentContext} */
						component_context;
					ctx.c = context;
				}
				if (events) {
					props.$$events = events;
				}
				if (hydrating) {
					assign_nodes(
						/** @type {TemplateNode} */
						anchor_node2,
						null
					);
				}
				component = Component(anchor_node2, props) || {};
				if (hydrating) {
					active_effect.nodes.end = hydrate_node;
					if (hydrate_node === null || hydrate_node.nodeType !== COMMENT_NODE || /** @type {Comment} */ hydrate_node.data !== HYDRATION_END) {
						hydration_mismatch();
						throw HYDRATION_ERROR;
					}
				}
				if (context) {
					pop();
				}
			}
		);
		return () => {
			for (var event_name of registered_events) {
				target.removeEventListener(event_name, handle_event_propagation);
				var n =
					/** @type {number} */
					document_listeners.get(event_name);
				if (--n === 0) {
					document.removeEventListener(event_name, handle_event_propagation);
					document_listeners.delete(event_name);
				} else {
					document_listeners.set(event_name, n);
				}
			}
			root_event_handles.delete(event_handle);
			if (anchor_node !== anchor) {
				anchor_node.parentNode?.removeChild(anchor_node);
			}
		};
	});
	mounted_components.set(component, unmount2);
	return component;
}
let mounted_components = /* @__PURE__ */ new WeakMap();
function unmount(component, options2) {
	const fn = mounted_components.get(component);
	if (fn) {
		mounted_components.delete(component);
		return fn(options2);
	}
	return Promise.resolve();
}
function asClassComponent$1(component) {
	return class extends Svelte4Component {
		/** @param {any} options */
		constructor(options2) {
			super({
				component,
				...options2
			});
		}
	};
}
class Svelte4Component {
	/** @type {any} */
	#events;
	/** @type {Record<string, any>} */
	#instance;
	/**
	 * @param {ComponentConstructorOptions & {
	 *  component: any;
	 * }} options
	 */
	constructor(options2) {
		var sources = /* @__PURE__ */ new Map();
		var add_source = (key, value) => {
			var s = mutable_source(value, false, false);
			sources.set(key, s);
			return s;
		};
		const props = new Proxy(
			{ ...(options2.props || {}), $$events: {} },
			{
				get(target, prop) {
					return get(sources.get(prop) ?? add_source(prop, Reflect.get(target, prop)));
				},
				has(target, prop) {
					if (prop === LEGACY_PROPS) return true;
					get(sources.get(prop) ?? add_source(prop, Reflect.get(target, prop)));
					return Reflect.has(target, prop);
				},
				set(target, prop, value) {
					set(sources.get(prop) ?? add_source(prop, value), value);
					return Reflect.set(target, prop, value);
				}
			}
		);
		this.#instance = (options2.hydrate ? hydrate : mount)(options2.component, {
			target: options2.target,
			anchor: options2.anchor,
			props,
			context: options2.context,
			intro: options2.intro ?? false,
			recover: options2.recover
		});
		if (!options2?.props?.$$host || options2.sync === false) {
			flushSync();
		}
		this.#events = props.$$events;
		for (const key of Object.keys(this.#instance)) {
			if (key === '$set' || key === '$destroy' || key === '$on') continue;
			define_property(this, key, {
				get() {
					return this.#instance[key];
				},
				/** @param {any} value */
				set(value) {
					this.#instance[key] = value;
				},
				enumerable: true
			});
		}
		this.#instance.$set =
			/** @param {Record<string, any>} next */
			(next2) => {
				Object.assign(props, next2);
			};
		this.#instance.$destroy = () => {
			unmount(this.#instance);
		};
	}
	/** @param {Record<string, any>} props */
	$set(props) {
		this.#instance.$set(props);
	}
	/**
	 * @param {string} event
	 * @param {(...args: any[]) => any} callback
	 * @returns {any}
	 */
	$on(event, callback) {
		this.#events[event] = this.#events[event] || [];
		const cb = (...args) => callback.call(this, ...args);
		this.#events[event].push(cb);
		return () => {
			this.#events[event] = this.#events[event].filter(
				/** @param {any} fn */
				(fn) => fn !== cb
			);
		};
	}
	$destroy() {
		this.#instance.$destroy();
	}
}
let read_implementation = null;
function set_read_implementation(fn) {
	read_implementation = fn;
}
function set_manifest(_) {}
function asClassComponent(component) {
	const component_constructor = asClassComponent$1(component);
	const _render = (props, { context, csp } = {}) => {
		const result = render(component, { props, context, csp });
		const munged = Object.defineProperties(
			/** @type {LegacyRenderResult & PromiseLike<LegacyRenderResult>} */
			{},
			{
				css: {
					value: { code: '', map: null }
				},
				head: {
					get: () => result.head
				},
				html: {
					get: () => result.body
				},
				then: {
					/**
					 * this is not type-safe, but honestly it's the best I can do right now, and it's a straightforward function.
					 *
					 * @template TResult1
					 * @template [TResult2=never]
					 * @param { (value: LegacyRenderResult) => TResult1 } onfulfilled
					 * @param { (reason: unknown) => TResult2 } onrejected
					 */
					value: (onfulfilled, onrejected) => {
						{
							const user_result = onfulfilled({
								css: munged.css,
								head: munged.head,
								html: munged.html
							});
							return Promise.resolve(user_result);
						}
					}
				}
			}
		);
		return munged;
	};
	component_constructor.render = _render;
	return component_constructor;
}
function Root($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { stores, page, constructors, components = [], form, data_0 = null, data_1 = null } = $$props;
		{
			setContext('__svelte__', stores);
		}
		{
			stores.page.set(page);
		}
		const Pyramid_1 = constructors[1];
		if (constructors[1]) {
			$$renderer2.push('<!--[-->');
			const Pyramid_0 = constructors[0];
			$$renderer2.push(`<!---->`);
			Pyramid_0($$renderer2, {
				data: data_0,
				form,
				params: page.params,
				children: ($$renderer3) => {
					$$renderer3.push(`<!---->`);
					Pyramid_1($$renderer3, { data: data_1, form, params: page.params });
					$$renderer3.push(`<!---->`);
				},
				$$slots: { default: true }
			});
			$$renderer2.push(`<!---->`);
		} else {
			$$renderer2.push('<!--[!-->');
			const Pyramid_0 = constructors[0];
			$$renderer2.push(`<!---->`);
			Pyramid_0($$renderer2, { data: data_0, form, params: page.params });
			$$renderer2.push(`<!---->`);
		}
		$$renderer2.push(`<!--]--> `);
		{
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]-->`);
	});
}
const root = asClassComponent(Root);
const options = {
	app_template_contains_nonce: true,
	async: false,
	csp: {
		mode: 'nonce',
		directives: {
			'default-src': ['self'],
			'worker-src': ['self', 'blob:'],
			'connect-src': [
				'self',
				'https://*.iconify.design',
				'https://*.simplesvg.com',
				'https://*.unisvg.com',
				'https://code.iconify.design',
				'https://raw.githubusercontent.com',
				'wss:',
				'ws:'
			],
			'font-src': ['self', 'data:'],
			'img-src': [
				'self',
				'data:',
				'blob:',
				'https://*.iconify.design',
				'https://*.simplesvg.com',
				'https://*.unisvg.com',
				'https://placehold.co',
				'https://api.qrserver.com',
				'https://github.com',
				'https://raw.githubusercontent.com'
			],
			'object-src': ['none'],
			'script-src': ['self', 'unsafe-inline', 'unsafe-eval', 'blob:', 'https://*.iconify.design', 'https://code.iconify.design'],
			'style-src': ['self', 'unsafe-inline', 'https://*.iconify.design'],
			'base-uri': ['self'],
			'form-action': ['self'],
			'upgrade-insecure-requests': false,
			'block-all-mixed-content': false
		},
		reportOnly: { 'upgrade-insecure-requests': false, 'block-all-mixed-content': false }
	},
	csrf_check_origin: true,
	csrf_trusted_origins: [],
	embedded: false,
	env_public_prefix: 'PUBLIC_',
	env_private_prefix: '',
	hash_routing: false,
	hooks: null,
	// added lazily, via `get_hooks`
	preload_strategy: 'modulepreload',
	root,
	service_worker: false,
	service_worker_options: void 0,
	templates: {
		app: ({ head, body, assets, nonce, env }) =>
			'<!doctype html>\n<html lang="en" dir="ltr" class="dark">\n	<head>\n		<meta charset="utf-8" />\n		<script nonce="' +
			nonce +
			`">
			// Theme initialization (before page render to prevent flicker)
			(() => {
				const c = document.cookie.match(/theme=(\\w+)/)?.[1];
				const h = document.documentElement;

				try {
					// Determine if dark mode should be active
					const systemPrefersLight = matchMedia('(prefers-color-scheme: light)').matches;
					let isDark = true; // Default to dark mode

					if (c === 'dark') {
						isDark = true;
					} else if (c === 'light') {
						isDark = false;
					} else if (c === 'system' || !c) {
						// Priority System: if system says light, use light. Otherwise default dark.
						isDark = !systemPrefersLight;
					}

					if (isDark) {
						h.classList.add('dark');
						h.classList.remove('light');
					} else {
						h.classList.add('light');
						h.classList.remove('dark');
					}
				} catch (e) {
					console.error('[SSR Script] Error:', e);
				}
			})();
		<\/script>
		<link rel="icon" href="` +
			assets +
			'/SveltyCMS_Logo.svg" />\n		<link rel="mask-icon" href="/safari-pinned-tab.svg" color="#5bbad5" />\n\n		<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n\n		' +
			head +
			'\n		<!-- Custom CSS injection point for dynamic styles -->\n		<style nonce="' +
			nonce +
			'">\n			%sveltekit.customCss%\n		</style>\n	</head>\n\n	<body data-sveltekit-preload-data="hover" data-theme="sveltycms">\n		<div style="display: contents">' +
			body +
			'</div>\n	</body>\n</html>\n',
		error: ({ status, message }) =>
			'<!doctype html>\n<html lang="en">\n	<head>\n		<meta charset="utf-8" />\n		<title>' +
			message +
			`</title>

		<style>
			body {
				--bg: white;
				--fg: #222;
				--divider: #ccc;
				background: var(--bg);
				color: var(--fg);
				font-family:
					system-ui,
					-apple-system,
					BlinkMacSystemFont,
					'Segoe UI',
					Roboto,
					Oxygen,
					Ubuntu,
					Cantarell,
					'Open Sans',
					'Helvetica Neue',
					sans-serif;
				display: flex;
				align-items: center;
				justify-content: center;
				height: 100vh;
				margin: 0;
			}

			.error {
				display: flex;
				align-items: center;
				max-width: 32rem;
				margin: 0 1rem;
			}

			.status {
				font-weight: 200;
				font-size: 3rem;
				line-height: 1;
				position: relative;
				top: -0.05rem;
			}

			.message {
				border-left: 1px solid var(--divider);
				padding: 0 0 0 1rem;
				margin: 0 0 0 1rem;
				min-height: 2.5rem;
				display: flex;
				align-items: center;
			}

			.message h1 {
				font-weight: 400;
				font-size: 1em;
				margin: 0;
			}

			@media (prefers-color-scheme: dark) {
				body {
					--bg: #222;
					--fg: #ddd;
					--divider: #666;
				}
			}
		</style>
	</head>
	<body>
		<div class="error">
			<span class="status">` +
			status +
			'</span>\n			<div class="message">\n				<h1>' +
			message +
			'</h1>\n			</div>\n		</div>\n	</body>\n</html>\n'
	},
	version_hash: '1pg8w0k'
};
async function get_hooks() {
	let handle;
	let handleFetch;
	let handleError;
	let handleValidationError;
	let init;
	({ handle, handleFetch, handleError, handleValidationError, init } = await import('./hooks.server.js'));
	let reroute;
	let transport;
	({ reroute, transport } = await import('./index.js'));
	return {
		handle,
		handleFetch,
		handleError,
		handleValidationError,
		init,
		reroute,
		transport
	};
}
export {
	set_public_env as a,
	set_read_implementation as b,
	set_manifest as c,
	get_hooks as g,
	options as o,
	public_env as p,
	read_implementation as r,
	set_private_env as s
};
//# sourceMappingURL=internal.js.map
