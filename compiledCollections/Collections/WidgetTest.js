// WARNING: Generated file. Do not edit.
// HASH: 554e47a894f0587c

export const schema = {
    _id: "3d8b996b2aba47ffb1b36165ed5a3d49",
    // Collection Name comming from filename, so not needed
    // Optional & Icon, status, slug
    // See for possible Icons https://icon-sets.iconify.design/
    icon: 'carbon:rule-test',
    // Defined Fields that are used in Collection
    // Widget fields can be inspected for individual options
    fields: [
        globalThis.widgets.Input({
            label: 'First',
            db_fieldName: 'firstname',
            icon: 'ri:t-box-line',
            // placeholder: get(LL).COLLECTION_TEST_First_placeholder(),
            placeholder: 'Enter First Name',
            required: true,
            translated: true,
            width: 3
        }),
        globalThis.widgets.Input({
            label: 'Middle',
            db_fieldName: 'middlename',
            icon: 'ri:t-box-line',
            placeholder: 'Enter Middle Name',
            readonly: true,
            width: 3
        }),
        globalThis.widgets.Input({
            label: 'Last',
            db_fieldName: 'lastname',
            icon: 'ri:t-box-line',
            placeholder: 'Enter Last Name',
            width: 3,
            translated: true
        }),
        globalThis.widgets.Input({
            label: 'Full Text option',
            db_fieldName: 'Full_Text_option',
            icon: 'carbon:character-whole-number',
            prefix: 'pre',
            suffix: 'suf',
            count: 10,
            minLength: 2,
            maxLength: 15,
            placeholder: 'Enter Full Text',
            translated: true,
            required: true
        }),
        globalThis.widgets.Email({
            label: 'Email',
            db_fieldName: 'email',
            icon: 'material-symbols:mail-outline',
            placeholder: 'Enter Email',
            required: true
        }),
        globalThis.widgets.RemoteVideo({
            label: 'RemoteVideo',
            db_fieldName: 'remotevideo',
            icon: 'mdi:youtube',
            placeholder: 'Enter RemoteVideo',
            required: true
        }),
        globalThis.widgets.Date({
            label: 'Date',
            db_fieldName: 'date',
            icon: 'bi:calendar3',
            required: true
        }),
        // DateTime is provided by the same core Date widget via the `timePicker` option.
        globalThis.widgets.Date({
            timePicker: true,
            label: 'DateTime',
            db_fieldName: 'datetime',
            icon: 'bi:calendar3',
            required: true
        }),
        globalThis.widgets.Number({
            label: 'Number',
            db_fieldName: 'number',
            icon: 'carbon:character-whole-number',
            placeholder: 'Enter Number',
            required: true,
            min: 0,
            prefix: 'height',
            suffix: 'mm'
        }),
        globalThis.widgets.Currency({
            label: 'Currency',
            db_fieldName: 'currency',
            currencyCode: 'Eur',
            icon: 'carbon:character-whole-number',
            placeholder: 'Enter Currency',
            required: true,
            prefix: '€',
            suffix: 'Cent',
            step: 0.01
        }),
        globalThis.widgets.PhoneNumber({
            label: 'Phone Number',
            db_fieldName: 'phonenumber',
            icon: 'ph:phone',
            placeholder: 'Enter Phone Number',
            required: true
        }),
        globalThis.widgets.Radio({
            label: 'Radio Test',
            db_fieldName: 'radio',
            icon: 'akar-icons:radio-fill',
            required: true,
            width: 4,
            color: 'pink', // selector color
            legend: 'Select Radio option',
            options: [
                { label: 'Yes', value: 'yes' },
                { label: 'No', value: 'no' },
                { label: 'Maybe', value: 'maybe' }
            ]
        }),
        globalThis.widgets.Checkbox({
            label: 'Checkbox Test',
            db_fieldName: 'checkbox',
            icon: 'mdi:check-bold',
            required: true,
            width: 4,
            color: 'yellow', // selector color
            legend: 'Select Checkbox option'
        }),
        globalThis.widgets.ColorPicker({
            label: 'ColorPicker',
            db_fieldName: 'colorpicker',
            icon: 'pepicons:color-picker',
            required: true,
            width: 4
        }),
        globalThis.widgets.Rating({
            label: 'Rating',
            db_fieldName: 'rating',
            icon: 'material-symbols:star',
            maxRating: 7,
            color: 'pink',
            width: 4
        }),
        globalThis.widgets.RichText({
            label: 'RichText',
            db_fieldName: 'RichText',
            icon: 'ri:t-box-line',
            required: true
        }),
        globalThis.widgets.SEO({
            label: 'Seo',
            db_fieldName: 'seo',
            icon: 'tabler:seo',
            required: true
        })
    ]
};
