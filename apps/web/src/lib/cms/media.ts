import type { Media } from "./schemas";

export interface Image {
  src: string;
  width?: number;
  height?: number;
}

/** File names Payload writes; anything else is refused by the media route. */
export const MEDIA_FILE = /^[\w][\w.-]{0,200}$/;

/**
 * The URL of a media file, in a named size when the CMS made one. The admin
 * panel is not public, so files come from CMS_MEDIA_URL (a CDN) when set, or
 * through this app's /cms-media route.
 */
export function mediaUrl(
  media: Media | undefined,
  size: "thumbnail" | "card" | "hero" | "og" | undefined,
  mediaBase: string | undefined,
): Image | undefined {
  if (!media) return undefined;
  const sized = size ? media.sizes?.[size] : undefined;
  const filename = sized?.filename ?? media.filename;
  if (!filename || !MEDIA_FILE.test(filename)) return undefined;
  const base = mediaBase ?? "/cms-media";
  return {
    src: `${base}/${encodeURIComponent(filename)}`,
    width: (sized?.filename ? sized.width : media.width) ?? undefined,
    height: (sized?.filename ? sized.height : media.height) ?? undefined,
  };
}
