import { campaignState } from "./api";
import { mediaUrl } from "./media";
import { isCmsTag } from "./tags";

describe("campaign state", () => {
  const now = Date.UTC(2026, 10, 9);
  it("is upcoming, running, or ended", () => {
    expect(campaignState({ startsAt: "2026-11-10T00:00:00Z" }, now)).toBe("upcoming");
    expect(campaignState({ startsAt: "2026-11-01T00:00:00Z" }, now)).toBe("running");
    expect(
      campaignState({ startsAt: "2026-11-01T00:00:00Z", endsAt: "2026-11-30T00:00:00Z" }, now),
    ).toBe("running");
    expect(
      campaignState({ startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-11-09T00:00:00Z" }, now),
    ).toBe("ended");
  });
});

describe("media URLs", () => {
  const media = {
    id: 1,
    filename: "cover.jpg",
    width: 2000,
    height: 1000,
    alt: {},
    sizes: {
      card: { filename: "cover-640x360.jpg", width: 640, height: 360 },
      og: { filename: null },
    },
  };

  it("uses the named size, or the original when the CMS made none", () => {
    expect(mediaUrl(media, "card", undefined)).toEqual({
      src: "/cms-media/cover-640x360.jpg",
      width: 640,
      height: 360,
    });
    expect(mediaUrl(media, "og", "https://cdn.example.com/media")).toEqual({
      src: "https://cdn.example.com/media/cover.jpg",
      width: 2000,
      height: 1000,
    });
  });

  it("refuses a file name that is a path", () => {
    expect(
      mediaUrl({ ...media, filename: "../secret", sizes: {} }, undefined, undefined),
    ).toBeUndefined();
    expect(mediaUrl(undefined, "card", undefined)).toBeUndefined();
  });
});

describe("cache tags", () => {
  it("accepts only the CMS's tags", () => {
    expect(isCmsTag("cms:articles")).toBe(true);
    expect(isCmsTag("cms:articles:what-is-bitcoin")).toBe(true);
    expect(isCmsTag("assets")).toBe(false);
    expect(isCmsTag("cms:articles:../x")).toBe(false);
    expect(isCmsTag(42)).toBe(false);
  });
});
