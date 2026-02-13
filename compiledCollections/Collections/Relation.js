// WARNING: Generated file. Do not edit.
// HASH: b29293fe0cce2331

export const schema = {
    _id: "f5251d5231df4fb5aee49108972707d1",
    // Collection Name comming from filename, so not needed
    // Optional & Icon, status, slug
    // See for possible Icons https://icon-sets.iconify.design/
    icon: 'mdi:relation-many-to-many',
    // Defined Fields that are used in Collection
    // Widget fields can be inspected for individual options
    fields: [
        globalThis.widgets.Relation({
            label: 'Relation M2M to Posts',
            db_fieldName: 'relationM2MPosts',
            relation: 'Names',
            displayPath: 'Last Name'
        })
    ]
};
