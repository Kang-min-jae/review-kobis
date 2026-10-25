// 예고편 채널 판정 — 공식 목록과 이름만 같은 채널(사칭)은, 관리자가 그 이름의 진짜 채널 키를 허용해 두면 걸러진다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeChannel, type ChannelRules } from "../app/_lib/official-channels";

function rules(partial: Partial<ChannelRules> = {}): ChannelRules {
  return { allowed: new Set(), blocked: new Set(), pinnedByName: new Map(), ...partial };
}

test("공식 목록의 이름이면 공식(진짜 채널 키를 아직 모를 때)", () => {
  assert.equal(judgeChannel("Warner Bros. Korea", "@warnerbroskorea", rules()), "official");
});

test("같은 이름의 진짜 채널이 허용돼 있으면 키가 다른 채널은 사칭으로 본다", () => {
  const r = rules({ pinnedByName: new Map([["warnerbroskorea", new Set(["@warnerbroskorea"])]]) });
  assert.equal(judgeChannel("Warner Bros. Korea", "@warnerbroskorea", r), "official");
  assert.equal(judgeChannel("Warner Bros. Korea", "@fake-warner", r), "unverified");
  assert.equal(judgeChannel("Warner Bros. Korea", null, r), "unverified");
});

test("차단이 허용보다 먼저, 허용한 키는 이름과 상관없이 공식", () => {
  assert.equal(judgeChannel("Warner Bros. Korea", "@x", rules({ blocked: new Set(["@x"]) })), "channel-blocked");
  assert.equal(judgeChannel("아무 채널", "@y", rules({ allowed: new Set(["@y"]) })), "official");
  assert.equal(judgeChannel("아무 채널", "@z", rules()), "unverified");
});
