// Restaurant ids are stateless: they encode the source ids so details work after a server restart.
export const encodeId = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

export function decodeId(id) {
  try {
    const obj = JSON.parse(Buffer.from(String(id), 'base64url').toString());
    return obj && typeof obj === 'object' ? obj : null;
  } catch {
    return null;
  }
}
