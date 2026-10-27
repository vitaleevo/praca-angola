import { BadRequestException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CrmSocialPublishingService } from "./crm-social-publishing.service";

describe("CrmSocialPublishingService", () => {
  const workspaceId = "1849c921-1a1a-4d88-bd2d-52136c0d22ee";
  const channelId = "134ecea1-ffae-4d11-ab16-f79559366880";
  const mediaId = "56c6213c-b64e-4965-acfa-37f4842c0775";
  const database = { query: vi.fn() };
  const social = { validatePublishingChannels: vi.fn(), assertPublishingAccess: vi.fn(), publishToChannel: vi.fn() };
  let service: CrmSocialPublishingService;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PUBLIC_SITE_URL = "http://localhost:3100";
    service = new CrmSocialPublishingService(database as never, social as never);
  });

  it("rejects a photo that does not belong to the workspace before saving a draft", async () => {
    database.query.mockResolvedValue({ rows: [] });
    await expect(service.saveDraft(workspaceId, {
      channelIds: [channelId], content: "Produto", mediaUrls: [`http://localhost:3100/api/v1/media/${mediaId}`],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(database.query).toHaveBeenCalledTimes(1);
  });

  it("requires Meta publishing access before claiming a post", async () => {
    database.query.mockResolvedValueOnce({ rows: [{ id: mediaId, workspace_id: workspaceId, channel_ids: [channelId], content: "Olá", media_urls: [], status: "draft" }] });
    social.assertPublishingAccess.mockRejectedValue(new BadRequestException("Permissão em falta"));
    await expect(service.publishNow(workspaceId, mediaId)).rejects.toBeInstanceOf(BadRequestException);
    expect(database.query).toHaveBeenCalledTimes(1);
    expect(social.publishToChannel).not.toHaveBeenCalled();
  });
});
