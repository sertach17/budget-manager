// Checks the DKIM gate with a test key (no real DNS): a properly signed
// email passes, a tampered or wrongly addressed one doesn't.
// Run with: npm test
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import { dkimSign } from "mailauth/lib/dkim/sign";
import { verifiedSenderDomain } from "./verify.ts";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const pub = publicKey.export({ type: "spki", format: "der" }).toString("base64");
const resolver = async (name: string, type: string) => {
  if (type === "TXT" && name === "test._domainkey.venmo.com") return [[`v=DKIM1; k=rsa; p=${pub}`]];
  const error = Object.assign(new Error("not found"), { code: "ENOTFOUND" });
  throw error;
};

const message = (from: string) =>
  [
    `From: Venmo <${from}>`,
    "To: someone@gmail.com",
    "Subject: You paid Teresa Castellon $23.00",
    "Date: Wed, 04 Nov 2026 14:30:43 +0000",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "You paid Teresa Castellon $23.00",
    "",
  ].join("\r\n");

async function sign(raw: string, domain = "venmo.com") {
  const signed = await dkimSign(raw, {
    signatureData: [{ signingDomain: domain, selector: "test", privateKey: pem, canonicalization: "relaxed/relaxed" }],
  });
  return Buffer.from(signed.signatures + raw);
}

test("signed Venmo email passes", async () => {
  const r = await verifiedSenderDomain(await sign(message("venmo@venmo.com")), resolver);
  assert.equal(r.domain, "venmo.com");
  assert.equal(r.signedTo, true);
});

test("changed amount fails", async () => {
  const original = (await sign(message("venmo@venmo.com"))).toString();
  const signed = original.replace(/\$23\.00\r\n$/, "$923.00\r\n");
  assert.notEqual(signed, original);
  const r = await verifiedSenderDomain(Buffer.from(signed), resolver);
  assert.equal(r.domain, null);
});

test("unsigned email claiming to be Venmo fails", async () => {
  const r = await verifiedSenderDomain(Buffer.from(message("venmo@venmo.com")), resolver);
  assert.equal(r.domain, null);
});

test("signature from another domain doesn't count", async () => {
  const r = await verifiedSenderDomain(await sign(message("venmo@venmo.com"), "evil.example"), resolver);
  assert.equal(r.domain, null);
});
