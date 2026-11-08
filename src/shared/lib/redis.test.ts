import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toRestConnection } from "./redis.js";

describe("toRestConnection", () => {
  it("turns an Upstash Redis URL into a REST endpoint and token", () => {
    assert.deepEqual(toRestConnection("rediss://default:AbC123%3D@fancy-cat-12345.upstash.io:6379"), {
      url: "https://fancy-cat-12345.upstash.io",
      token: "AbC123=",
    });
  });

  it("rejects URLs without a password or with another protocol", () => {
    assert.equal(toRestConnection("rediss://fancy-cat-12345.upstash.io:6379"), null);
    assert.equal(toRestConnection("https://default:token@fancy-cat-12345.upstash.io"), null);
    assert.equal(toRestConnection("not a url"), null);
  });
});
