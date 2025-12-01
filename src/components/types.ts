export interface AutocompleteProps {
	options?: string[];
	placeholder?: string;
	'on:select'?: (selectedOption: string) => void;
}

export type Folder = {
	_id: string;
	name: string;
	path: string[];
};

export interface BreadcrumbProps {
	breadcrumb: string[];
	openFolder: (folderId: string | null) => void;
	folders: Folder[];
}
