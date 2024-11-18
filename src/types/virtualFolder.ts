import type { MediaBase } from '@utils/media/mediaModels';
import type { SystemVirtualFolder } from '@src/databases/dbInterface';

export interface FolderContents {
    subfolders: SystemVirtualFolder[];
    mediaFiles: MediaBase[];
}

export interface VirtualFolderUpdateData {
    name?: string;
    parent?: string | null;
    path?: string;
}

export interface FolderResponse {
    id: string;
    name: string;
    path: string;
    ariaLabel: string;
}

export class VirtualFolderError extends Error {
    constructor(
        message: string,
        public status: number = 500,
        public code?: string
    ) {
        super(message);
        this.name = 'VirtualFolderError';
    }
}
