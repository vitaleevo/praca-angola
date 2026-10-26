const META_IMAGE_HOSTS = ["fbcdn.net", "fbsbx.com", "cdninstagram.com", "instagram.com", "facebook.com"];

export function publicMetaImageUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 4096) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (!META_IMAGE_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
