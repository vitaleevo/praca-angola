import { afterEach, describe, expect, it, vi } from "vitest";
import { MetaGraphService } from "./meta-graph.service";

afterEach(() => vi.unstubAllGlobals());

describe("MetaGraphService publishing", () => {
  it("encodes unpublished photos as attached_media form fields for one Facebook post", async () => {
    const responses = [{ id: "photo-1" }, { id: "photo-2" }, { id: "post-1" }];
    const fetchMock = vi.fn().mockImplementation(async () => ({ ok: true, json: async () => responses.shift() }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await new MetaGraphService().publishPagePost("123456789", "test-page-token", "Novidades", [
      "https://puvo.example/photo-1.jpg", "https://puvo.example/photo-2.jpg",
    ]);
    expect(result).toBe("post-1");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const first = new URLSearchParams(fetchMock.mock.calls[0][1].body as string);
    expect(first.get("published")).toBe("false");
    const posted = new URLSearchParams(fetchMock.mock.calls[2][1].body as string);
    expect(posted.get("attached_media[0]")).toBe('{"media_fbid":"photo-1"}');
    expect(posted.get("attached_media[1]")).toBe('{"media_fbid":"photo-2"}');
    expect(posted.get("message")).toBe("Novidades");
  });
});
