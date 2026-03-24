import { describe, expect, it } from "vitest";
import { buildReplyPrefixedMessage, parseMessageContent, summarizeMessagePreview } from "./messageContent";

describe("parseMessageContent", () => {
  it("parses explicit attachment blocks with 📎 prefix", () => {
    const content = "Merhaba\n\n📎 ekran.png\nhttps://localhost:8080/uploads/2026/03/ekran.png";
    const parsed = parseMessageContent(content);

    expect(parsed.text).toBe("Merhaba");
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0]).toMatchObject({
      name: "ekran.png",
      isImage: true
    });
  });

  it("parses legacy filename + upload url blocks without prefix", () => {
    const content = "38c182e6.png\nhttp://127.0.0.1:8080/uploads/2026/03/12/38c182e6.png";
    const parsed = parseMessageContent(content);

    expect(parsed.text).toBe("");
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0]?.name).toBe("38c182e6.png");
    expect(parsed.attachments[0]?.isImage).toBe(true);
  });

  it("parses standalone upload urls as file attachments", () => {
    const content = "https://localhost:8080/uploads/2026/03/logs.zip";
    const parsed = parseMessageContent(content);

    expect(parsed.text).toBe("");
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0]).toMatchObject({
      name: "logs.zip",
      isImage: false
    });
  });

  it("does not classify regular external links as attachments", () => {
    const content = "Kaynak: https://discord.com/channels/@me";
    const parsed = parseMessageContent(content);

    expect(parsed.attachments).toHaveLength(0);
    expect(parsed.text).toContain("https://discord.com/channels/@me");
  });

  it("extracts reply prefix from message body", () => {
    const content = "↪ @friend: Merhaba nasılsın\nAsıl mesaj burada";
    const parsed = parseMessageContent(content);

    expect(parsed.reply).toEqual({
      senderUsername: "friend",
      preview: "Merhaba nasılsın"
    });
    expect(parsed.text).toBe("Asıl mesaj burada");
  });

  it("keeps non-attachment text when multiple attachment blocks exist", () => {
    const content = [
      "Açıklama satırı",
      "",
      "📎 görsel.png",
      "https://localhost:8080/uploads/2026/03/gorsel.png",
      "",
      "📎 rapor.pdf",
      "https://localhost:8080/uploads/2026/03/rapor.pdf",
      "",
      "Son not"
    ].join("\n");

    const parsed = parseMessageContent(content);
    expect(parsed.attachments).toHaveLength(2);
    expect(parsed.text).toBe("Açıklama satırı\n\nSon not");
    expect(parsed.attachments.map((item) => item.name)).toEqual(["görsel.png", "rapor.pdf"]);
  });
});

describe("summarizeMessagePreview", () => {
  it("returns attachment friendly summary instead of raw upload urls", () => {
    const content = "📎 görsel.png\nhttps://localhost:8080/uploads/2026/03/gorsel.png";
    expect(summarizeMessagePreview(content)).toBe("🖼 görsel.png");
  });
});

describe("buildReplyPrefixedMessage", () => {
  it("creates a normalized reply payload", () => {
    const value = buildReplyPrefixedMessage("friend", "Önceki satır\nikinci satır", "Yeni mesaj");
    expect(value).toBe("↪ @friend: Önceki satır ikinci satır\nYeni mesaj");
  });
});
