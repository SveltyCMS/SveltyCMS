import { n as noop, s as safe_not_equal, a as subscribe_to_store, r as run_all } from './utils2.js';
const subscriber_queue = [];
function readable(value, start) {
	return {
		subscribe: writable(value, start).subscribe
	};
}
function writable(value, start = noop) {
	let stop = null;
	const subscribers = /* @__PURE__ */ new Set();
	function set(new_value) {
		if (safe_not_equal(value, new_value)) {
			value = new_value;
			if (stop) {
				const run_queue = !subscriber_queue.length;
				for (const subscriber of subscribers) {
					subscriber[1]();
					subscriber_queue.push(subscriber, value);
				}
				if (run_queue) {
					for (let i = 0; i < subscriber_queue.length; i += 2) {
						subscriber_queue[i][0](subscriber_queue[i + 1]);
					}
					subscriber_queue.length = 0;
				}
			}
		}
	}
	function update(fn) {
		set(
			fn(
				/** @type {T} */
				value
			)
		);
	}
	function subscribe(run, invalidate = noop) {
		const subscriber = [run, invalidate];
		subscribers.add(subscriber);
		if (subscribers.size === 1) {
			stop = start(set, update) || noop;
		}
		run(
			/** @type {T} */
			value
		);
		return () => {
			subscribers.delete(subscriber);
			if (subscribers.size === 0 && stop) {
				stop();
				stop = null;
			}
		};
	}
	return { set, update, subscribe };
}
function derived(stores, fn, initial_value) {
	const single = !Array.isArray(stores);
	const stores_array = single ? [stores] : stores;
	if (!stores_array.every(Boolean)) {
		throw new Error('derived() expects stores as input, got a falsy value');
	}
	const auto = fn.length < 2;
	return readable(initial_value, (set, update) => {
		let started = false;
		const values = [];
		let pending = 0;
		let cleanup = noop;
		const sync = () => {
			if (pending) {
				return;
			}
			cleanup();
			const result = fn(single ? values[0] : values, set, update);
			if (auto) {
				set(result);
			} else {
				cleanup = typeof result === 'function' ? result : noop;
			}
		};
		const unsubscribers = stores_array.map((store, i) =>
			subscribe_to_store(
				store,
				(value) => {
					values[i] = value;
					pending &= ~(1 << i);
					if (started) {
						sync();
					}
				},
				() => {
					pending |= 1 << i;
				}
			)
		);
		started = true;
		sync();
		return function stop() {
			run_all(unsubscribers);
			cleanup();
			started = false;
		};
	});
}
function get(store) {
	let value;
	subscribe_to_store(store, (_) => (value = _))();
	return value;
}
export { derived as d, get as g, readable as r, writable as w };
//# sourceMappingURL=index4.js.map
