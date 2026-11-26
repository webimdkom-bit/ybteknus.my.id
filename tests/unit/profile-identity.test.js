import { describe, expect, it } from "vitest";
import { profileAvatarContent, profileInitials, profilePhotoUrl, profileRoleLabel } from "../../src/features/users/profile-identity.js";

describe("profile identity", () => {
  it("uses role labels from product language", () => {
    expect(profileRoleLabel({ role: "owner" })).toBe("Owner");
    expect(profileRoleLabel({ role: "admin" })).toBe("Admin");
    expect(profileRoleLabel({ role: "employee" })).toBe("Staf");
    expect(profileRoleLabel({})).toBe("Staf");
  });

  it("builds initials and rejects unsafe photo URLs", () => {
    expect(profileInitials("Putri Laras")).toBe("PL");
    expect(profilePhotoUrl({ photoURL: "javascript:alert(1)" })).toBe("");
    expect(profilePhotoUrl({ photoURL: "https://res.cloudinary.com/demo/image/upload/a.jpg" })).toBe("https://res.cloudinary.com/demo/image/upload/a.jpg");
  });

  it("renders an image when photo exists and initials otherwise", () => {
    expect(profileAvatarContent({ displayName: "Putri", photoURL: "https://res.cloudinary.com/demo/a.jpg" })).toContain("<img");
    expect(profileAvatarContent({ displayName: "Putri Laras" })).toBe("PL");
  });
});
