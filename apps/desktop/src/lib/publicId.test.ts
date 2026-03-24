import { describe, expect, it } from "vitest";
import { fromPublicID, isNumericID, isUUID, publicIDToUUID, toPublicID, uuidToPublicID } from "./publicId";

describe("publicId codec", () => {
  it("converts UUID to short numeric public id and back", () => {
    const uuid = "9a4b7d1f-0d71-43ea-b136-67c909f85153";
    const publicId = uuidToPublicID(uuid);

    expect(publicId).not.toBeNull();
    expect(publicId).toMatch(/^[0-9]{1,15}$/);
    expect(publicIDToUUID(publicId as string)).toBe(uuid);
    expect(fromPublicID(publicId as string)).toBe(uuid);
  });

  it("generates stable short numeric ids for the same UUID", () => {
    const uuid = "7b44d5d9-209f-445a-809f-60372de6f2d2";
    const first = uuidToPublicID(uuid);
    const second = uuidToPublicID(uuid);
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9]{1,15}$/);
  });

  it("leaves non-uuid ids unchanged when creating or parsing public ids", () => {
    expect(toPublicID("server-1")).toBe("server-1");
    expect(toPublicID("123456789")).toBe("123456789");
    expect(fromPublicID("server-1")).toBe("server-1");
    expect(fromPublicID("123456789")).toBe("123456789");
  });

  it("parses legacy decimal public ids for backward compatibility", () => {
    const uuid = "9a4b7d1f-0d71-43ea-b136-67c909f85153";
    const legacyDecimal = BigInt(`0x${uuid.replace(/-/g, "")}`).toString(10);
    expect(publicIDToUUID(legacyDecimal)).toBe(uuid);
    expect(fromPublicID(legacyDecimal)).toBe(uuid);
  });

  it("exposes helper predicates", () => {
    expect(isUUID("9a4b7d1f-0d71-43ea-b136-67c909f85153")).toBe(true);
    expect(isUUID("not-a-uuid")).toBe(false);
    expect(isNumericID("1234567890")).toBe(true);
    expect(isNumericID("abc123")).toBe(false);
  });
});
