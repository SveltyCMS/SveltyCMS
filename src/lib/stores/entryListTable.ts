import { writable } from 'svelte/store';

const entryListTableStore = writable({
    entryList: [],
    totalPages: 0,
    deleteMap: {}
});

export default entryListTableStore;
