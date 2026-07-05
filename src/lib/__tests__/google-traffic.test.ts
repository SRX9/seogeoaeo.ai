import { describe, expect, it } from "vitest";
import { filterGscSites } from "@/lib/integrations/google-traffic";

describe("filterGscSites", () => {
  it("keeps only sites the user can read", () => {
    const sites = filterGscSites([
      { siteUrl: "https://a.com/", permissionLevel: "siteOwner" },
      { siteUrl: "https://b.com/", permissionLevel: "siteFullUser" },
      { siteUrl: "https://c.com/", permissionLevel: "siteUnverifiedUser" },
      { siteUrl: "sc-domain:d.com", permissionLevel: "siteRestrictedUser" },
    ]);
    expect(sites.map((s) => s.siteUrl)).toEqual([
      "https://a.com/",
      "https://b.com/",
      "sc-domain:d.com",
    ]);
  });

  it("drops entries missing a url or permission and tolerates undefined", () => {
    expect(filterGscSites(undefined)).toEqual([]);
    expect(
      filterGscSites([
        { siteUrl: "https://a.com/" },
        { permissionLevel: "siteOwner" },
        { siteUrl: "", permissionLevel: "siteOwner" },
      ]),
    ).toEqual([]);
  });
});
