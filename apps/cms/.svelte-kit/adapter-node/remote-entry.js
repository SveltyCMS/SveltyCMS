import { get_request_store, with_request_store } from '@sveltejs/kit/internal/server';
import { parse } from 'devalue';
import { error, json } from '@sveltejs/kit';
import {
	s as stringify_remote_arg,
	f as flatten_issues,
	c as create_field_proxy,
	n as normalize_issue,
	a as set_nested_value,
	d as deep_set,
	b as stringify,
	e as create_remote_key
} from './chunks/shared.js';
import { ValidationError } from '@sveltejs/kit/internal';
import { D as DEV } from './chunks/false.js';
import { b as base, a as app_dir } from './chunks/server.js';
import { p as prerendering } from './chunks/environment.js';
function create_validator(validate_or_fn, maybe_fn) {
	if (!maybe_fn) {
		return (arg) => {
			if (arg !== void 0) {
				error(400, 'Bad Request');
			}
		};
	}
	if (validate_or_fn === 'unchecked') {
		return (arg) => arg;
	}
	if ('~standard' in validate_or_fn) {
		return async (arg) => {
			const { event, state } = get_request_store();
			const result = await validate_or_fn['~standard'].validate(arg);
			if (result.issues) {
				error(
					400,
					await state.handleValidationError({
						issues: result.issues,
						event
					})
				);
			}
			return result.value;
		};
	}
	throw new Error('Invalid validator passed to remote function. Expected "unchecked" or a Standard Schema (https://standardschema.dev)');
}
async function get_response(info, arg, state, get_result) {
	await 0;
	const cache = get_cache(info, state);
	return (cache[stringify_remote_arg(arg, state.transport)] ??= get_result());
}
function parse_remote_response(data, transport) {
	const revivers = {};
	for (const key in transport) {
		revivers[key] = transport[key].decode;
	}
	return parse(data, revivers);
}
async function run_remote_function(event, state, allow_cookies, arg, validate, fn) {
	const store = {
		event: {
			...event,
			setHeaders: () => {
				throw new Error('setHeaders is not allowed in remote functions');
			},
			cookies: {
				...event.cookies,
				set: (name, value, opts) => {
					if (!allow_cookies) {
						throw new Error('Cannot set cookies in `query` or `prerender` functions');
					}
					if (opts.path && !opts.path.startsWith('/')) {
						throw new Error('Cookies set in remote functions must have an absolute path');
					}
					return event.cookies.set(name, value, opts);
				},
				delete: (name, opts) => {
					if (!allow_cookies) {
						throw new Error('Cannot delete cookies in `query` or `prerender` functions');
					}
					if (opts.path && !opts.path.startsWith('/')) {
						throw new Error('Cookies deleted in remote functions must have an absolute path');
					}
					return event.cookies.delete(name, opts);
				}
			}
		},
		state: {
			...state,
			is_in_remote_function: true
		}
	};
	const validated = await with_request_store(store, () => validate(arg));
	return with_request_store(store, () => fn(validated));
}
function get_cache(info, state = get_request_store().state) {
	let cache = state.remote_data?.get(info);
	if (cache === void 0) {
		cache = {};
		(state.remote_data ??= /* @__PURE__ */ new Map()).set(info, cache);
	}
	return cache;
}
// @__NO_SIDE_EFFECTS__
function command(validate_or_fn, maybe_fn) {
	const fn = maybe_fn ?? validate_or_fn;
	const validate = create_validator(validate_or_fn, maybe_fn);
	const __ = { type: 'command', id: '', name: '' };
	const wrapper = (arg) => {
		const { event, state } = get_request_store();
		if (state.is_endpoint_request) {
			if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(event.request.method)) {
				throw new Error(`Cannot call a command (\`${__.name}(${maybe_fn ? '...' : ''})\`) from a ${event.request.method} handler`);
			}
		} else if (!event.isRemoteRequest) {
			throw new Error(`Cannot call a command (\`${__.name}(${maybe_fn ? '...' : ''})\`) during server-side rendering`);
		}
		state.refreshes ??= {};
		const promise = Promise.resolve(run_remote_function(event, state, true, arg, validate, fn));
		promise.updates = () => {
			throw new Error(`Cannot call '${__.name}(...).updates(...)' on the server`);
		};
		return (
			/** @type {ReturnType<RemoteCommand<Input, Output>>} */
			promise
		);
	};
	Object.defineProperty(wrapper, '__', { value: __ });
	Object.defineProperty(wrapper, 'pending', {
		get: () => 0
	});
	return wrapper;
}
// @__NO_SIDE_EFFECTS__
function form(validate_or_fn, maybe_fn) {
	const fn = maybe_fn ?? validate_or_fn;
	const schema = !maybe_fn || validate_or_fn === 'unchecked' ? null : /** @type {any} */ validate_or_fn;
	function create_instance(key) {
		const instance = {};
		instance.method = 'POST';
		Object.defineProperty(instance, 'enhance', {
			value: () => {
				return { action: instance.action, method: instance.method };
			}
		});
		const button_props = {
			type: 'submit',
			onclick: () => {}
		};
		Object.defineProperty(button_props, 'enhance', {
			value: () => {
				return { type: 'submit', formaction: instance.buttonProps.formaction, onclick: () => {} };
			}
		});
		Object.defineProperty(instance, 'buttonProps', {
			value: button_props
		});
		const __ = {
			type: 'form',
			name: '',
			id: '',
			fn: async (data, meta, form_data) => {
				const output = {};
				output.submission = true;
				const { event, state } = get_request_store();
				const validated = await schema?.['~standard'].validate(data);
				if (meta.validate_only) {
					return validated?.issues?.map((issue) => normalize_issue(issue, true)) ?? [];
				}
				if (validated?.issues !== void 0) {
					handle_issues(output, validated.issues, form_data);
				} else {
					if (validated !== void 0) {
						data = validated.value;
					}
					state.refreshes ??= {};
					const issue = create_issues();
					try {
						output.result = await run_remote_function(
							event,
							state,
							true,
							data,
							(d) => d,
							(data2) => (!maybe_fn ? fn() : fn(data2, issue))
						);
					} catch (e) {
						if (e instanceof ValidationError) {
							handle_issues(output, e.issues, form_data);
						} else {
							throw e;
						}
					}
				}
				if (!event.isRemoteRequest) {
					get_cache(__, state)[''] ??= output;
				}
				return output;
			}
		};
		Object.defineProperty(instance, '__', { value: __ });
		Object.defineProperty(instance, 'action', {
			get: () => `?/remote=${__.id}`,
			enumerable: true
		});
		Object.defineProperty(button_props, 'formaction', {
			get: () => `?/remote=${__.id}`,
			enumerable: true
		});
		Object.defineProperty(instance, 'fields', {
			get() {
				const data = get_cache(__)?.[''];
				const issues = flatten_issues(data?.issues ?? []);
				return create_field_proxy(
					{},
					() => data?.input ?? {},
					(path, value) => {
						if (data?.submission) {
							return;
						}
						const input = path.length === 0 ? value : deep_set(data?.input ?? {}, path.map(String), value);
						(get_cache(__)[''] ??= {}).input = input;
					},
					() => issues
				);
			}
		});
		Object.defineProperty(instance, 'result', {
			get() {
				try {
					return get_cache(__)?.['']?.result;
				} catch {
					return void 0;
				}
			}
		});
		Object.defineProperty(instance, 'pending', {
			get: () => 0
		});
		Object.defineProperty(button_props, 'pending', {
			get: () => 0
		});
		Object.defineProperty(instance, 'preflight', {
			// preflight is a noop on the server
			value: () => instance
		});
		Object.defineProperty(instance, 'validate', {
			value: () => {
				throw new Error('Cannot call validate() on the server');
			}
		});
		if (key == void 0) {
			Object.defineProperty(instance, 'for', {
				/** @type {RemoteForm<any, any>['for']} */
				value: (key2) => {
					const { state } = get_request_store();
					const cache_key = __.id + '|' + JSON.stringify(key2);
					let instance2 = (state.form_instances ??= /* @__PURE__ */ new Map()).get(cache_key);
					if (!instance2) {
						instance2 = create_instance(key2);
						instance2.__.id = `${__.id}/${encodeURIComponent(JSON.stringify(key2))}`;
						instance2.__.name = __.name;
						state.form_instances.set(cache_key, instance2);
					}
					return instance2;
				}
			});
		}
		return instance;
	}
	return create_instance();
}
function handle_issues(output, issues, form_data) {
	output.issues = issues.map((issue) => normalize_issue(issue, true));
	if (form_data) {
		output.input = {};
		for (let key of form_data.keys()) {
			if (/^[.\]]?_/.test(key)) continue;
			const is_array = key.endsWith('[]');
			const values = form_data.getAll(key).filter((value) => typeof value === 'string');
			if (is_array) key = key.slice(0, -2);
			set_nested_value(
				/** @type {Record<string, any>} */
				output.input,
				key,
				is_array ? values : values[0]
			);
		}
	}
}
function create_issues() {
	return (
		/** @type {InvalidField<any>} */
		new Proxy(
			/** @param {string} message */
			(message) => {
				if (typeof message !== 'string') {
					throw new Error(
						"`invalid` should now be imported from `@sveltejs/kit` to throw validation issues. The second parameter provided to the form function (renamed to `issue`) is still used to construct issues, e.g. `invalid(issue.field('message'))`. For more info see https://github.com/sveltejs/kit/pulls/14768"
					);
				}
				return create_issue(message);
			},
			{
				get(target, prop) {
					if (typeof prop === 'symbol')
						return (
							/** @type {any} */
							target[prop]
						);
					return create_issue_proxy(prop, []);
				}
			}
		)
	);
	function create_issue(message, path = []) {
		return {
			message,
			path
		};
	}
	function create_issue_proxy(key, path) {
		const new_path = [...path, key];
		const issue_func = (message) => create_issue(message, new_path);
		return new Proxy(issue_func, {
			get(target, prop) {
				if (typeof prop === 'symbol')
					return (
						/** @type {any} */
						target[prop]
					);
				if (/^\d+$/.test(prop)) {
					return create_issue_proxy(parseInt(prop, 10), new_path);
				}
				return create_issue_proxy(prop, new_path);
			}
		});
	}
}
// @__NO_SIDE_EFFECTS__
function prerender(validate_or_fn, fn_or_options, maybe_options) {
	const maybe_fn = typeof fn_or_options === 'function' ? fn_or_options : void 0;
	const options = maybe_options ?? (maybe_fn ? void 0 : fn_or_options);
	const fn = maybe_fn ?? validate_or_fn;
	const validate = create_validator(validate_or_fn, maybe_fn);
	const __ = {
		type: 'prerender',
		id: '',
		name: '',
		has_arg: !!maybe_fn,
		inputs: options?.inputs,
		dynamic: options?.dynamic
	};
	const wrapper = (arg) => {
		const promise = (async () => {
			const { event, state } = get_request_store();
			const payload = stringify_remote_arg(arg, state.transport);
			const id = __.id;
			const url = `${base}/${app_dir}/remote/${id}${payload ? `/${payload}` : ''}`;
			if (!state.prerendering && !DEV && !event.isRemoteRequest) {
				try {
					return await get_response(__, arg, state, async () => {
						const key = stringify_remote_arg(arg, state.transport);
						const cache = get_cache(__, state);
						const promise3 = (cache[key] ??= fetch(new URL(url, event.url.origin).href).then(async (response) => {
							if (!response.ok) {
								throw new Error('Prerendered response not found');
							}
							const prerendered = await response.json();
							if (prerendered.type === 'error') {
								error(prerendered.status, prerendered.error);
							}
							return prerendered.result;
						}));
						return parse_remote_response(await promise3, state.transport);
					});
				} catch {}
			}
			if (state.prerendering?.remote_responses.has(url)) {
				return (
					/** @type {Promise<any>} */
					state.prerendering.remote_responses.get(url)
				);
			}
			const promise2 = get_response(__, arg, state, () => run_remote_function(event, state, false, arg, validate, fn));
			if (state.prerendering) {
				state.prerendering.remote_responses.set(url, promise2);
			}
			const result = await promise2;
			if (state.prerendering) {
				const body = { type: 'result', result: stringify(result, state.transport) };
				state.prerendering.dependencies.set(url, {
					body: JSON.stringify(body),
					response: json(body)
				});
			}
			return result;
		})();
		promise.catch(() => {});
		return (
			/** @type {RemoteResource<Output>} */
			promise
		);
	};
	Object.defineProperty(wrapper, '__', { value: __ });
	return wrapper;
}
// @__NO_SIDE_EFFECTS__
function query(validate_or_fn, maybe_fn) {
	const fn = maybe_fn ?? validate_or_fn;
	const validate = create_validator(validate_or_fn, maybe_fn);
	const __ = { type: 'query', id: '', name: '' };
	const wrapper = (arg) => {
		if (prerendering) {
			throw new Error(
				`Cannot call query '${__.name}' while prerendering, as prerendered pages need static data. Use 'prerender' from $app/server instead`
			);
		}
		const { event, state } = get_request_store();
		const get_remote_function_result = () => run_remote_function(event, state, false, arg, validate, fn);
		const promise = get_response(__, arg, state, get_remote_function_result);
		promise.catch(() => {});
		promise.set = (value) => update_refresh_value(get_refresh_context(__, 'set', arg), value);
		promise.refresh = () => {
			const refresh_context = get_refresh_context(__, 'refresh', arg);
			const is_immediate_refresh = !refresh_context.cache[refresh_context.cache_key];
			const value = is_immediate_refresh ? promise : get_remote_function_result();
			return update_refresh_value(refresh_context, value, is_immediate_refresh);
		};
		promise.withOverride = () => {
			throw new Error(`Cannot call '${__.name}.withOverride()' on the server`);
		};
		return (
			/** @type {RemoteQuery<Output>} */
			promise
		);
	};
	Object.defineProperty(wrapper, '__', { value: __ });
	return wrapper;
}
// @__NO_SIDE_EFFECTS__
function batch(validate_or_fn, maybe_fn) {
	const fn = maybe_fn ?? validate_or_fn;
	const validate = create_validator(validate_or_fn, maybe_fn);
	const __ = {
		type: 'query_batch',
		id: '',
		name: '',
		run: (args) => {
			const { event, state } = get_request_store();
			return run_remote_function(event, state, false, args, (array) => Promise.all(array.map(validate)), fn);
		}
	};
	let batching = { args: [], resolvers: [] };
	const wrapper = (arg) => {
		if (prerendering) {
			throw new Error(
				`Cannot call query.batch '${__.name}' while prerendering, as prerendered pages need static data. Use 'prerender' from $app/server instead`
			);
		}
		const { event, state } = get_request_store();
		const get_remote_function_result = () => {
			return new Promise((resolve, reject) => {
				batching.args.push(arg);
				batching.resolvers.push({ resolve, reject });
				if (batching.args.length > 1) return;
				setTimeout(async () => {
					const batched = batching;
					batching = { args: [], resolvers: [] };
					try {
						const get_result = await run_remote_function(event, state, false, batched.args, (array) => Promise.all(array.map(validate)), fn);
						for (let i = 0; i < batched.resolvers.length; i++) {
							try {
								batched.resolvers[i].resolve(get_result(batched.args[i], i));
							} catch (error2) {
								batched.resolvers[i].reject(error2);
							}
						}
					} catch (error2) {
						for (const resolver of batched.resolvers) {
							resolver.reject(error2);
						}
					}
				}, 0);
			});
		};
		const promise = get_response(__, arg, state, get_remote_function_result);
		promise.catch(() => {});
		promise.set = (value) => update_refresh_value(get_refresh_context(__, 'set', arg), value);
		promise.refresh = () => {
			const refresh_context = get_refresh_context(__, 'refresh', arg);
			const is_immediate_refresh = !refresh_context.cache[refresh_context.cache_key];
			const value = is_immediate_refresh ? promise : get_remote_function_result();
			return update_refresh_value(refresh_context, value, is_immediate_refresh);
		};
		promise.withOverride = () => {
			throw new Error(`Cannot call '${__.name}.withOverride()' on the server`);
		};
		return (
			/** @type {RemoteQuery<Output>} */
			promise
		);
	};
	Object.defineProperty(wrapper, '__', { value: __ });
	return wrapper;
}
Object.defineProperty(query, 'batch', { value: batch, enumerable: true });
function get_refresh_context(__, action, arg) {
	const { state } = get_request_store();
	const { refreshes } = state;
	if (!refreshes) {
		const name = __.type === 'query_batch' ? `query.batch '${__.name}'` : `query '${__.name}'`;
		throw new Error(`Cannot call ${action} on ${name} because it is not executed in the context of a command/form remote function`);
	}
	const cache = get_cache(__, state);
	const cache_key = stringify_remote_arg(arg, state.transport);
	const refreshes_key = create_remote_key(__.id, cache_key);
	return { __, state, refreshes, refreshes_key, cache, cache_key };
}
function update_refresh_value({ __, refreshes, refreshes_key, cache, cache_key }, value, is_immediate_refresh = false) {
	const promise = Promise.resolve(value);
	if (!is_immediate_refresh) {
		cache[cache_key] = promise;
	}
	if (__.id) {
		refreshes[refreshes_key] = promise;
	}
	return promise.then(() => {});
}
export { command, form, prerender, query };
//# sourceMappingURL=remote-entry.js.map
