import { h, D as t, I as S, B as b, S as k } from './DrlZFkx8.js';
function u(r, i) {
	return r === i || r?.[k] === i;
}
function c(r = {}, i, a, B) {
	return (
		h(() => {
			var f, s;
			return (
				t(() => {
					((f = s),
						(s = []),
						b(() => {
							r !== a(...s) && (i(r, ...s), f && u(a(...f), r) && i(null, ...f));
						}));
				}),
				() => {
					S(() => {
						s && u(a(...s), r) && i(null, ...s);
					});
				}
			);
		}),
		r
	);
}
export { c as b };
//# sourceMappingURL=YQp2a1pQ.js.map
