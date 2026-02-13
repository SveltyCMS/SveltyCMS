// WARNING: Generated file. Do not edit.
// HASH: 6b233d8d0190a96b

export const schema = {
    _id: "8814ef91d8604f39af81ff1b863f6177",
    icon: "bi:card-text",
    status: "publish",
    description: "Posts Collection",
    slug: "burton_lang",
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
