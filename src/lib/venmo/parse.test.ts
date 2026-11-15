// Run with: npm test
// Samples are trimmed copies of real Venmo emails (Nov 2026) with the
// footers left out.
import assert from "node:assert/strict";
import { test } from "node:test";
import { gmailConfirmLink, parseGmailConfirmation, parseVenmoEmail } from "./parse.ts";

const at = new Date("2026-11-15T03:46:39Z"); // Nov 14, 10:46 PM in New York

test("payment you sent from your Venmo balance", () => {
  const e = parseVenmoEmail({
    subject: "You paid Teresa Castellon $23.00",
    text: "You paid Teresa Castellon $23.00 | You paid Teresa Castellon $ 23. 00 Grill cover (house maintenance) See transaction[](https://venmo.com/story/1) ## Transaction details### Date Nov 04, 2026### Status Completed ### Transaction ID 2TX03659M32984533### Payment Method Venmo balance ### Sent from @someone | |",
    receivedAt: at,
  });
  assert.deepEqual(e, {
    kind: "payment",
    amount: -23,
    counterparty: "Teresa Castellon",
    memo: "Grill cover (house maintenance)",
    postedOn: "2026-11-04",
    venmoId: "2TX03659M32984533",
  });
});

test("payment you sent from a bank account is left to the bank", () => {
  const e = parseVenmoEmail({
    subject: "You paid Teresa Castellon $17.60",
    text: "You paid Teresa Castellon $ 17. 60 From Ivis See transaction[](https://venmo.com/story/2) ## Transaction details### Date Nov 13, 2026### Status Completed ### Transaction ID 4729601845274402379### Payment Method Jpmorgan Chase Bank account ending in 7682 ### Sent from @someone | |",
    receivedAt: at,
  });
  assert.deepEqual(e, {
    kind: "paid_from_bank",
    amount: -17.6,
    counterparty: "Teresa Castellon",
    fundedBy: "Jpmorgan Chase Bank account ending in 7682",
  });
});

test("someone paid your request (preview text says the wrong name)", () => {
  const e = parseVenmoEmail({
    subject: "Teresa Castellon paid your $49.21 request",
    text: "Sergio Torrez paid you $49.21 | Teresa Castellon paid you $ 49. 21 Shub beauty misc See transaction[](https://venmo.com/story/3) ## Money credited to your Venmo account. ## Transaction details### Date Nov 14, 2026### Transaction ID 4730725481489667326### Sent to @someone | |",
    receivedAt: at,
  });
  assert.equal(e.kind, "payment");
  assert.ok(e.kind === "payment");
  assert.equal(e.amount, 49.21);
  assert.equal(e.counterparty, "Teresa Castellon");
  assert.equal(e.memo, "Shub beauty misc");
  assert.equal(e.postedOn, "2026-11-14");
  assert.equal(e.venmoId, "4730725481489667326");
});

test("someone paid you (preview text says 'You paid')", () => {
  const e = parseVenmoEmail({
    subject: "Teresa Castellon paid $12.22 to your Venmo account. Leave it in Venmo or transfer it to your bank account.",
    text: "You paid Teresa Castellon $12.22 | Teresa Castellon paid you $ 12. 22 Alcohol See transaction[](https://venmo.com/story/4) ## Money credited to your Venmo account. ## Transaction details### Date Nov 14, 2026### Transaction ID 86T47132R1703661A### Sent to @someone | |",
    receivedAt: at,
  });
  assert.ok(e.kind === "payment");
  assert.equal(e.amount, 12.22);
  assert.equal(e.memo, "Alcohol");
  assert.equal(e.venmoId, "86T47132R1703661A");
});

test("a business paid you", () => {
  const e = parseVenmoEmail({
    subject: "ELEVATE paid you $167.50",
    text: "ELEVATE paid you 167.50! | ELEVATE paid you $ 167. 50 Your payment from ELVT Advanced Benefit is in your Venmo Account. [](https://venmo.com/story/5) See transaction[](https://venmo.com/ledger/6) Money credited to your Venmo account. Transaction details | | Date November 10, 2026 | | Transaction ID 4727230397066974967 | | Sent to @someone",
    receivedAt: at,
  });
  assert.ok(e.kind === "payment");
  assert.equal(e.amount, 167.5);
  assert.equal(e.counterparty, "ELEVATE");
  assert.equal(e.postedOn, "2026-11-10");
  assert.equal(e.venmoId, "4727230397066974967");
});

