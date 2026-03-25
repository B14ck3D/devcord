/** Skaluje obraz do kwadratu max `maxEdge` px i zwraca JPEG data URL (do zapisu w avatar_url). */

const MAX_FILE_BYTES = 12 * 1024 * 1024;

export async function resizeImageFileToDataUrl(
  file: File,
  maxEdge = 512,
  jpegQuality = 0.88,
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Wybierz plik graficzny (JPG, PNG, WebP itd.).');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('Plik jest za duży (maks. 12 MB).');
  }

  const blobUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(blobUrl);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) throw new Error('Nieprawidłowy obraz.');

    const scale = Math.min(1, maxEdge / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Brak obsługi canvas w przeglądarce.');
    ctx.drawImage(img, 0, 0, cw, ch);

    let dataUrl: string;
    try {
      dataUrl = canvas.toDataURL('image/jpeg', jpegQuality);
    } catch {
      dataUrl = canvas.toDataURL('image/png');
    }

    if (dataUrl.length > 900_000) {
      throw new Error('Po przetworzeniu avatar jest nadal za duży — spróbuj mniejszego zdjęcia.');
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Nie udało się wczytać pliku.'));
    img.src = src;
  });
}
