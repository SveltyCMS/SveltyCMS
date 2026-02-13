// WARNING: Generated file. Do not edit.
// HASH: 0463bfcea6b66a0a

export const schema = {
    _id: "8090c68c1ede4b6eb142c8094bec905b",
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
