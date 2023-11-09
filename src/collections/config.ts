export function createCategories(collections) {
	return [
		{
			name: 'Collections',
			icon: 'bi:collection',
			collections: [collections.Posts, collections.Names, collections.Media, collections.ImageArray, collections.Relation, collections.WidgetTest]
		},
		{ name: 'Menu', icon: 'bi:menu-button-wide', collections: [collections.Menu] }
	];
}