test("standard transfer to the bank", () => {
  const e = parseVenmoEmail({
    subject: "Your Venmo Standard transfer has been initiated",
    text: "Standard Transfer Initiated We successfully issued your transfer | Standard transfer initiated## Initiated on Tuesday, November 10, 2026 ## Transfer Amount $214.98 ## Transfer transaction ID 20738262201 ## Estimated arrival Friday, November 13, 2026## Destination Jpmorgan Chase Bank ····7682 | You can see the status of your bank transfers",
    receivedAt: at,
  });
  assert.deepEqual(e, {
    kind: "transfer",
    amount: -214.98,
    destination: "Jpmorgan Chase Bank",
    postedOn: "2026-11-10",
    venmoId: "20738262201",
  });
});

test("the same emails as HTML", () => {
  const e = parseVenmoEmail({
    subject: "You paid Teresa Castellon $23.00",
    text: "<table><tr><td>You paid Teresa Castellon <b>$</b> 23<span>.</span> 00</td></tr><tr><td>Grill cover &amp; tools</td><td><a href='x'>See transaction</a></td></tr><tr><td><h3>Date</h3> Nov 04, 2026</td></tr><tr><td><h3>Transaction ID</h3> 2TX03659M32984533</td></tr><tr><td><h3>Payment Method</h3> Venmo balance</td></tr><tr><td><h3>Sent from</h3> @someone</td></tr></table>",
    receivedAt: at,
  });
  assert.ok(e.kind === "payment");
  assert.equal(e.amount, -23);
  assert.equal(e.memo, "Grill cover & tools");
  assert.equal(e.venmoId, "2TX03659M32984533");
});

test("emails that move no money are ignored", () => {
  for (const subject of [
    "Teresa Castellon declined your request for $25.50 - Xfinity mobile",
    "Your October 2026 transaction history",
    "Update to Venmo Debit Card international transactions",
    "Teresa Castellon requests $10.00",
  ]) {
    assert.equal(parseVenmoEmail({ subject, text: "Transaction ID 123456789", receivedAt: at }).kind, "ignored", subject);
  }
});

test("Gmail forwarding confirmation code", () => {
  const got = parseGmailConfirmation({
    subject: "(#123456789) Gmail Forwarding Confirmation - Receive Mail from someone@gmail.com",
    text: "someone@gmail.com has requested to automatically forward mail to your email address. Confirmation code: 123456789",
    mailbox: "someone@gmail.com",
  });
  assert.equal(got.code, "123456789");
  assert.equal(got.link, null);
  assert.equal(got.mentionsMailbox, true);
});

test("Gmail forwarding confirmation link only", () => {
  const got = parseGmailConfirmation({
    subject: "(Gmail Forwarding Confirmation - Receive Mail from someone@gmail.com",
    text: "someone@gmail.com has requested to automatically forward mail to your email address venmo@example.com. To allow it, click the link below: https://mail-settings.google.com/mail/vf-%5BANGjdJ_abc%5D-xyz123 If you click the link and it appears to be broken...",
    html: '<a href="https://evil.example.com/mail/vf-x">x</a>',
    mailbox: "someone@gmail.com",
  });
  assert.equal(got.code, null);
  assert.equal(got.link, "https://mail-settings.google.com/mail/vf-%5BANGjdJ_abc%5D-xyz123");
});

test("Gmail confirm links only from Google's own hosts", () => {
  for (const bad of [
    "http://mail-settings.google.com/mail/vf-abc",
    "https://mail-settings.google.com.evil.com/mail/vf-abc",
    "https://evil.com/?u=https://mail-settings.google.com/mail/vf-abc",
    "https://user@mail-settings.google.com/mail/vf-abc",
    "https://mail.google.com/mail/u/0/#inbox",
  ]) {
    assert.equal(gmailConfirmLink(bad), null, bad);
  }
  assert.equal(gmailConfirmLink("https://mail.google.com/mail/vf-abc?x=1&amp;y=2"), "https://mail.google.com/mail/vf-abc?x=1&y=2");
});
