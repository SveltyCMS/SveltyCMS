import { D as DEV } from './false.js';
import 'clsx';
var is_array = Array.isArray;
var index_of = Array.prototype.indexOf;
var array_from = Array.from;
var define_property = Object.defineProperty;
var get_descriptor = Object.getOwnPropertyDescriptor;
var object_prototype = Object.prototype;
var array_prototype = Array.prototype;
var get_prototype_of = Object.getPrototypeOf;
var is_extensible = Object.isExtensible;
const noop = () => {};
function run(fn) {
	return fn();
}
function run_all(arr) {
	for (var i = 0; i < arr.length; i++) {
		arr[i]();
	}
}
function deferred() {
	var resolve;
	var reject;
	var promise = new Promise((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}
function equals(value) {
	return value === this.v;
}
function safe_not_equal(a, b) {
	return a != a ? b == b : a !== b || (a !== null && typeof a === 'object') || typeof a === 'function';
}
function safe_equals(value) {
	return !safe_not_equal(value, this.v);
}
const DERIVED = 1 << 1;
const EFFECT = 1 << 2;
const RENDER_EFFECT = 1 << 3;
const MANAGED_EFFECT = 1 << 24;
const BLOCK_EFFECT = 1 << 4;
const BRANCH_EFFECT = 1 << 5;
const ROOT_EFFECT = 1 << 6;
const BOUNDARY_EFFECT = 1 << 7;
const CONNECTED = 1 << 9;
const CLEAN = 1 << 10;
const DIRTY = 1 << 11;
const MAYBE_DIRTY = 1 << 12;
const INERT = 1 << 13;
const DESTROYED = 1 << 14;
const EFFECT_RAN = 1 << 15;
const EFFECT_TRANSPARENT = 1 << 16;
const EAGER_EFFECT = 1 << 17;
const HEAD_EFFECT = 1 << 18;
const EFFECT_PRESERVED = 1 << 19;
const USER_EFFECT = 1 << 20;
const WAS_MARKED = 1 << 15;
const REACTION_IS_UPDATING = 1 << 21;
const ASYNC = 1 << 22;
const ERROR_VALUE = 1 << 23;
const STATE_SYMBOL = /* @__PURE__ */ Symbol('$state');
const LEGACY_PROPS = /* @__PURE__ */ Symbol('legacy props');
const STALE_REACTION = new (class StaleReactionError extends Error {
	name = 'StaleReactionError';
	message = 'The reaction that called `getAbortSignal()` was re-run or destroyed';
})();
const COMMENT_NODE = 8;
function effect_update_depth_exceeded() {
	{
		throw new Error(`https://svelte.dev/e/effect_update_depth_exceeded`);
	}
}
function hydration_failed() {
	{
		throw new Error(`https://svelte.dev/e/hydration_failed`);
	}
}
function state_descriptors_fixed() {
	{
		throw new Error(`https://svelte.dev/e/state_descriptors_fixed`);
	}
}
function state_prototype_fixed() {
	{
		throw new Error(`https://svelte.dev/e/state_prototype_fixed`);
	}
}
function state_unsafe_mutation() {
	{
		throw new Error(`https://svelte.dev/e/state_unsafe_mutation`);
	}
}
function svelte_boundary_reset_onerror() {
	{
		throw new Error(`https://svelte.dev/e/svelte_boundary_reset_onerror`);
	}
}
const HYDRATION_START = '[';
const HYDRATION_START_ELSE = '[!';
const HYDRATION_END = ']';
const HYDRATION_ERROR = {};
const ELEMENT_IS_NAMESPACED = 1;
const ELEMENT_PRESERVE_ATTRIBUTE_CASE = 1 << 1;
const ELEMENT_IS_INPUT = 1 << 2;
const UNINITIALIZED = /* @__PURE__ */ Symbol();
const ATTACHMENT_KEY = '@attach';
let tracing_mode_flag = false;
let component_context = null;
function set_component_context(context) {
	component_context = context;
}
function push(props, runes = false, fn) {
	component_context = {
		p: component_context,
		i: false,
		c: null,
		e: null,
		s: props,
		x: null,
		l: null
	};
}
function pop(component) {
	var context =
		/** @type {ComponentContext} */
		component_context;
	var effects = context.e;
	if (effects !== null) {
		context.e = null;
		for (var fn of effects) {
			create_user_effect(fn);
		}
	}
	context.i = true;
	component_context = context.p;
	return (
		/** @type {T} */
		{}
	);
}
function is_runes() {
	return true;
}
let micro_tasks = [];
function run_micro_tasks() {
	var tasks = micro_tasks;
	micro_tasks = [];
	run_all(tasks);
}
function queue_micro_task(fn) {
	if (micro_tasks.length === 0 && !is_flushing_sync) {
		var tasks = micro_tasks;
		queueMicrotask(() => {
			if (tasks === micro_tasks) run_micro_tasks();
		});
	}
	micro_tasks.push(fn);
}
function flush_tasks() {
	while (micro_tasks.length > 0) {
		run_micro_tasks();
	}
}
function handle_error(error) {
	var effect = active_effect;
	if (effect === null) {
		active_reaction.f |= ERROR_VALUE;
		return error;
	}
	if ((effect.f & EFFECT_RAN) === 0) {
		if ((effect.f & BOUNDARY_EFFECT) === 0) {
			throw error;
		}
		effect.b.error(error);
	} else {
		invoke_error_boundary(error, effect);
	}
}
function invoke_error_boundary(error, effect) {
	while (effect !== null) {
		if ((effect.f & BOUNDARY_EFFECT) !== 0) {
			try {
				effect.b.error(error);
				return;
			} catch (e) {
				error = e;
			}
		}
		effect = effect.parent;
	}
	throw error;
}
const STATUS_MASK = -7169;
function set_signal_status(signal, status) {
	signal.f = (signal.f & STATUS_MASK) | status;
}
function update_derived_status(derived) {
	if ((derived.f & CONNECTED) !== 0 || derived.deps === null) {
		set_signal_status(derived, CLEAN);
	} else {
		set_signal_status(derived, MAYBE_DIRTY);
	}
}
function clear_marked(deps) {
	if (deps === null) return;
	for (const dep of deps) {
		if ((dep.f & DERIVED) === 0 || (dep.f & WAS_MARKED) === 0) {
			continue;
		}
		dep.f ^= WAS_MARKED;
		clear_marked(
			/** @type {Derived} */
			dep.deps
		);
	}
}
function defer_effect(effect, dirty_effects, maybe_dirty_effects) {
	if ((effect.f & DIRTY) !== 0) {
		dirty_effects.add(effect);
	} else if ((effect.f & MAYBE_DIRTY) !== 0) {
		maybe_dirty_effects.add(effect);
	}
	clear_marked(effect.deps);
	set_signal_status(effect, CLEAN);
}
const batches = /* @__PURE__ */ new Set();
let current_batch = null;
let batch_values = null;
let queued_root_effects = [];
let last_scheduled_effect = null;
let is_flushing = false;
let is_flushing_sync = false;
class Batch {
	committed = false;
	/**
	 * The current values of any sources that are updated in this batch
	 * They keys of this map are identical to `this.#previous`
	 * @type {Map<Source, any>}
	 */
	current = /* @__PURE__ */ new Map();
	/**
	 * The values of any sources that are updated in this batch _before_ those updates took place.
	 * They keys of this map are identical to `this.#current`
	 * @type {Map<Source, any>}
	 */
	previous = /* @__PURE__ */ new Map();
	/**
	 * When the batch is committed (and the DOM is updated), we need to remove old branches
	 * and append new ones by calling the functions added inside (if/each/key/etc) blocks
	 * @type {Set<() => void>}
	 */
	#commit_callbacks = /* @__PURE__ */ new Set();
	/**
	 * If a fork is discarded, we need to destroy any effects that are no longer needed
	 * @type {Set<(batch: Batch) => void>}
	 */
	#discard_callbacks = /* @__PURE__ */ new Set();
	/**
	 * The number of async effects that are currently in flight
	 */
	#pending = 0;
	/**
	 * The number of async effects that are currently in flight, _not_ inside a pending boundary
	 */
	#blocking_pending = 0;
	/**
	 * A deferred that resolves when the batch is committed, used with `settled()`
	 * TODO replace with Promise.withResolvers once supported widely enough
	 * @type {{ promise: Promise<void>, resolve: (value?: any) => void, reject: (reason: unknown) => void } | null}
	 */
	#deferred = null;
	/**
	 * Deferred effects (which run after async work has completed) that are DIRTY
	 * @type {Set<Effect>}
	 */
	#dirty_effects = /* @__PURE__ */ new Set();
	/**
	 * Deferred effects that are MAYBE_DIRTY
	 * @type {Set<Effect>}
	 */
	#maybe_dirty_effects = /* @__PURE__ */ new Set();
	/**
	 * A set of branches that still exist, but will be destroyed when this batch
	 * is committed — we skip over these during `process`
	 * @type {Set<Effect>}
	 */
	skipped_effects = /* @__PURE__ */ new Set();
	is_fork = false;
	is_deferred() {
		return this.is_fork || this.#blocking_pending > 0;
	}
	/**
	 *
	 * @param {Effect[]} root_effects
	 */
	process(root_effects) {
		queued_root_effects = [];
		this.apply();
		var effects = [];
		var render_effects = [];
		for (const root of root_effects) {
			this.#traverse_effect_tree(root, effects, render_effects);
		}
		if (!this.is_fork) {
			this.#resolve();
		}
		if (this.is_deferred()) {
			this.#defer_effects(render_effects);
			this.#defer_effects(effects);
		} else {
			current_batch = null;
			flush_queued_effects(render_effects);
			flush_queued_effects(effects);
			this.#deferred?.resolve();
		}
		batch_values = null;
	}
	/**
	 * Traverse the effect tree, executing effects or stashing
	 * them for later execution as appropriate
	 * @param {Effect} root
	 * @param {Effect[]} effects
	 * @param {Effect[]} render_effects
	 */
	#traverse_effect_tree(root, effects, render_effects) {
		root.f ^= CLEAN;
		var effect = root.first;
		var pending_boundary = null;
		while (effect !== null) {
			var flags = effect.f;
			var is_branch = (flags & (BRANCH_EFFECT | ROOT_EFFECT)) !== 0;
			var is_skippable_branch = is_branch && (flags & CLEAN) !== 0;
			var skip = is_skippable_branch || (flags & INERT) !== 0 || this.skipped_effects.has(effect);
			if (!skip && effect.fn !== null) {
				if (is_branch) {
					effect.f ^= CLEAN;
				} else if (pending_boundary !== null && (flags & (EFFECT | RENDER_EFFECT | MANAGED_EFFECT)) !== 0) {
					pending_boundary.b.defer_effect(effect);
				} else if ((flags & EFFECT) !== 0) {
					effects.push(effect);
				} else if (is_dirty(effect)) {
					if ((flags & BLOCK_EFFECT) !== 0) this.#dirty_effects.add(effect);
					update_effect(effect);
				}
				var child = effect.first;
				if (child !== null) {
					effect = child;
					continue;
				}
			}
			var parent = effect.parent;
			effect = effect.next;
			while (effect === null && parent !== null) {
				if (parent === pending_boundary) {
					pending_boundary = null;
				}
				effect = parent.next;
				parent = parent.parent;
			}
		}
	}
	/**
	 * @param {Effect[]} effects
	 */
	#defer_effects(effects) {
		for (var i = 0; i < effects.length; i += 1) {
			defer_effect(effects[i], this.#dirty_effects, this.#maybe_dirty_effects);
		}
	}
	/**
	 * Associate a change to a given source with the current
	 * batch, noting its previous and current values
	 * @param {Source} source
	 * @param {any} value
	 */
	capture(source2, value) {
		if (value !== UNINITIALIZED && !this.previous.has(source2)) {
			this.previous.set(source2, value);
		}
		if ((source2.f & ERROR_VALUE) === 0) {
			this.current.set(source2, source2.v);
			batch_values?.set(source2, source2.v);
		}
	}
	activate() {
		current_batch = this;
		this.apply();
	}
	deactivate() {
		if (current_batch !== this) return;
		current_batch = null;
		batch_values = null;
	}
	flush() {
		this.activate();
		if (queued_root_effects.length > 0) {
			flush_effects();
			if (current_batch !== null && current_batch !== this) {
				return;
			}
		} else if (this.#pending === 0) {
			this.process([]);
		}
		this.deactivate();
	}
	discard() {
		for (const fn of this.#discard_callbacks) fn(this);
		this.#discard_callbacks.clear();
	}
	#resolve() {
		if (this.#blocking_pending === 0) {
			for (const fn of this.#commit_callbacks) fn();
			this.#commit_callbacks.clear();
		}
		if (this.#pending === 0) {
			this.#commit();
		}
	}
	#commit() {
		if (batches.size > 1) {
			this.previous.clear();
			var previous_batch_values = batch_values;
			var is_earlier = true;
			for (const batch of batches) {
				if (batch === this) {
					is_earlier = false;
					continue;
				}
				const sources = [];
				for (const [source2, value] of this.current) {
					if (batch.current.has(source2)) {
						if (is_earlier && value !== batch.current.get(source2)) {
							batch.current.set(source2, value);
						} else {
							continue;
						}
					}
					sources.push(source2);
				}
				if (sources.length === 0) {
					continue;
				}
				const others = [...batch.current.keys()].filter((s) => !this.current.has(s));
				if (others.length > 0) {
					var prev_queued_root_effects = queued_root_effects;
					queued_root_effects = [];
					const marked = /* @__PURE__ */ new Set();
					const checked = /* @__PURE__ */ new Map();
					for (const source2 of sources) {
						mark_effects(source2, others, marked, checked);
					}
					if (queued_root_effects.length > 0) {
						current_batch = batch;
						batch.apply();
						for (const root of queued_root_effects) {
							batch.#traverse_effect_tree(root, [], []);
						}
						batch.deactivate();
					}
					queued_root_effects = prev_queued_root_effects;
				}
			}
			current_batch = null;
			batch_values = previous_batch_values;
		}
		this.committed = true;
		batches.delete(this);
	}
	/**
	 *
	 * @param {boolean} blocking
	 */
	increment(blocking) {
		this.#pending += 1;
		if (blocking) this.#blocking_pending += 1;
	}
	/**
	 *
	 * @param {boolean} blocking
	 */
	decrement(blocking) {
		this.#pending -= 1;
		if (blocking) this.#blocking_pending -= 1;
		this.revive();
	}
	revive() {
		for (const e of this.#dirty_effects) {
			this.#maybe_dirty_effects.delete(e);
			set_signal_status(e, DIRTY);
			schedule_effect(e);
		}
		for (const e of this.#maybe_dirty_effects) {
			set_signal_status(e, MAYBE_DIRTY);
			schedule_effect(e);
		}
		this.flush();
	}
	/** @param {() => void} fn */
	oncommit(fn) {
		this.#commit_callbacks.add(fn);
	}
	/** @param {(batch: Batch) => void} fn */
	ondiscard(fn) {
		this.#discard_callbacks.add(fn);
	}
	settled() {
		return (this.#deferred ??= deferred()).promise;
	}
	static ensure() {
		if (current_batch === null) {
			const batch = (current_batch = new Batch());
			batches.add(current_batch);
			if (!is_flushing_sync) {
				Batch.enqueue(() => {
					if (current_batch !== batch) {
						return;
					}
					batch.flush();
				});
			}
		}
		return current_batch;
	}
	/** @param {() => void} task */
	static enqueue(task) {
		queue_micro_task(task);
	}
	apply() {
		return;
	}
}
function flushSync(fn) {
	var was_flushing_sync = is_flushing_sync;
	is_flushing_sync = true;
	try {
		var result;
		if (fn);
		while (true) {
			flush_tasks();
			if (queued_root_effects.length === 0) {
				current_batch?.flush();
				if (queued_root_effects.length === 0) {
					last_scheduled_effect = null;
					return (
						/** @type {T} */
						result
					);
				}
			}
			flush_effects();
		}
	} finally {
		is_flushing_sync = was_flushing_sync;
	}
}
function flush_effects() {
	var was_updating_effect = is_updating_effect;
	is_flushing = true;
	var source_stacks = null;
	try {
		var flush_count = 0;
		set_is_updating_effect(true);
		while (queued_root_effects.length > 0) {
			var batch = Batch.ensure();
			if (flush_count++ > 1e3) {
				var updates, entry;
				if (DEV);
				infinite_loop_guard();
			}
			batch.process(queued_root_effects);
			old_values.clear();
			if (DEV);
		}
	} finally {
		is_flushing = false;
		set_is_updating_effect(was_updating_effect);
		last_scheduled_effect = null;
	}
}
function infinite_loop_guard() {
	try {
		effect_update_depth_exceeded();
	} catch (error) {
		invoke_error_boundary(error, last_scheduled_effect);
	}
}
let eager_block_effects = null;
function flush_queued_effects(effects) {
	var length = effects.length;
	if (length === 0) return;
	var i = 0;
	while (i < length) {
		var effect = effects[i++];
		if ((effect.f & (DESTROYED | INERT)) === 0 && is_dirty(effect)) {
			eager_block_effects = /* @__PURE__ */ new Set();
			update_effect(effect);
			if (effect.deps === null && effect.first === null && effect.nodes === null) {
				if (effect.teardown === null && effect.ac === null) {
					unlink_effect(effect);
				} else {
					effect.fn = null;
				}
			}
			if (eager_block_effects?.size > 0) {
				old_values.clear();
				for (const e of eager_block_effects) {
					if ((e.f & (DESTROYED | INERT)) !== 0) continue;
					const ordered_effects = [e];
					let ancestor = e.parent;
					while (ancestor !== null) {
						if (eager_block_effects.has(ancestor)) {
							eager_block_effects.delete(ancestor);
							ordered_effects.push(ancestor);
						}
						ancestor = ancestor.parent;
					}
					for (let j = ordered_effects.length - 1; j >= 0; j--) {
						const e2 = ordered_effects[j];
						if ((e2.f & (DESTROYED | INERT)) !== 0) continue;
						update_effect(e2);
					}
				}
				eager_block_effects.clear();
			}
		}
	}
	eager_block_effects = null;
}
function mark_effects(value, sources, marked, checked) {
	if (marked.has(value)) return;
	marked.add(value);
	if (value.reactions !== null) {
		for (const reaction of value.reactions) {
			const flags = reaction.f;
			if ((flags & DERIVED) !== 0) {
				mark_effects(
					/** @type {Derived} */
					reaction,
					sources,
					marked,
					checked
				);
			} else if ((flags & (ASYNC | BLOCK_EFFECT)) !== 0 && (flags & DIRTY) === 0 && depends_on(reaction, sources, checked)) {
				set_signal_status(reaction, DIRTY);
				schedule_effect(
					/** @type {Effect} */
					reaction
				);
			}
		}
	}
}
function depends_on(reaction, sources, checked) {
	const depends = checked.get(reaction);
	if (depends !== void 0) return depends;
	if (reaction.deps !== null) {
		for (const dep of reaction.deps) {
			if (sources.includes(dep)) {
				return true;
			}
			if (
				(dep.f & DERIVED) !== 0 &&
				depends_on(
					/** @type {Derived} */
					dep,
					sources,
					checked
				)
			) {
				checked.set(
					/** @type {Derived} */
					dep,
					true
				);
				return true;
			}
		}
	}
	checked.set(reaction, false);
	return false;
}
function schedule_effect(signal) {
	var effect = (last_scheduled_effect = signal);
	while (effect.parent !== null) {
		effect = effect.parent;
		var flags = effect.f;
		if (is_flushing && effect === active_effect && (flags & BLOCK_EFFECT) !== 0 && (flags & HEAD_EFFECT) === 0) {
			return;
		}
		if ((flags & (ROOT_EFFECT | BRANCH_EFFECT)) !== 0) {
			if ((flags & CLEAN) === 0) return;
			effect.f ^= CLEAN;
		}
	}
	queued_root_effects.push(effect);
}
function destroy_derived_effects(derived) {
	var effects = derived.effects;
	if (effects !== null) {
		derived.effects = null;
		for (var i = 0; i < effects.length; i += 1) {
			destroy_effect(
				/** @type {Effect} */
				effects[i]
			);
		}
	}
}
function get_derived_parent_effect(derived) {
	var parent = derived.parent;
	while (parent !== null) {
		if ((parent.f & DERIVED) === 0) {
			return (parent.f & DESTROYED) === 0 ? /** @type {Effect} */ parent : null;
		}
		parent = parent.parent;
	}
	return null;
}
function execute_derived(derived) {
	var value;
	var prev_active_effect = active_effect;
	set_active_effect(get_derived_parent_effect(derived));
	{
		try {
			derived.f &= ~WAS_MARKED;
			destroy_derived_effects(derived);
			value = update_reaction(derived);
		} finally {
			set_active_effect(prev_active_effect);
		}
	}
	return value;
}
function update_derived(derived) {
	var value = execute_derived(derived);
	if (!derived.equals(value)) {
		derived.wv = increment_write_version();
		if (!current_batch?.is_fork || derived.deps === null) {
			derived.v = value;
			if (derived.deps === null) {
				set_signal_status(derived, CLEAN);
				return;
			}
		}
	}
	if (is_destroying_effect) {
		return;
	}
	if (batch_values !== null) {
		if (effect_tracking() || current_batch?.is_fork) {
			batch_values.set(derived, value);
		}
	} else {
		update_derived_status(derived);
	}
}
let eager_effects = /* @__PURE__ */ new Set();
const old_values = /* @__PURE__ */ new Map();
let eager_effects_deferred = false;
function source(v, stack) {
	var signal = {
		f: 0,
		// TODO ideally we could skip this altogether, but it causes type errors
		v,
		reactions: null,
		equals,
		rv: 0,
		wv: 0
	};
	return signal;
}
// @__NO_SIDE_EFFECTS__
function state(v, stack) {
	const s = source(v);
	push_reaction_value(s);
	return s;
}
// @__NO_SIDE_EFFECTS__
function mutable_source(initial_value, immutable = false, trackable = true) {
	const s = source(initial_value);
	if (!immutable) {
		s.equals = safe_equals;
	}
	return s;
}
function set(source2, value, should_proxy = false) {
	if (
		active_reaction !== null && // since we are untracking the function inside `$inspect.with` we need to add this check
		// to ensure we error if state is set inside an inspect effect
		(!untracking || (active_reaction.f & EAGER_EFFECT) !== 0) &&
		is_runes() &&
		(active_reaction.f & (DERIVED | BLOCK_EFFECT | ASYNC | EAGER_EFFECT)) !== 0 &&
		!current_sources?.includes(source2)
	) {
		state_unsafe_mutation();
	}
	let new_value = should_proxy ? proxy(value) : value;
	return internal_set(source2, new_value);
}
function internal_set(source2, value) {
	if (!source2.equals(value)) {
		var old_value = source2.v;
		if (is_destroying_effect) {
			old_values.set(source2, value);
		} else {
			old_values.set(source2, old_value);
		}
		source2.v = value;
		var batch = Batch.ensure();
		batch.capture(source2, old_value);
		if ((source2.f & DERIVED) !== 0) {
			const derived =
				/** @type {Derived} */
				source2;
			if ((source2.f & DIRTY) !== 0) {
				execute_derived(derived);
			}
			update_derived_status(derived);
		}
		source2.wv = increment_write_version();
		mark_reactions(source2, DIRTY);
		if (active_effect !== null && (active_effect.f & CLEAN) !== 0 && (active_effect.f & (BRANCH_EFFECT | ROOT_EFFECT)) === 0) {
			if (untracked_writes === null) {
				set_untracked_writes([source2]);
			} else {
				untracked_writes.push(source2);
			}
		}
		if (!batch.is_fork && eager_effects.size > 0 && !eager_effects_deferred) {
			flush_eager_effects();
		}
	}
	return value;
}
function flush_eager_effects() {
	eager_effects_deferred = false;
	var prev_is_updating_effect = is_updating_effect;
	set_is_updating_effect(true);
	const inspects = Array.from(eager_effects);
	try {
		for (const effect of inspects) {
			if ((effect.f & CLEAN) !== 0) {
				set_signal_status(effect, MAYBE_DIRTY);
			}
			if (is_dirty(effect)) {
				update_effect(effect);
			}
		}
	} finally {
		set_is_updating_effect(prev_is_updating_effect);
	}
	eager_effects.clear();
}
function increment(source2) {
	set(source2, source2.v + 1);
}
function mark_reactions(signal, status) {
	var reactions = signal.reactions;
	if (reactions === null) return;
	var length = reactions.length;
	for (var i = 0; i < length; i++) {
		var reaction = reactions[i];
		var flags = reaction.f;
		var not_dirty = (flags & DIRTY) === 0;
		if (not_dirty) {
			set_signal_status(reaction, status);
		}
		if ((flags & DERIVED) !== 0) {
			var derived =
				/** @type {Derived} */
				reaction;
			batch_values?.delete(derived);
			if ((flags & WAS_MARKED) === 0) {
				if (flags & CONNECTED) {
					reaction.f |= WAS_MARKED;
				}
				mark_reactions(derived, MAYBE_DIRTY);
			}
		} else if (not_dirty) {
			if ((flags & BLOCK_EFFECT) !== 0 && eager_block_effects !== null) {
				eager_block_effects.add(
					/** @type {Effect} */
					reaction
				);
			}
			schedule_effect(
				/** @type {Effect} */
				reaction
			);
		}
	}
}
function proxy(value) {
	if (typeof value !== 'object' || value === null || STATE_SYMBOL in value) {
		return value;
	}
	const prototype = get_prototype_of(value);
	if (prototype !== object_prototype && prototype !== array_prototype) {
		return value;
	}
	var sources = /* @__PURE__ */ new Map();
	var is_proxied_array = is_array(value);
	var version = /* @__PURE__ */ state(0);
	var parent_version = update_version;
	var with_parent = (fn) => {
		if (update_version === parent_version) {
			return fn();
		}
		var reaction = active_reaction;
		var version2 = update_version;
		set_active_reaction(null);
		set_update_version(parent_version);
		var result = fn();
		set_active_reaction(reaction);
		set_update_version(version2);
		return result;
	};
	if (is_proxied_array) {
		sources.set(
			'length',
			/* @__PURE__ */ state(
				/** @type {any[]} */
				value.length
			)
		);
	}
	return new Proxy(
		/** @type {any} */
		value,
		{
			defineProperty(_, prop, descriptor) {
				if (!('value' in descriptor) || descriptor.configurable === false || descriptor.enumerable === false || descriptor.writable === false) {
					state_descriptors_fixed();
				}
				var s = sources.get(prop);
				if (s === void 0) {
					s = with_parent(() => {
						var s2 = /* @__PURE__ */ state(descriptor.value);
						sources.set(prop, s2);
						return s2;
					});
				} else {
					set(s, descriptor.value, true);
				}
				return true;
			},
			deleteProperty(target, prop) {
				var s = sources.get(prop);
				if (s === void 0) {
					if (prop in target) {
						const s2 = with_parent(() => /* @__PURE__ */ state(UNINITIALIZED));
						sources.set(prop, s2);
						increment(version);
					}
				} else {
					set(s, UNINITIALIZED);
					increment(version);
				}
				return true;
			},
			get(target, prop, receiver) {
				if (prop === STATE_SYMBOL) {
					return value;
				}
				var s = sources.get(prop);
				var exists = prop in target;
				if (s === void 0 && (!exists || get_descriptor(target, prop)?.writable)) {
					s = with_parent(() => {
						var p = proxy(exists ? target[prop] : UNINITIALIZED);
						var s2 = /* @__PURE__ */ state(p);
						return s2;
					});
					sources.set(prop, s);
				}
				if (s !== void 0) {
					var v = get(s);
					return v === UNINITIALIZED ? void 0 : v;
				}
				return Reflect.get(target, prop, receiver);
			},
			getOwnPropertyDescriptor(target, prop) {
				var descriptor = Reflect.getOwnPropertyDescriptor(target, prop);
				if (descriptor && 'value' in descriptor) {
					var s = sources.get(prop);
					if (s) descriptor.value = get(s);
				} else if (descriptor === void 0) {
					var source2 = sources.get(prop);
					var value2 = source2?.v;
					if (source2 !== void 0 && value2 !== UNINITIALIZED) {
						return {
							enumerable: true,
							configurable: true,
							value: value2,
							writable: true
						};
					}
				}
				return descriptor;
			},
			has(target, prop) {
				if (prop === STATE_SYMBOL) {
					return true;
				}
				var s = sources.get(prop);
				var has = (s !== void 0 && s.v !== UNINITIALIZED) || Reflect.has(target, prop);
				if (s !== void 0 || (active_effect !== null && (!has || get_descriptor(target, prop)?.writable))) {
					if (s === void 0) {
						s = with_parent(() => {
							var p = has ? proxy(target[prop]) : UNINITIALIZED;
							var s2 = /* @__PURE__ */ state(p);
							return s2;
						});
						sources.set(prop, s);
					}
					var value2 = get(s);
					if (value2 === UNINITIALIZED) {
						return false;
					}
				}
				return has;
			},
			set(target, prop, value2, receiver) {
				var s = sources.get(prop);
				var has = prop in target;
				if (is_proxied_array && prop === 'length') {
					for (var i = value2; i < /** @type {Source<number>} */ s.v; i += 1) {
						var other_s = sources.get(i + '');
						if (other_s !== void 0) {
							set(other_s, UNINITIALIZED);
						} else if (i in target) {
							other_s = with_parent(() => /* @__PURE__ */ state(UNINITIALIZED));
							sources.set(i + '', other_s);
						}
					}
				}
				if (s === void 0) {
					if (!has || get_descriptor(target, prop)?.writable) {
						s = with_parent(() => /* @__PURE__ */ state(void 0));
						set(s, proxy(value2));
						sources.set(prop, s);
					}
				} else {
					has = s.v !== UNINITIALIZED;
					var p = with_parent(() => proxy(value2));
					set(s, p);
				}
				var descriptor = Reflect.getOwnPropertyDescriptor(target, prop);
				if (descriptor?.set) {
					descriptor.set.call(receiver, value2);
				}
				if (!has) {
					if (is_proxied_array && typeof prop === 'string') {
						var ls =
							/** @type {Source<number>} */
							sources.get('length');
						var n = Number(prop);
						if (Number.isInteger(n) && n >= ls.v) {
							set(ls, n + 1);
						}
					}
					increment(version);
				}
				return true;
			},
			ownKeys(target) {
				get(version);
				var own_keys = Reflect.ownKeys(target).filter((key2) => {
					var source3 = sources.get(key2);
					return source3 === void 0 || source3.v !== UNINITIALIZED;
				});
				for (var [key, source2] of sources) {
					if (source2.v !== UNINITIALIZED && !(key in target)) {
						own_keys.push(key);
					}
				}
				return own_keys;
			},
			setPrototypeOf() {
				state_prototype_fixed();
			}
		}
	);
}
var $window;
var first_child_getter;
var next_sibling_getter;
function init_operations() {
	if ($window !== void 0) {
		return;
	}
	$window = window;
	var element_prototype = Element.prototype;
	var node_prototype = Node.prototype;
	var text_prototype = Text.prototype;
	first_child_getter = get_descriptor(node_prototype, 'firstChild').get;
	next_sibling_getter = get_descriptor(node_prototype, 'nextSibling').get;
	if (is_extensible(element_prototype)) {
		element_prototype.__click = void 0;
		element_prototype.__className = void 0;
		element_prototype.__attributes = null;
		element_prototype.__style = void 0;
		element_prototype.__e = void 0;
	}
	if (is_extensible(text_prototype)) {
		text_prototype.__t = void 0;
	}
}
function create_text(value = '') {
	return document.createTextNode(value);
}
// @__NO_SIDE_EFFECTS__
function get_first_child(node) {
	return (
		/** @type {TemplateNode | null} */
		first_child_getter.call(node)
	);
}
// @__NO_SIDE_EFFECTS__
function get_next_sibling(node) {
	return (
		/** @type {TemplateNode | null} */
		next_sibling_getter.call(node)
	);
}
function clear_text_content(node) {
	node.textContent = '';
}
function without_reactive_context(fn) {
	var previous_reaction = active_reaction;
	var previous_effect = active_effect;
	set_active_reaction(null);
	set_active_effect(null);
	try {
		return fn();
	} finally {
		set_active_reaction(previous_reaction);
		set_active_effect(previous_effect);
	}
}
function push_effect(effect, parent_effect) {
	var parent_last = parent_effect.last;
	if (parent_last === null) {
		parent_effect.last = parent_effect.first = effect;
	} else {
		parent_last.next = effect;
		effect.prev = parent_last;
		parent_effect.last = effect;
	}
}
function create_effect(type, fn, sync) {
	var parent = active_effect;
	if (parent !== null && (parent.f & INERT) !== 0) {
		type |= INERT;
	}
	var effect = {
		ctx: component_context,
		deps: null,
		nodes: null,
		f: type | DIRTY | CONNECTED,
		first: null,
		fn,
		last: null,
		next: null,
		parent,
		b: parent && parent.b,
		prev: null,
		teardown: null,
		wv: 0,
		ac: null
	};
	if (sync) {
		try {
			update_effect(effect);
			effect.f |= EFFECT_RAN;
		} catch (e2) {
			destroy_effect(effect);
			throw e2;
		}
	} else if (fn !== null) {
		schedule_effect(effect);
	}
	var e = effect;
	if (
		sync &&
		e.deps === null &&
		e.teardown === null &&
		e.nodes === null &&
		e.first === e.last && // either `null`, or a singular child
		(e.f & EFFECT_PRESERVED) === 0
	) {
		e = e.first;
		if ((type & BLOCK_EFFECT) !== 0 && (type & EFFECT_TRANSPARENT) !== 0 && e !== null) {
			e.f |= EFFECT_TRANSPARENT;
		}
	}
	if (e !== null) {
		e.parent = parent;
		if (parent !== null) {
			push_effect(e, parent);
		}
		if (active_reaction !== null && (active_reaction.f & DERIVED) !== 0 && (type & ROOT_EFFECT) === 0) {
			var derived =
				/** @type {Derived} */
				active_reaction;
			(derived.effects ??= []).push(e);
		}
	}
	return effect;
}
function effect_tracking() {
	return active_reaction !== null && !untracking;
}
function teardown(fn) {
	const effect = create_effect(RENDER_EFFECT, null, false);
	set_signal_status(effect, CLEAN);
	effect.teardown = fn;
	return effect;
}
function create_user_effect(fn) {
	return create_effect(EFFECT | USER_EFFECT, fn, false);
}
function component_root(fn) {
	Batch.ensure();
	const effect = create_effect(ROOT_EFFECT | EFFECT_PRESERVED, fn, true);
	return (options = {}) => {
		return new Promise((fulfil) => {
			if (options.outro) {
				pause_effect(effect, () => {
					destroy_effect(effect);
					fulfil(void 0);
				});
			} else {
				destroy_effect(effect);
				fulfil(void 0);
			}
		});
	};
}
function render_effect(fn, flags = 0) {
	return create_effect(RENDER_EFFECT | flags, fn, true);
}
function block(fn, flags = 0) {
	var effect = create_effect(BLOCK_EFFECT | flags, fn, true);
	return effect;
}
function branch(fn) {
	return create_effect(BRANCH_EFFECT | EFFECT_PRESERVED, fn, true);
}
function execute_effect_teardown(effect) {
	var teardown2 = effect.teardown;
	if (teardown2 !== null) {
		const previously_destroying_effect = is_destroying_effect;
		const previous_reaction = active_reaction;
		set_is_destroying_effect(true);
		set_active_reaction(null);
		try {
			teardown2.call(null);
		} finally {
			set_is_destroying_effect(previously_destroying_effect);
			set_active_reaction(previous_reaction);
		}
	}
}
function destroy_effect_children(signal, remove_dom = false) {
	var effect = signal.first;
	signal.first = signal.last = null;
	while (effect !== null) {
		const controller = effect.ac;
		if (controller !== null) {
			without_reactive_context(() => {
				controller.abort(STALE_REACTION);
			});
		}
		var next = effect.next;
		if ((effect.f & ROOT_EFFECT) !== 0) {
			effect.parent = null;
		} else {
			destroy_effect(effect, remove_dom);
		}
		effect = next;
	}
}
function destroy_block_effect_children(signal) {
	var effect = signal.first;
	while (effect !== null) {
		var next = effect.next;
		if ((effect.f & BRANCH_EFFECT) === 0) {
			destroy_effect(effect);
		}
		effect = next;
	}
}
function destroy_effect(effect, remove_dom = true) {
	var removed = false;
	if ((remove_dom || (effect.f & HEAD_EFFECT) !== 0) && effect.nodes !== null && effect.nodes.end !== null) {
		remove_effect_dom(
			effect.nodes.start,
			/** @type {TemplateNode} */
			effect.nodes.end
		);
		removed = true;
	}
	destroy_effect_children(effect, remove_dom && !removed);
	remove_reactions(effect, 0);
	set_signal_status(effect, DESTROYED);
	var transitions = effect.nodes && effect.nodes.t;
	if (transitions !== null) {
		for (const transition of transitions) {
			transition.stop();
		}
	}
	execute_effect_teardown(effect);
	var parent = effect.parent;
	if (parent !== null && parent.first !== null) {
		unlink_effect(effect);
	}
	effect.next = effect.prev = effect.teardown = effect.ctx = effect.deps = effect.fn = effect.nodes = effect.ac = null;
}
function remove_effect_dom(node, end) {
	while (node !== null) {
		var next = node === end ? null : /* @__PURE__ */ get_next_sibling(node);
		node.remove();
		node = next;
	}
}
function unlink_effect(effect) {
	var parent = effect.parent;
	var prev = effect.prev;
	var next = effect.next;
	if (prev !== null) prev.next = next;
	if (next !== null) next.prev = prev;
	if (parent !== null) {
		if (parent.first === effect) parent.first = next;
		if (parent.last === effect) parent.last = prev;
	}
}
function pause_effect(effect, callback, destroy = true) {
	var transitions = [];
	pause_children(effect, transitions, true);
	var fn = () => {
		if (destroy) destroy_effect(effect);
		if (callback) callback();
	};
	var remaining = transitions.length;
	if (remaining > 0) {
		var check = () => --remaining || fn();
		for (var transition of transitions) {
			transition.out(check);
		}
	} else {
		fn();
	}
}
function pause_children(effect, transitions, local) {
	if ((effect.f & INERT) !== 0) return;
	effect.f ^= INERT;
	var t = effect.nodes && effect.nodes.t;
	if (t !== null) {
		for (const transition of t) {
			if (transition.is_global || local) {
				transitions.push(transition);
			}
		}
	}
	var child = effect.first;
	while (child !== null) {
		var sibling = child.next;
		var transparent =
			(child.f & EFFECT_TRANSPARENT) !== 0 || // If this is a branch effect without a block effect parent,
			// it means the parent block effect was pruned. In that case,
			// transparency information was transferred to the branch effect.
			((child.f & BRANCH_EFFECT) !== 0 && (effect.f & BLOCK_EFFECT) !== 0);
		pause_children(child, transitions, transparent ? local : false);
		child = sibling;
	}
}
function move_effect(effect, fragment) {
	if (!effect.nodes) return;
	var node = effect.nodes.start;
	var end = effect.nodes.end;
	while (node !== null) {
		var next = node === end ? null : /* @__PURE__ */ get_next_sibling(node);
		fragment.append(node);
		node = next;
	}
}
let is_updating_effect = false;
function set_is_updating_effect(value) {
	is_updating_effect = value;
}
let is_destroying_effect = false;
function set_is_destroying_effect(value) {
	is_destroying_effect = value;
}
let active_reaction = null;
let untracking = false;
function set_active_reaction(reaction) {
	active_reaction = reaction;
}
let active_effect = null;
function set_active_effect(effect) {
	active_effect = effect;
}
let current_sources = null;
function push_reaction_value(value) {
	if (active_reaction !== null && true) {
		if (current_sources === null) {
			current_sources = [value];
		} else {
			current_sources.push(value);
		}
	}
}
let new_deps = null;
let skipped_deps = 0;
let untracked_writes = null;
function set_untracked_writes(value) {
	untracked_writes = value;
}
let write_version = 1;
let read_version = 0;
let update_version = read_version;
function set_update_version(value) {
	update_version = value;
}
function increment_write_version() {
	return ++write_version;
}
function is_dirty(reaction) {
	var flags = reaction.f;
	if ((flags & DIRTY) !== 0) {
		return true;
	}
	if (flags & DERIVED) {
		reaction.f &= ~WAS_MARKED;
	}
	if ((flags & MAYBE_DIRTY) !== 0) {
		var dependencies =
			/** @type {Value[]} */
			reaction.deps;
		var length = dependencies.length;
		for (var i = 0; i < length; i++) {
			var dependency = dependencies[i];
			if (
				is_dirty(
					/** @type {Derived} */
					dependency
				)
			) {
				update_derived(
					/** @type {Derived} */
					dependency
				);
			}
			if (dependency.wv > reaction.wv) {
				return true;
			}
		}
		if (
			(flags & CONNECTED) !== 0 && // During time traveling we don't want to reset the status so that
			// traversal of the graph in the other batches still happens
			batch_values === null
		) {
			set_signal_status(reaction, CLEAN);
		}
	}
	return false;
}
function schedule_possible_effect_self_invalidation(signal, effect, root = true) {
	var reactions = signal.reactions;
	if (reactions === null) return;
	if (current_sources?.includes(signal)) {
		return;
	}
	for (var i = 0; i < reactions.length; i++) {
		var reaction = reactions[i];
		if ((reaction.f & DERIVED) !== 0) {
			schedule_possible_effect_self_invalidation(
				/** @type {Derived} */
				reaction,
				effect,
				false
			);
		} else if (effect === reaction) {
			if (root) {
				set_signal_status(reaction, DIRTY);
			} else if ((reaction.f & CLEAN) !== 0) {
				set_signal_status(reaction, MAYBE_DIRTY);
			}
			schedule_effect(
				/** @type {Effect} */
				reaction
			);
		}
	}
}
function update_reaction(reaction) {
	var previous_deps = new_deps;
	var previous_skipped_deps = skipped_deps;
	var previous_untracked_writes = untracked_writes;
	var previous_reaction = active_reaction;
	var previous_sources = current_sources;
	var previous_component_context = component_context;
	var previous_untracking = untracking;
	var previous_update_version = update_version;
	var flags = reaction.f;
	new_deps = /** @type {null | Value[]} */ null;
	skipped_deps = 0;
	untracked_writes = null;
	active_reaction = (flags & (BRANCH_EFFECT | ROOT_EFFECT)) === 0 ? reaction : null;
	current_sources = null;
	set_component_context(reaction.ctx);
	untracking = false;
	update_version = ++read_version;
	if (reaction.ac !== null) {
		without_reactive_context(() => {
			reaction.ac.abort(STALE_REACTION);
		});
		reaction.ac = null;
	}
	try {
		reaction.f |= REACTION_IS_UPDATING;
		var fn =
			/** @type {Function} */
			reaction.fn;
		var result = fn();
		var deps = reaction.deps;
		if (new_deps !== null) {
			var i;
			remove_reactions(reaction, skipped_deps);
			if (deps !== null && skipped_deps > 0) {
				deps.length = skipped_deps + new_deps.length;
				for (i = 0; i < new_deps.length; i++) {
					deps[skipped_deps + i] = new_deps[i];
				}
			} else {
				reaction.deps = deps = new_deps;
			}
			if (effect_tracking() && (reaction.f & CONNECTED) !== 0) {
				for (i = skipped_deps; i < deps.length; i++) {
					(deps[i].reactions ??= []).push(reaction);
				}
			}
		} else if (deps !== null && skipped_deps < deps.length) {
			remove_reactions(reaction, skipped_deps);
			deps.length = skipped_deps;
		}
		if (is_runes() && untracked_writes !== null && !untracking && deps !== null && (reaction.f & (DERIVED | MAYBE_DIRTY | DIRTY)) === 0) {
			for (i = 0; i < /** @type {Source[]} */ untracked_writes.length; i++) {
				schedule_possible_effect_self_invalidation(
					untracked_writes[i],
					/** @type {Effect} */
					reaction
				);
			}
		}
		if (previous_reaction !== null && previous_reaction !== reaction) {
			read_version++;
			if (untracked_writes !== null) {
				if (previous_untracked_writes === null) {
					previous_untracked_writes = untracked_writes;
				} else {
					previous_untracked_writes.push(.../** @type {Source[]} */ untracked_writes);
				}
			}
		}
		if ((reaction.f & ERROR_VALUE) !== 0) {
			reaction.f ^= ERROR_VALUE;
		}
		return result;
	} catch (error) {
		return handle_error(error);
	} finally {
		reaction.f ^= REACTION_IS_UPDATING;
		new_deps = previous_deps;
		skipped_deps = previous_skipped_deps;
		untracked_writes = previous_untracked_writes;
		active_reaction = previous_reaction;
		current_sources = previous_sources;
		set_component_context(previous_component_context);
		untracking = previous_untracking;
		update_version = previous_update_version;
	}
}
function remove_reaction(signal, dependency) {
	let reactions = dependency.reactions;
	if (reactions !== null) {
		var index = index_of.call(reactions, signal);
		if (index !== -1) {
			var new_length = reactions.length - 1;
			if (new_length === 0) {
				reactions = dependency.reactions = null;
			} else {
				reactions[index] = reactions[new_length];
				reactions.pop();
			}
		}
	}
	if (
		reactions === null &&
		(dependency.f & DERIVED) !== 0 && // Destroying a child effect while updating a parent effect can cause a dependency to appear
		// to be unused, when in fact it is used by the currently-updating parent. Checking `new_deps`
		// allows us to skip the expensive work of disconnecting and immediately reconnecting it
		(new_deps === null || !new_deps.includes(dependency))
	) {
		var derived =
			/** @type {Derived} */
			dependency;
		if ((derived.f & CONNECTED) !== 0) {
			derived.f ^= CONNECTED;
			derived.f &= ~WAS_MARKED;
		}
		update_derived_status(derived);
		destroy_derived_effects(derived);
		remove_reactions(derived, 0);
	}
}
function remove_reactions(signal, start_index) {
	var dependencies = signal.deps;
	if (dependencies === null) return;
	for (var i = start_index; i < dependencies.length; i++) {
		remove_reaction(signal, dependencies[i]);
	}
}
function update_effect(effect) {
	var flags = effect.f;
	if ((flags & DESTROYED) !== 0) {
		return;
	}
	set_signal_status(effect, CLEAN);
	var previous_effect = active_effect;
	var was_updating_effect = is_updating_effect;
	active_effect = effect;
	is_updating_effect = true;
	try {
		if ((flags & (BLOCK_EFFECT | MANAGED_EFFECT)) !== 0) {
			destroy_block_effect_children(effect);
		} else {
			destroy_effect_children(effect);
		}
		execute_effect_teardown(effect);
		var teardown2 = update_reaction(effect);
		effect.teardown = typeof teardown2 === 'function' ? teardown2 : null;
		effect.wv = write_version;
		var dep;
		if (DEV && tracing_mode_flag && (effect.f & DIRTY) !== 0 && effect.deps !== null);
	} finally {
		is_updating_effect = was_updating_effect;
		active_effect = previous_effect;
	}
}
function get(signal) {
	var flags = signal.f;
	var is_derived = (flags & DERIVED) !== 0;
	if (active_reaction !== null && !untracking) {
		var destroyed = active_effect !== null && (active_effect.f & DESTROYED) !== 0;
		if (!destroyed && !current_sources?.includes(signal)) {
			var deps = active_reaction.deps;
			if ((active_reaction.f & REACTION_IS_UPDATING) !== 0) {
				if (signal.rv < read_version) {
					signal.rv = read_version;
					if (new_deps === null && deps !== null && deps[skipped_deps] === signal) {
						skipped_deps++;
					} else if (new_deps === null) {
						new_deps = [signal];
					} else if (!new_deps.includes(signal)) {
						new_deps.push(signal);
					}
				}
			} else {
				(active_reaction.deps ??= []).push(signal);
				var reactions = signal.reactions;
				if (reactions === null) {
					signal.reactions = [active_reaction];
				} else if (!reactions.includes(active_reaction)) {
					reactions.push(active_reaction);
				}
			}
		}
	}
	if (is_destroying_effect && old_values.has(signal)) {
		return old_values.get(signal);
	}
	if (is_derived) {
		var derived =
			/** @type {Derived} */
			signal;
		if (is_destroying_effect) {
			var value = derived.v;
			if (((derived.f & CLEAN) === 0 && derived.reactions !== null) || depends_on_old_values(derived)) {
				value = execute_derived(derived);
			}
			old_values.set(derived, value);
			return value;
		}
		var should_connect =
			(derived.f & CONNECTED) === 0 && !untracking && active_reaction !== null && (is_updating_effect || (active_reaction.f & CONNECTED) !== 0);
		var is_new = derived.deps === null;
		if (is_dirty(derived)) {
			if (should_connect) {
				derived.f |= CONNECTED;
			}
			update_derived(derived);
		}
		if (should_connect && !is_new) {
			reconnect(derived);
		}
	}
	if (batch_values?.has(signal)) {
		return batch_values.get(signal);
	}
	if ((signal.f & ERROR_VALUE) !== 0) {
		throw signal.v;
	}
	return signal.v;
}
function reconnect(derived) {
	if (derived.deps === null) return;
	derived.f |= CONNECTED;
	for (const dep of derived.deps) {
		(dep.reactions ??= []).push(derived);
		if ((dep.f & DERIVED) !== 0 && (dep.f & CONNECTED) === 0) {
			reconnect(
				/** @type {Derived} */
				dep
			);
		}
	}
}
function depends_on_old_values(derived) {
	if (derived.v === UNINITIALIZED) return true;
	if (derived.deps === null) return false;
	for (const dep of derived.deps) {
		if (old_values.has(dep)) {
			return true;
		}
		if (
			(dep.f & DERIVED) !== 0 &&
			depends_on_old_values(
				/** @type {Derived} */
				dep
			)
		) {
			return true;
		}
	}
	return false;
}
function untrack(fn) {
	var previous_untracking = untracking;
	try {
		untracking = true;
		return fn();
	} finally {
		untracking = previous_untracking;
	}
}
function subscribe_to_store(store, run2, invalidate) {
	if (store == null) {
		run2(void 0);
		if (invalidate) invalidate(void 0);
		return noop;
	}
	const unsub = untrack(() =>
		store.subscribe(
			run2,
			// @ts-expect-error
			invalidate
		)
	);
	return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
}
export {
	clear_text_content as $,
	ATTACHMENT_KEY as A,
	Batch as B,
	COMMENT_NODE as C,
	set_active_reaction as D,
	ELEMENT_PRESERVE_ATTRIBUTE_CASE as E,
	set_component_context as F,
	handle_error as G,
	HYDRATION_START as H,
	active_reaction as I,
	component_context as J,
	move_effect as K,
	set_signal_status as L,
	DIRTY as M,
	schedule_effect as N,
	MAYBE_DIRTY as O,
	internal_set as P,
	destroy_effect as Q,
	invoke_error_boundary as R,
	STALE_REACTION as S,
	svelte_boundary_reset_onerror as T,
	EFFECT_TRANSPARENT as U,
	EFFECT_PRESERVED as V,
	BOUNDARY_EFFECT as W,
	define_property as X,
	init_operations as Y,
	get_first_child as Z,
	hydration_failed as _,
	subscribe_to_store as a,
	array_from as a0,
	component_root as a1,
	push as a2,
	pop as a3,
	set as a4,
	LEGACY_PROPS as a5,
	flushSync as a6,
	mutable_source as a7,
	run as b,
	HYDRATION_END as c,
	ELEMENT_IS_INPUT as d,
	ELEMENT_IS_NAMESPACED as e,
	render_effect as f,
	HYDRATION_ERROR as g,
	get_next_sibling as h,
	HYDRATION_START_ELSE as i,
	effect_tracking as j,
	get as k,
	source as l,
	increment as m,
	noop as n,
	active_effect as o,
	block as p,
	queue_micro_task as q,
	run_all as r,
	safe_not_equal as s,
	teardown as t,
	untrack as u,
	branch as v,
	pause_effect as w,
	create_text as x,
	defer_effect as y,
	set_active_effect as z
};
//# sourceMappingURL=utils2.js.map
