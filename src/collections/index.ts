// Index file to Structure Category & Collections in Sidebar.
import Test from './Test';
import Images from './Images';
import Posts from './Posts';
import Media from './Media';
import Menu from './Menu';
import ImageArray from './ImageArray';
import ImageEditor from './EditorImage';

// typesafe-i18n
import LL from '$i18n/i18n-svelte';
import { get } from 'svelte/store';

let categories = [
	{
		//Content
		category: get(LL).CollectionCategory_Content(),
		icon: 'bi:collection',
		collections: [Test, Posts],
		collectionIds: []
	},
	{
		//Content
		category: get(LL).CollectionCategory_Menu(),
		icon: 'bi:collection',
		collections: [Menu],
		collectionIds: []
	},
	{
		//Media
		category: get(LL).CollectionCategory_Media(),
		icon: 'bi:images',
		collections: [Images, Media, ImageArray, ImageEditor],
		collectionIds: []
	}
];

categories = categories.map((n) => {
	n.collections.forEach((p) => {
		n.collectionIds.push(p.id);
	});
	return n;
});

export { categories };

export default categories.map((x) => x.collections).reduce((x, acc) => x.concat(acc));
