// WARNING: Generated file. Do not edit.
// HASH: 04a01359237197b9

export const schema = {
    _id: "81f3cf99d10b433bba528fe6e8ded6eb",
    // Collection Name comming from filename, so not needed
    // Optional & Icon, status, slug
    // See for possible Icons https://icon-sets.iconify.design/
    icon: 'fluent:rename-28-filled',
    status: 'unpublish',
    revision: true,
    revisionLimit: 2, // limit  number of revisions
    livePreview: '/api/preview?slug=/names/{slug}',
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
