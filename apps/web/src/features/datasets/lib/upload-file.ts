/** Browser-side PUT to a presigned URL, with progress (fetch has no upload progress). */

export class UploadError extends Error {
  constructor(readonly status: number) {
    super(status === 0 ? "Network error during upload" : `Upload failed with HTTP ${status}`);
    this.name = "UploadError";
  }
}

export function uploadFile(
  target: { url: string; method: "PUT"; headers: Record<string, string> },
  body: Blob,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(target.method, target.url);
    for (const [name, value] of Object.entries(target.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new UploadError(xhr.status));
    xhr.onerror = () => reject(new UploadError(0));
    xhr.send(body);
  });
}
