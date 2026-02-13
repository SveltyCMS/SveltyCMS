// WARNING: Generated file. Do not edit.
// HASH: a2b1dd435ff208c9

export const schema = {
    _id: "a9fe80d9d59a4465b4f9097dfe80a16f",
    // Collection Name comming from filename, so not needed
    // Optional & Icon, status, slug
    // See for possible Icons https://icon-sets.iconify.design/
    icon: 'fluent:rename-28-filled',
    status: 'unpublish',
    revision: true,
    livePreview: '/api/preview?slug=/posts/names/{slug}',
    // Defined Fields that are used in your Collection
    // Widget fields can be inspected for individual options
    fields: [
        globalThis.widgets.Input({
            label: 'First Name',
            translated: true,
            icon: 'ri:t-box-line',
            placeholder: 'Enter First Name',
            width: 2
        }),
        globalThis.widgets.Input({
            label: 'Last Name',
            translated: true,
            icon: 'ri:t-box-line',
            placeholder: 'Enter Last Name',
            width: 2,
            required: true,
            permissions: {
                developer: {
                    read: false // User cannot read, other roles default to true
                }
            }
        })
    ]
};
