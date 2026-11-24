// Run with: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { deviceLabel, isPushEndpoint, readSubscription, reviewAlert } from "./message.ts";

const p256dh = "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM";

test("only real push services are accepted", () => {
  assert.equal(isPushEndpoint("https://web.push.apple.com/QGuQyavXutnMH"), true);
  assert.equal(isPushEndpoint("https://fcm.googleapis.com/fcm/send/abc"), true);
  assert.equal(isPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc"), true);
  assert.equal(isPushEndpoint("https://wns2-bl2p.notify.windows.com/w/?token=abc"), true);
  assert.equal(isPushEndpoint("http://web.push.apple.com/x"), false);
  assert.equal(isPushEndpoint("https://web.push.apple.com.evil.example/x"), false);
  assert.equal(isPushEndpoint("https://web.push.apple.com:8443/x"), false);
  assert.equal(isPushEndpoint("https://user@web.push.apple.com/x"), false);
  assert.equal(isPushEndpoint("https://169.254.169.254/latest"), false);
  assert.equal(isPushEndpoint(42), false);
});

test("a browser's subscription is read, and bad ones are refused", () => {
  const good = { endpoint: "https://web.push.apple.com/abc", keys: { p256dh, auth: "tBHItJI5svbpez7KI4CCXg" } };
  assert.deepEqual(readSubscription(good), good);
  assert.equal(readSubscription({ ...good, endpoint: "https://example.com/x" }), null);
  assert.equal(readSubscription({ ...good, keys: { p256dh, auth: "x" } }), null);
  assert.equal(readSubscription({ ...good, keys: { p256dh: "not base64!", auth: "tBHItJI5svbpez7KI4CCXg" } }), null);
  assert.equal(readSubscription(null), null);
});

test("the alert gives only counts", () => {
  assert.equal(reviewAlert(1, 1).body, "1 new transaction to review.");
  assert.equal(reviewAlert(3, 3).body, "3 new transactions to review.");
  assert.equal(reviewAlert(2, 7).body, "2 new transactions to review. 7 are waiting in all.");
  assert.equal(reviewAlert(1, 1).url, "/");
  assert.equal(reviewAlert(2, 7).badge, 7);
});

test("devices get a plain label", () => {
  assert.equal(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X)"), "iPhone");
  assert.equal(deviceLabel(null), "Browser");
});
