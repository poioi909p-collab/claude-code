/** 업로드 전 이미지 축소 (SPEC 7장): 긴 변 1600px, JPEG 품질 0.8 */
export const MAX_LONG_EDGE = 1600;
export const JPEG_QUALITY = 0.8;

export function fitWithin(width: number, height: number, maxEdge = MAX_LONG_EDGE) {
  const long = Math.max(width, height);
  if (long <= maxEdge) return { width, height };
  const scale = maxEdge / long;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      // 휴대폰 사진의 회전 정보(EXIF)를 반영한다.
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // 일부 브라우저(HEIC 등)는 아래 방법으로 다시 시도
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 사진 파일 → 긴 변 1600px 이하 JPEG */
export async function resizeForUpload(file: Blob): Promise<Blob> {
  const img = await decode(file);
  try {
    const { width, height } = fitWithin(img.width, img.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.fillStyle = "#fff"; // 투명 PNG도 흰 바탕으로
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img.source, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) throw new Error("encode");
    return blob;
  } finally {
    img.close();
  }
}
