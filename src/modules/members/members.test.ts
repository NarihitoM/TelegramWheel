import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCachedMembers } from "./members.service.js";

describe("parseCachedMembers", () => {
  it("reads members saved in the cache", () => {
    const members = [
      { id: "1", name: "Narihito", username: "narihito" },
      { id: "2", name: "Mya" },
    ];
    assert.deepEqual(parseCachedMembers(JSON.stringify(members)), members);
  });

  it("ignores broken or unexpected cache values", () => {
    assert.equal(parseCachedMembers("not json"), null);
    assert.equal(parseCachedMembers(JSON.stringify({ id: "1" })), null);
    assert.equal(parseCachedMembers(JSON.stringify([{ id: 1, name: "Mya" }])), null);
    assert.equal(parseCachedMembers(JSON.stringify([{ id: "1", name: "Mya", username: 5 }])), null);
  });
});
