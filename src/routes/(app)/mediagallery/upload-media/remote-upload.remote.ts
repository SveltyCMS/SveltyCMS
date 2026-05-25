/**
 * @file src/routes/(app)/mediagallery/upload-media/remote-upload.remote.ts
 * @description Remote URL upload function — callable directly from the component.
 */

export async function uploadRemoteUrls(urls: string[], folder = "global") {
  const fd = new FormData();
  fd.append("remoteUrls", JSON.stringify(urls));
  fd.append("folder", folder);

  const r = await fetch("/mediagallery?/remoteUpload", { method: "POST", body: fd });
  const d = await r.json();

  const ok = d.type === "success" || d.success;
  return ok ? { success: true } : { success: false, error: d.error || "Upload failed" };
}
