import { describe, expect, it } from "vitest";
import { convertTextEmojiShortcuts, isSensitiveMessageContent, shouldHideMessageByDMSpamFilter } from "./chatPreferencesRuntime";

describe("shouldHideMessageByDMSpamFilter", () => {
  it("hides incoming dm messages when filter is all", () => {
    expect(
      shouldHideMessageByDMSpamFilter({
        filter: "all",
        conversationType: "dm",
        isConversationWithFriend: true,
        senderId: "user-2",
        currentUserId: "user-1"
      })
    ).toBe(true);
  });

  it("does not hide own dm messages", () => {
    expect(
      shouldHideMessageByDMSpamFilter({
        filter: "all",
        conversationType: "dm",
        isConversationWithFriend: false,
        senderId: "user-1",
        currentUserId: "user-1"
      })
    ).toBe(false);
  });

  it("hides only non-friend incoming dms when filter is non-friends", () => {
    expect(
      shouldHideMessageByDMSpamFilter({
        filter: "non-friends",
        conversationType: "dm",
        isConversationWithFriend: false,
        senderId: "user-2",
        currentUserId: "user-1"
      })
    ).toBe(true);

    expect(
      shouldHideMessageByDMSpamFilter({
        filter: "non-friends",
        conversationType: "dm",
        isConversationWithFriend: true,
        senderId: "user-2",
        currentUserId: "user-1"
      })
    ).toBe(false);
  });
});

describe("isSensitiveMessageContent", () => {
  it("detects sensitive keywords in message text", () => {
    expect(isSensitiveMessageContent("Bu içerik NSFW olarak işaretlendi")).toBe(true);
  });

  it("detects age-restricted marker", () => {
    expect(isSensitiveMessageContent("18+ içerik bağlantısı")).toBe(true);
  });

  it("returns false for regular content", () => {
    expect(isSensitiveMessageContent("Merhaba nasılsın, bugün toplantı var mı?")).toBe(false);
  });
});

describe("convertTextEmojiShortcuts", () => {
  it("converts common shortcuts", () => {
    expect(convertTextEmojiShortcuts("Merhaba :) nasılsın <3")).toBe("Merhaba 🙂 nasılsın ❤️");
  });

  it("does not convert URL-like fragments", () => {
    expect(convertTextEmojiShortcuts("https://catwa.chat/:) test")).toBe("https://catwa.chat/:) test");
  });
});
