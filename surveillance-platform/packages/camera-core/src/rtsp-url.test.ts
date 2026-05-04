import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRtspUrl, redactRtspUrl, RtspUrlError } from "./rtsp-url.js";

test("parses rtsp url with credentials", () => {
  const parsed = parseRtspUrl("rtsp://admin:secret@10.0.0.5:554/Streaming/Channels/101");
  assert.equal(parsed.protocol, "rtsp");
  assert.equal(parsed.username, "admin");
  assert.equal(parsed.password, "secret");
  assert.equal(parsed.host, "10.0.0.5");
  assert.equal(parsed.port, 554);
  assert.equal(parsed.path, "/Streaming/Channels/101");
});

test("defaults port for rtsps", () => {
  const parsed = parseRtspUrl("rtsps://10.0.0.5/cam");
  assert.equal(parsed.protocol, "rtsps");
  assert.equal(parsed.port, 322);
});

test("rejects non-rtsp scheme", () => {
  assert.throws(() => parseRtspUrl("http://example.com"), RtspUrlError);
});

test("redacts password", () => {
  const redacted = redactRtspUrl("rtsp://admin:secret@10.0.0.5:554/cam");
  assert.equal(redacted, "rtsp://admin:***@10.0.0.5:554/cam");
});
