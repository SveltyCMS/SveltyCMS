let _MediaService: any = null;
async function getMediaServiceClass() {
  if (!_MediaService) {
    const mod = await import("@src/utils/media/media-service.server");
    _MediaService = mod.MediaService;
  }
  return _MediaService;
}

let _dbAdapter: any = null;
async function getDbAdapter() {
  if (!_dbAdapter) {
    const mod = await import("@src/databases/db");
    _dbAdapter = mod.dbAdapter;
  }
  return _dbAdapter;
}

export async function processSingleUpload(
  value: File,
  field: any,
  user: any,
  tenantId: string | null,
  collectionName: string | null,
): Promise<string | null> {
  const dbAdapter = await getDbAdapter();
  if (!dbAdapter) {
    throw new Error("Database adapter not available");
  }

  const MediaService = await getMediaServiceClass();
  const service = new MediaService(dbAdapter);

  const basePath =
    field?.folder ||
    (collectionName ? `collections/${String(collectionName).toLowerCase()}` : tenantId || "global");

  const savedMedia = await service.saveMedia(
    value,
    (user as any)._id.toString(),
    "private",
    basePath,
  );
  return savedMedia.success ? savedMedia.data._id : null;
}

export async function processMultiUpload(
  value: any[],
  field: any,
  user: any,
  tenantId: string | null,
  collectionName: string | null,
): Promise<string[]> {
  const dbAdapter = await getDbAdapter();
  if (!dbAdapter) {
    throw new Error("Database adapter not available");
  }

  const MediaService = await getMediaServiceClass();
  const service = new MediaService(dbAdapter);
  const processedIds: string[] = [];

  const basePath =
    field?.folder ||
    (collectionName ? `collections/${String(collectionName).toLowerCase()}` : tenantId || "global");

  for (const item of value) {
    if (item instanceof File) {
      const savedMedia = await service.saveMedia(
        item,
        (user as any)._id.toString(),
        "private",
        basePath,
      );
      if (savedMedia.success) {
        processedIds.push(savedMedia.data._id);
      }
    } else {
      processedIds.push(item);
    }
  }
  return processedIds;
}
