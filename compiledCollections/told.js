// WARNING: Generated file. Do not edit.
// HASH: 4b4bc4afc5ec5402

export const schema = {
    _id: "f667aa87d6204a9080a074bfee70bd94",
    icon: "bi:card-text",
    status: "publish",
    description: "Posts Collection",
    slug: "posts",
    fields: [
        globalThis.widgets.Email({ label: "Email", db_fieldName: "email", required: false }),
        globalThis.widgets.Input({
            label: "Test",
            db_fieldName: "dbtest",
            required: true,
            translated: true,
            icon: "ri:t-box-line",
            helper: "This is the helper text for Text",
            placeholder: "Enter Test Placeholder",
        }),
        globalThis.widgets.MediaUpload({
            multiupload: false,
            watermark: {
                url: "/static/watermarks/logo.png",
                position: "southeast",
                scale: 20,
            },
        }),
    ]
};
