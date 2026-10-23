const allowedExtensions: Record<string, string> = {
  'image/jpeg': '.jpg .jpeg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'text/plain': '.txt .log .md',
};

export function sanitizeAttachmentFileName(fileName: string) {
  const baseName = fileName.split(/[\\/]/).at(-1) ?? '';
  const normalized = baseName
    .normalize('NFC')
    // Control characters are removed to prevent unsafe path and header values.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/^\.+/, '')
    .trim();
  const limited = Array.from(normalized).slice(0, 180).join('');
  return limited || 'arquivo';
}

export function isAllowedAttachment(fileName: string, mimeType: string) {
  const extensions = allowedExtensions[mimeType];
  if (!extensions) return false;
  const extension = fileName.match(/\.[^.]+$/)?.[0]?.toLowerCase();
  return Boolean(extension && extensions.split(' ').includes(extension));
}

export function detectAttachmentMimeType(fileName: string, bytes: Uint8Array) {
  const startsWith = (...expected: number[]) =>
    expected.every((byte, index) => bytes[index] === byte);
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (startsWith(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (
    (startsWith(0x47, 0x49, 0x46, 0x38, 0x37, 0x61) ||
      startsWith(0x47, 0x49, 0x46, 0x38, 0x39, 0x61)) &&
    fileName.toLowerCase().endsWith('.gif')
  )
    return 'image/gif';
  if (
    startsWith(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return 'image/webp';
  if (startsWith(0x25, 0x50, 0x44, 0x46, 0x2d)) return 'application/pdf';

  if (/\.(txt|log|md)$/i.test(fileName) && !bytes.includes(0)) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return 'text/plain';
    } catch {
      return null;
    }
  }
  return null;
}
