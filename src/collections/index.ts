// Index file to Structure Category & Collections in Sidebar.
import Test from './Test';
import Images from './Images';
import Posts from './Posts';
import Media from './Media';
import Menu from './Menu';
import ImageArray from './ImageArray';
import ImageEditor from './EditorImage';

let categories = [
	{
		category: 'Collections',
		icon: 'bi:collection',
		collections: [Test, Posts, Menu],
		collectionIds: []
	},
	{
		category: 'Media',
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
