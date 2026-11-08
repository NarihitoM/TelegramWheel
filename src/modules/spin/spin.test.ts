import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decodeCallback,
  decodePickChat,
  decodeManage,
  encodeCallback,
  encodePickChat,
  encodeManage,
  groupCountOptions,
  groupSizeOptions,
  hasCustomGroupCount,
  hasCustomGroupSize,
  hasCustomWinnerCount,
  manageKeyboard,
  managePageCount,
  winnerCountOptions,
} from "./spin.keyboard.js";
import { toVisualOrder } from "./spin.fonts.js";
import { buildSegments, estimateLines } from "./spin.image.js";
import {
  chunkLines,
  describeManagers,
  describeSplit,
  formatResult,
  formatSummary,
  formatWinners,
  MAX_TEXT_MESSAGES,
  toPlainText,
} from "./spin.message.js";
import { flipCoin, isValidConfig, pickWinners, shuffle, splitIntoTeams } from "./spin.service.js";
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
  it("splits evenly with no extra group", () => {
    const { teams } = splitIntoTeams(makeMembers(20), 4, 5);
    assert.equal(teams.length, 4);
    teams.forEach((team) => assert.equal(team.length, 5));
  });

  it("puts remaining members into an extra group", () => {
    const { teams } = splitIntoTeams(makeMembers(7), 3, 2);
    assert.deepEqual(
      teams.map((team) => team.length),
      [2, 2, 2, 1],
    );
  });

  it("never duplicates or drops a member", () => {
    const { teams } = splitIntoTeams(makeMembers(31), 5, 6);
    const ids = teams.flat().map((member) => member.id);
    assert.equal(ids.length, 31);
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
    assert.deepEqual(decodeCallback("w:1:coin"), { wheelId: 1, action: "coin", value: undefined });
    assert.deepEqual(decodeCallback("w:1:wc:3"), { wheelId: 1, action: "wc", value: 3 });
    assert.equal(decodeCallback("w:1:nope"), null);
    assert.equal(decodeCallback("x:1:go"), null);
  });

  it("round-trips chat picker data", () => {
    assert.equal(decodePickChat(encodePickChat(-1001234567890)), -1001234567890);
    assert.equal(decodePickChat("p:abc"), null);
    assert.equal(decodePickChat("w:1:go"), null);
  });
});

describe("add and remove list", () => {
  it("round-trips list buttons within the 64 byte limit", () => {
    const pick = { wheelId: 2147483647, kind: "pick", mode: "remove", userId: 9999999999, page: 12 } as const;
    assert.ok(encodeManage(pick).length <= 64);
    assert.deepEqual(decodeManage(encodeManage(pick)), pick);
    const add = { wheelId: 5, kind: "pick", mode: "add", userId: 42, page: 0 } as const;
    assert.deepEqual(decodeManage(encodeManage(add)), add);
    const page = { wheelId: 3, kind: "page", mode: "add", page: 1 } as const;
    assert.deepEqual(decodeManage(encodeManage(page)), page);
    assert.deepEqual(decodeManage(encodeManage({ wheelId: 3, kind: "back" })), { wheelId: 3, kind: "back" });
    assert.equal(decodeManage("r:abc:b"), null);
    assert.equal(decodeManage("w:1:x:2:0"), null);
  });

  it("pages the list and switches between add and remove", () => {
    assert.equal(managePageCount(0), 1);
    assert.equal(managePageCount(8), 1);
    assert.equal(managePageCount(9), 2);
    const labels = manageKeyboard(1, "remove", makeMembers(10), 1).inline_keyboard.flat().map((button) => button.text);
    assert.deepEqual(labels, ["Remove User 9", "Remove User 10", "Previous", "Add people", "Back"]);
    const addLabels = manageKeyboard(1, "add", makeMembers(1), 0).inline_keyboard.flat().map((button) => button.text);
    assert.deepEqual(addLabels, ["Add User 1", "Remove people", "Back"]);
  });
});

