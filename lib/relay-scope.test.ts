import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { ConfigError } from "./errors";
import { isAllowedTelegramChat, isAllowedVkPeer } from "./relay-scope";

const ENV_KEYS = ["TG_CHAT_ID", "VK_CHAT_ID"] as const;

function saveEnv(): Record<string, string | undefined> {
  const snap: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) snap[k] = process.env[k];
  return snap;
}

function restoreEnv(snap: Record<string, string | undefined>): void {
  for (const k of ENV_KEYS) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  }
}

describe("isAllowedTelegramChat", () => {
  let snap: Record<string, string | undefined>;

  beforeEach(() => {
    snap = saveEnv();
    process.env.TG_CHAT_ID = "-1003928282103";
  });

  afterEach(() => restoreEnv(snap));

  it("allows configured chat_id as number", () => {
    assert.equal(isAllowedTelegramChat(-1003928282103), true);
  });

  it("allows configured chat_id as string", () => {
    assert.equal(isAllowedTelegramChat("-1003928282103"), true);
  });

  it("trims whitespace on incoming chat_id", () => {
    assert.equal(isAllowedTelegramChat(" -1003928282103 "), true);
  });

  it("rejects another chat_id", () => {
    assert.equal(isAllowedTelegramChat(-1001111111111), false);
  });

  it("rejects null and undefined", () => {
    assert.equal(isAllowedTelegramChat(null), false);
    assert.equal(isAllowedTelegramChat(undefined), false);
  });

  it("uses trimmed TG_CHAT_ID from env", () => {
    process.env.TG_CHAT_ID = "  -1003928282103  ";
    assert.equal(isAllowedTelegramChat(-1003928282103), true);
  });

  it("throws ConfigError when TG_CHAT_ID is missing", () => {
    delete process.env.TG_CHAT_ID;
    assert.throws(() => isAllowedTelegramChat(-1003928282103), ConfigError);
  });
});

describe("isAllowedVkPeer", () => {
  let snap: Record<string, string | undefined>;

  beforeEach(() => {
    snap = saveEnv();
    process.env.VK_CHAT_ID = "2000000051";
  });

  afterEach(() => restoreEnv(snap));

  it("allows configured peer_id as number", () => {
    assert.equal(isAllowedVkPeer(2000000051), true);
  });

  it("allows configured peer_id as string", () => {
    assert.equal(isAllowedVkPeer("2000000051"), true);
  });

  it("rejects another peer_id", () => {
    assert.equal(isAllowedVkPeer(2000000001), false);
  });

  it("rejects null and undefined", () => {
    assert.equal(isAllowedVkPeer(null), false);
    assert.equal(isAllowedVkPeer(undefined), false);
  });

  it("throws ConfigError when VK_CHAT_ID is missing", () => {
    delete process.env.VK_CHAT_ID;
    assert.throws(() => isAllowedVkPeer(2000000051), ConfigError);
  });
});
