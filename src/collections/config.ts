export function createCategories(collections) {
	return [
		{
			name: 'Collections',
			icon: 'bi:collection',
			collections: [collections.Names, collections.ImageArray, collections.Relation, collections.WidgetTest]
		},
		{ name: 'Menu', icon: 'bi:menu-button-wide', collections: [collections.Menu, collections.Posts, collections.Posts2, collections.Media] }
	];
}
