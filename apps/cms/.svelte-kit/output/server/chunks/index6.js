import './client.js';
import { j as getContext } from './index5.js';
import 'clsx';
function context() {
	return getContext('__request__');
}
const page$1 = {
	get data() {
		return context().page.data;
	},
	get error() {
		return context().page.error;
	},
	get params() {
		return context().page.params;
	},
	get status() {
		return context().page.status;
	},
	get url() {
		return context().page.url;
	}
};
const page = page$1;
export { page as p };
//# sourceMappingURL=index6.js.map
