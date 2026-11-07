import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decodeCallback,
  decodePickChat,
  encodeCallback,
  encodePickChat,
  groupCountOptions,
  groupSizeOptions,
  hasCustomGroupCount,
  hasCustomGroupSize,
} from "./spin.keyboard.js";
import { chunkLines, formatResult } from "./spin.message.js";
import { isValidConfig, shuffle, splitIntoTeams } from "./spin.service.js";
import type { Member } from "./spin.types.js";

function makeMembers(count: number): Member[] {
  return Array.from({ length: count }, (_, index) => ({ id: String(index + 1), name: `User ${index + 1}` }));
}

describe("shuffle", () => {
  it("keeps every item exactly once", () => {
    const items = Array.from({ length: 50 }, (_, index) => index);
    const result = shuffle(items);
    assert.equal(result.length, items.length);
    assert.deepEqual([...result].sort((a, b) => a - b), items);
  });

  it("does not mutate the input", () => {
    const items = [1, 2, 3, 4];
    shuffle(items);
    assert.deepEqual(items, [1, 2, 3, 4]);
  });
});

describe("splitIntoTeams", () => {
  it("splits evenly with no leftovers", () => {
    const { teams, leftovers } = splitIntoTeams(makeMembers(20), 4, 5);
    assert.equal(teams.length, 4);
    teams.forEach((team) => assert.equal(team.length, 5));
    assert.equal(leftovers.length, 0);
  });

  it("puts extra members into leftovers", () => {
    const { teams, leftovers } = splitIntoTeams(makeMembers(23), 4, 5);
    assert.equal(teams.flat().length, 20);
    assert.equal(leftovers.length, 3);
  });

  it("never duplicates a member", () => {
    const { teams, leftovers } = splitIntoTeams(makeMembers(31), 5, 6);
    const ids = [...teams.flat(), ...leftovers].map((member) => member.id);
    assert.equal(new Set(ids).size, 31);
  });

  it("rejects configs that need more members than available", () => {
    assert.throws(() => splitIntoTeams(makeMembers(5), 3, 2));
    assert.throws(() => splitIntoTeams(makeMembers(5), 1, 2));
    assert.throws(() => splitIntoTeams(makeMembers(5), 2, 0));
  });

  it("validates configs", () => {
    assert.equal(isValidConfig(6, 3, 2), true);
    assert.equal(isValidConfig(6, 4, 2), false);
    assert.equal(isValidConfig(6, 2.5, 2), false);
  });
});

describe("keyboard options", () => {
  it("adjusts group count buttons to small chats", () => {
    assert.deepEqual(groupCountOptions(1), []);
    assert.deepEqual(groupCountOptions(2), [2]);
    assert.deepEqual(groupCountOptions(4), [2, 3, 4]);
    assert.deepEqual(groupCountOptions(6), [2, 3, 4, 5, 6]);
    assert.deepEqual(groupCountOptions(23), [2, 3, 4, 5, 6, 7, 8]);
    assert.equal(hasCustomGroupCount(8), false);
    assert.equal(hasCustomGroupCount(9), true);
  });

  it("adjusts members per group buttons to what fits", () => {
    assert.deepEqual(groupSizeOptions(6, 2), [1, 2, 3]);
    assert.deepEqual(groupSizeOptions(6, 3), [1, 2]);
    assert.deepEqual(groupSizeOptions(6, 4), [1]);
    assert.deepEqual(groupSizeOptions(5, 2), [1, 2]);
    assert.deepEqual(groupSizeOptions(100, 2), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(hasCustomGroupSize(100, 2), true);
    assert.equal(hasCustomGroupSize(16, 2), false);
  });

  it("round-trips callback data", () => {
    const data = encodeCallback({ wheelId: 2147483647, action: "tc", value: 8 });
    assert.ok(data.length <= 64);
    assert.deepEqual(decodeCallback(data), { wheelId: 2147483647, action: "tc", value: 8 });
    assert.deepEqual(decodeCallback("w:1:j"), { wheelId: 1, action: "j", value: undefined });
    assert.deepEqual(decodeCallback("w:1:start"), { wheelId: 1, action: "start", value: undefined });
    assert.equal(decodeCallback("w:1:nope"), null);
    assert.equal(decodeCallback("x:1:go"), null);
  });

  it("round-trips chat picker data", () => {
    assert.equal(decodePickChat(encodePickChat(-1001234567890)), -1001234567890);
    assert.equal(decodePickChat("p:abc"), null);
    assert.equal(decodePickChat("w:1:go"), null);
  });
});

describe("formatResult", () => {
  it("escapes names and lists leftovers", () => {
    const members: Member[] = [
      { id: "1", name: "A <b>", username: "alpha" },
      { id: "2", name: "B & C" },
      { id: "3", name: "D" },
    ];
    const [text] = formatResult({ teams: [[members[0] as Member], [members[1] as Member]], leftovers: [members[2] as Member] }, "Chat");
    assert.ok(text?.includes("A &lt;b&gt; (@alpha)"));
    assert.ok(text?.includes("B &amp; C"));
    assert.ok(text?.includes("<b>Not picked</b>"));
  });

  it("splits long results into several messages", () => {
    const chunks = chunkLines(Array.from({ length: 100 }, () => "x".repeat(50)), 1000);
    assert.ok(chunks.length > 1);
    chunks.forEach((chunk) => assert.ok(chunk.length <= 1000));
  });
});
