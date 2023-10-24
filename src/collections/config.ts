export function createCategories(collections) {
	return [
		{
			name: 'Collections',
			icon: 'bi:collection',
			collections: [
				collections.Posts2,
				collections.Names,
				collections.Media,
				collections.ImageArray,
				collections.Relation,
				collections.WidgetTest,
				collections.Posts
			]
		},
		{ name: 'Menu', icon: 'bi:menu-button-wide', collections: [collections.Menu] }
	];
}
