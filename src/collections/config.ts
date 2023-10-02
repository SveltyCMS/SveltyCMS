// Configure how Collections are sorted & displayed in Categories section
    export function createCategories(collections: any) {return [
  {
    "name": "Collections",
    "icon": "bi:collection",
    "collections": [
      collections.Posts,
      collections.Names,
      collections.WidgetTest
    ]
  },
  {
    "name": "Menu",
    "icon": "bi:menu-button-wide",
    "collections": [
      collections.Menu,
      collections.Relation
    ]
  },
  {
    "name": "Media",
    "icon": "ic:baseline-image",
    "collections": [
      collections.Media,
      collections.ImageArray
    ]
  }
];}
	