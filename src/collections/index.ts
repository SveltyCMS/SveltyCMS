// Index file to Structure Category & Collections in Sidebar.
import Test from './Test';
import Images from './Images';
import Posts from './Posts';
import Media from './Media';
import Menu from './Menu';
import ImageArray from './ImageArray';
import ImageEditor from './EditorImage';

const categories = [
	{
		category: 'Collections',
		icon: 'bi:collection',
		collections: [Test, Posts, Menu]
	},
	{
		category: 'Media',
		icon: 'bi:images',
		collections: [Images, Media, ImageArray, ImageEditor]
	}
];
export { categories };

export default categories.map((x) => x.collections).reduce((x, acc) => x.concat(acc));
