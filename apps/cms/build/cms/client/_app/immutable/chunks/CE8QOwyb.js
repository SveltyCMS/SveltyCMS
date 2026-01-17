import { a as n } from './CY0QKx3Q.js';
function l(t, e) {
	function r() {
		n.set({ element: t, field: { name: e.name, label: e.label || e.name, collection: e.collection }, onInsert: e.onInsert });
	}
	return (
		t.addEventListener('focus', r),
		{
			update(a) {
				e = a;
			},
			destroy() {
				(t.removeEventListener('focus', r), n.current?.element === t && n.clear());
			}
		}
	);
}
export { l as t };
//# sourceMappingURL=CE8QOwyb.js.map
