import { describe, expect, it } from "vitest";
import { toPublicID } from "./publicId";
import { normalizeProtectedPath, parseWorkspaceRoute, toMePath, toPathnameSearch } from "./workspaceRouting";

describe("parseWorkspaceRoute", () => {
  it("parses friends home routes with tab query", () => {
    expect(parseWorkspaceRoute("/channels/@me", "")).toEqual({ kind: "friends", tab: "all" });
    expect(parseWorkspaceRoute("/channels/@me", "?tab=online")).toEqual({ kind: "friends", tab: "online" });
    expect(parseWorkspaceRoute("/channels/@me", "?tab=unknown")).toEqual({ kind: "friends", tab: "all" });
  });

  it("parses dm routes", () => {
    expect(parseWorkspaceRoute("/channels/dm/abc123", "")).toEqual({ kind: "dm", dmId: "abc123" });
  });

  it("parses server routes with and without channel", () => {
    expect(parseWorkspaceRoute("/channels/server-1", "")).toEqual({
      kind: "server",
      serverId: "server-1",
      channelId: null
    });

    expect(parseWorkspaceRoute("/channels/server-1/channel-9", "")).toEqual({
      kind: "server",
      serverId: "server-1",
      channelId: "channel-9"
    });
  });

  it("parses settings route", () => {
    expect(parseWorkspaceRoute("/settings/appearance", "")).toEqual({
      kind: "settings",
      section: "appearance"
    });
  });

  it("rejects invalid routes", () => {
    expect(parseWorkspaceRoute("/channels/dm/", "")).toBeNull();
    expect(parseWorkspaceRoute("/channels/@me/abc", "")).toBeNull();
    expect(parseWorkspaceRoute("/settings/not-real", "")).toBeNull();
    expect(parseWorkspaceRoute("/unknown", "")).toBeNull();
  });
});

describe("workspace path helpers", () => {
  it("builds friends path without query params", () => {
    expect(toMePath("all")).toBe("/channels/@me");
    expect(toMePath("pending")).toBe("/channels/@me");
  });

  it("normalizes valid protected paths and rejects invalid ones", () => {
    expect(normalizeProtectedPath("/channels/@me?tab=online")).toBe("/channels/@me");
    expect(normalizeProtectedPath("/channels/dm/abcd")).toBe("/channels/dm/abcd");
    expect(normalizeProtectedPath("/settings/appearance")).toBe("/settings/appearance");
    expect(normalizeProtectedPath("/invalid")).toBeNull();
    expect(normalizeProtectedPath("javascript:alert(1)")).toBeNull();
  });

  it("serializes parsed routes back to pathname", () => {
    expect(toPathnameSearch({ kind: "friends", tab: "add-friend" })).toBe("/channels/@me");
    expect(toPathnameSearch({ kind: "dm", dmId: "dm-1" })).toBe("/channels/dm/dm-1");
    expect(toPathnameSearch({ kind: "server", serverId: "s-1", channelId: null })).toBe("/channels/s-1");
    expect(toPathnameSearch({ kind: "server", serverId: "s-1", channelId: "c-1" })).toBe("/channels/s-1/c-1");
    expect(toPathnameSearch({ kind: "settings", section: "voice-video" })).toBe("/settings/voice-video");
  });

  it("serializes UUID ids as short public ids and parses them back", () => {
    const serverUUID = "9a4b7d1f-0d71-43ea-b136-67c909f85153";
    const channelUUID = "7b44d5d9-209f-445a-809f-60372de6f2d2";
    const dmUUID = "5f3ba1cc-fbd8-426a-9f64-bae8ee2758da";

    const serverPath = toPathnameSearch({ kind: "server", serverId: serverUUID, channelId: channelUUID });
    const dmPath = toPathnameSearch({ kind: "dm", dmId: dmUUID });

    expect(serverPath).toBe(`/channels/${toPublicID(serverUUID)}/${toPublicID(channelUUID)}`);
    expect(dmPath).toBe(`/channels/dm/${toPublicID(dmUUID)}`);

    expect(parseWorkspaceRoute(serverPath, "")).toEqual({
      kind: "server",
      serverId: serverUUID,
      channelId: channelUUID
    });
    expect(parseWorkspaceRoute(dmPath, "")).toEqual({ kind: "dm", dmId: dmUUID });
  });
});