describe("pick a winner", () => {
  it("picks distinct winners from the members", () => {
    const winners = pickWinners(makeMembers(10), 3);
    assert.equal(winners.length, 3);
    assert.equal(new Set(winners.map((member) => member.id)).size, 3);
  });

  it("rejects winner counts that do not fit", () => {
    assert.throws(() => pickWinners(makeMembers(5), 0));
    assert.throws(() => pickWinners(makeMembers(5), 5));
  });

  it("offers winner counts below the member count", () => {
    assert.deepEqual(winnerCountOptions(2), [1]);
    assert.deepEqual(winnerCountOptions(4), [1, 2, 3]);
    assert.deepEqual(winnerCountOptions(50), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(hasCustomWinnerCount(9), false);
    assert.equal(hasCustomWinnerCount(10), true);
  });

  it("formats winners with singular and plural wording", () => {
    const [one] = formatWinners(makeMembers(1), "Chat", 5);
    assert.ok(one?.startsWith("<b>Winner</b>"));
    assert.ok(one?.includes("1 winner picked from 5 members."));
    const [many] = formatWinners(makeMembers(2), "Chat", 5);
    assert.ok(many?.includes("2 winners picked from 5 members."));
  });
});

describe("flipCoin", () => {
  it("returns heads or tails", () => {
    assert.equal(flipCoin(() => 0), "Heads");
    assert.equal(flipCoin(() => 1), "Tails");
  });
});

describe("formatResult", () => {
  it("escapes names and lists every group with totals", () => {
    const members: Member[] = [
      { id: "1", name: "A <b>", username: "alpha" },
      { id: "2", name: "B & C" },
      { id: "3", name: "D" },
    ];
    const teams = [[members[0] as Member], [members[1] as Member], [members[2] as Member]];
    const [text] = formatResult({ teams }, "Chat", 2, 1);
    assert.ok(text?.includes("A &lt;b&gt; (@alpha)"));
    assert.ok(text?.includes("B &amp; C"));
    assert.ok(text?.includes("<b>Group 3</b>"));
    assert.ok(text?.includes("Total groups: 3 | Total members: 3"));
  });

  it("splits long results into several messages", () => {
    const chunks = chunkLines(Array.from({ length: 100 }, () => "x".repeat(50)), 1000);
    assert.ok(chunks.length > 1);
    chunks.forEach((chunk) => assert.ok(chunk.length <= 1000));
  });
});

describe("toVisualOrder", () => {
  it("moves the e vowel and medial ra before the consonant", () => {
    assert.equal(toVisualOrder("\u1019\u1031\u102C"), "\u1031\u1019\u102C");
    assert.equal(toVisualOrder("\u1000\u103B\u1031\u102C\u103A"), "\u1031\u1000\u103B\u102C\u103A");
    assert.equal(toVisualOrder("\u1000\u103C\u100A\u103A"), "\u103C\u1000\u100A\u103A");
  });

  it("leaves other text unchanged", () => {
    assert.equal(toVisualOrder("Aung Thanlwin Oo"), "Aung Thanlwin Oo");
    assert.equal(toVisualOrder("\u{1D4DD}\u{1D4EA}"), "\u{1D4DD}\u{1D4EA}");
  });
});

describe("describeSplit", () => {
  it("uses clear wording with singular and plural", () => {
    assert.equal(describeSplit(8, 1, 8), "8 groups, each with 1 member");
    assert.equal(describeSplit(2, 5, 10), "2 groups, each with 5 members");
    assert.equal(describeSplit(3, 2, 7), "3 groups, each with 2 members, plus 1 extra group with 1 member");
  });
});

describe("describeManagers", () => {
  const owner = { id: "1", name: "Narihito", role: "Owner" } as const;
  const admin = { id: "2", name: "Aung", role: "Admin" } as const;

  it("puts the role in front of each name", () => {
    assert.equal(describeManagers({ id: "9", name: "Mya" }, []), "Starter Mya");
    assert.equal(describeManagers({ id: "9", name: "Mya" }, [admin, owner]), "Starter Mya, Owner Narihito or Admin Aung");
  });

  it("uses the chat role when the starter is the owner or an admin", () => {
    assert.equal(describeManagers({ id: "1", name: "Narihito" }, [owner, admin]), "Owner Narihito or Admin Aung");
    assert.equal(describeManagers({ id: "2", name: "Aung" }, [owner, admin]), "Admin Aung or Owner Narihito");
  });

  it("caps long admin lists", () => {
    const admins = ["A", "B", "C", "D", "E", "F"].map((name, index) => ({ id: String(index + 10), name, role: "Admin" as const }));
    assert.equal(
      describeManagers({ id: "9", name: "Mya" }, admins),
      "Starter Mya, Admin A, Admin B, Admin C, Admin D or 2 other admins",
    );
  });
});

describe("estimateLines", () => {
  it("wraps long names onto more lines, up to 3", () => {
    assert.equal(estimateLines("1. R _", 226), 1);
    assert.equal(estimateLines("1. Oakar Min Htin {Riae_}", 226), 2);
    assert.equal(estimateLines("1. " + "x".repeat(500), 226), 3);
  });
});

describe("buildSegments", () => {
  it("keeps small groups on one card", () => {
    const segments = buildSegments([makeMembers(5), makeMembers(3)]);
    assert.equal(segments.length, 2);
    assert.deepEqual(
      segments.map((segment) => [segment.groupNumber, segment.continued, segment.firstNumber]),
      [
        [1, false, 1],
        [2, false, 1],
      ],
    );
  });

  it("continues large groups on extra cards with running numbers", () => {
    const segments = buildSegments([makeMembers(70)]);
    assert.deepEqual(
      segments.map((segment) => [segment.continued, segment.firstNumber, segment.members.length]),
      [
        [false, 1, 30],
        [true, 31, 30],
        [true, 61, 10],
      ],
    );
  });
});

describe("large text results", () => {
  it("builds a summary and a plain text file", () => {
    const result = splitIntoTeams(makeMembers(3000), 10, 300);
    const chunks = formatResult(result, "Big <Chat>", 10, 300);
    assert.ok(chunks.length > MAX_TEXT_MESSAGES);
    assert.ok(formatSummary(result, "Big <Chat>", 10, 300).includes("Total members: 3000"));
    const text = toPlainText(chunks);
    assert.ok(text.includes("Big <Chat>"));
    assert.ok(!text.includes("<b>"));
  });
});
