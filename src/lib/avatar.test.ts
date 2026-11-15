import { describe, expect, test } from "vitest";
import { initialsOf, safeAvatarUrl } from "@/lib/avatar";

describe("safeAvatarUrl", () => {
  test("takes avatar_url from the sign-in metadata", () => {
    expect(safeAvatarUrl({ avatar_url: "https://lh3.googleusercontent.com/a/x=s96-c" })).toBe("https://lh3.googleusercontent.com/a/x=s96-c");
  });
  test("falls back to picture", () => {
    expect(safeAvatarUrl({ picture: "https://example.com/p.png" })).toBe("https://example.com/p.png");
  });
  test.each([
    ["javascript:alert(1)"], ["http://insecure.example/p.png"], ["data:image/png;base64,AAAA"], ["//cdn.example/p.png"], [""], [42], [null],
  ])("rejects %s", (value) => {
    expect(safeAvatarUrl({ avatar_url: value })).toBeNull();
  });
  test("no metadata means no photo", () => {
    expect(safeAvatarUrl(undefined)).toBeNull();
    expect(safeAvatarUrl({})).toBeNull();
  });
});

describe("initialsOf", () => {
  test("first letters of the first two words, uppercased", () => expect(initialsOf("los pepros")).toBe("LP"));
  test("one word gives one letter", () => expect(initialsOf("Pepros")).toBe("P"));
  test("empty falls back to a neutral mark", () => expect(initialsOf("  ")).toBe("?"));
  test("keeps accented letters", () => expect(initialsOf("Álvaro Born")).toBe("ÁB"));
});
