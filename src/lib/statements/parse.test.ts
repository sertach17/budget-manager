// Run with: npm test
// Every sample here is made up, in the layout each bank uses.
import assert from "node:assert/strict";
import { test } from "node:test";
import { categoryCode, mergeStatements, parseStatement, readAmount, readCsv, readDate, statementFingerprints } from "./parse.ts";

test("reads dates and amounts the ways banks write them", () => {
  assert.equal(readDate("11/03/2026"), "2026-11-03");
  assert.equal(readDate("1/5/26"), "2026-01-05");
  assert.equal(readDate("2026-11-03"), "2026-11-03");
  assert.equal(readDate("20261103120000[-5:EST]"), "2026-11-03");
  assert.equal(readDate("02/30/2026"), null);
  assert.equal(readAmount("$1,234.56"), 1234.56);
  assert.equal(readAmount("(12.30)"), -12.3);
  assert.equal(readAmount("-4.5"), -4.5);
  assert.equal(readAmount("abc"), null);
  assert.equal(readAmount(""), null);
});

test("reads quoted CSV cells with commas and quotes inside", () => {
  assert.deepEqual(readCsv('a,"b, c","say ""hi"""\r\n1,2,3\n'), [
    ["a", "b, c", 'say "hi"'],
    ["1", "2", "3"],
  ]);
});

test("Apple Card export: purchases become money out and payments are transfers", () => {
  const csv = [
    '"Transaction Date","Clearing Date","Description","Merchant","Category","Type","Amount (USD)","Purchased By"',
    '"11/02/2026","11/03/2026","CORNER CAFE 123 MAIN ST","Corner Cafe","Restaurants","Purchase","6.75","Sample Person"',
    '"11/04/2026","11/04/2026","FRESH MART #12","Fresh Mart","Grocery","Purchase","82.10","Sample Person"',
    '"11/05/2026","11/05/2026","ACH DEPOSIT INTERNET TRANSFER","Payment","Payment","Payment","-300.00","Sample Person"',
    '"11/06/2026","11/06/2026","RETURN SHOE SHOP","Shoe Shop","Shopping","Credit","-25.00","Sample Person"',
  ].join("\n");
  const s = parseStatement("Apple Card Transactions.csv", csv);
  assert.equal(s.format, "apple-card");
  assert.equal(s.skipped, 0);
  assert.deepEqual(s.rows, [
    { postedOn: "2026-11-02", description: "CORNER CAFE 123 MAIN ST", merchant: "Corner Cafe", amount: -6.75, category: "FOOD_AND_DRINK_RESTAURANT" },
    { postedOn: "2026-11-04", description: "FRESH MART #12", merchant: "Fresh Mart", amount: -82.1, category: "FOOD_AND_DRINK_GROCERIES" },
    { postedOn: "2026-11-05", description: "ACH DEPOSIT INTERNET TRANSFER", merchant: "Payment", amount: 300, category: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT" },
    { postedOn: "2026-11-06", description: "RETURN SHOE SHOP", merchant: "Shoe Shop", amount: 25, category: "GENERAL_MERCHANDISE" },
  ]);
});

test("Chase-style checking CSV keeps its signs", () => {
  const csv = [
    "Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #",
    "DEBIT,11/03/2026,SAMPLE POWER CO,-64.20,ACH_DEBIT,1200.00,",
    "CREDIT,11/01/2026,SAMPLE EMPLOYER PAYROLL,1500.00,ACH_CREDIT,1264.20,",
  ].join("\n");
  const s = parseStatement("Chase_Activity.CSV", csv, { accountType: "checking" });
  assert.equal(s.format, "csv");
  assert.equal(s.flipped, false);
  assert.deepEqual(
    s.rows.map((r) => [r.postedOn, r.description, r.amount]),
    [
      ["2026-11-03", "SAMPLE POWER CO", -64.2],
      ["2026-11-01", "SAMPLE EMPLOYER PAYROLL", 1500],
    ],
  );
});

test("a card CSV with purchases as positive numbers is flipped, and you can turn that off", () => {
  const csv = ["Date,Description,Amount", "11/03/2026,BOOK STORE,19.99", "11/04/2026,SNACK BAR,3.50", "11/09/2026,PAYMENT THANK YOU,-50.00"].join("\n");
  const guessed = parseStatement("card.csv", csv, { accountType: "credit" });
  assert.equal(guessed.flipped, true);
  assert.deepEqual(guessed.rows.map((r) => r.amount), [-19.99, -3.5, 50]);
  const asIs = parseStatement("card.csv", csv, { accountType: "credit", flip: false });
  assert.deepEqual(asIs.rows.map((r) => r.amount), [19.99, 3.5, -50]);
});

test("separate debit and credit columns, with lines above the header", () => {
  const csv = [
    "Account statement",
    "Exported 11/10/2026",
    "Date,Payee,Withdrawals,Deposits",
    '11/02/2026,SAMPLE HARDWARE,"1,020.00",',
    "11/03/2026,REFUND SAMPLE,,12.00",
    "not a row,,,",
  ].join("\n");
  const s = parseStatement("export.csv", csv);
  assert.deepEqual(s.rows.map((r) => [r.description, r.amount]), [
    ["SAMPLE HARDWARE", -1020],
    ["REFUND SAMPLE", 12],
  ]);
  assert.equal(s.skipped, 1);
});

test("a CSV with no header row, like some Wells Fargo downloads", () => {
  const csv = ['"11/03/2026","-42.17","*","","SAMPLE GAS STATION 55"', '"11/04/2026","800.00","*","","SAMPLE DEPOSIT"'].join("\n");
  const s = parseStatement("Checking1.csv", csv, { accountType: "checking" });
  assert.deepEqual(s.rows.map((r) => [r.postedOn, r.description, r.amount]), [
    ["2026-11-03", "SAMPLE GAS STATION 55", -42.17],
    ["2026-11-04", "SAMPLE DEPOSIT", 800],
  ]);
});

test("OFX and QFX files keep their own signs", () => {
  const ofx = `OFXHEADER:100
DATA:OFXSGML
<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261102120000[-5:EST]<TRNAMT>-15.25<FITID>1<NAME>SAMPLE PIZZA &amp; CO<MEMO>card 1</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261105<TRNAMT>200.00<FITID>2<NAME>PAYMENT THANK YOU</STMTTRN>
<STMTTRN><TRNTYPE>INT<DTPOSTED>20261106<TRNAMT>-3.10<FITID>3<NAME>INTEREST CHARGE</STMTTRN>
</BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;
  const s = parseStatement("statement.qfx", ofx);
  assert.equal(s.format, "ofx");
  assert.deepEqual(s.rows.map((r) => [r.postedOn, r.description, r.amount, r.category]), [
    ["2026-11-02", "SAMPLE PIZZA & CO", -15.25, null],
    ["2026-11-05", "PAYMENT THANK YOU", 200, null],
    ["2026-11-06", "INTEREST CHARGE", -3.1, "BANK_FEES_INTEREST_CHARGE"],
  ]);
});

test("files that aren't statements say so", () => {
  assert.throws(() => parseStatement("notes.csv", "hello,world\nfoo,bar"), /doesn't look like a statement/);
  assert.throws(() => parseStatement("empty.csv", "Date,Description,Amount\n"), /No transactions/);
});

test("bank category words become bank-style codes", () => {
  assert.equal(categoryCode("Food & Drink"), "FOOD_AND_DRINK_RESTAURANT");
  assert.equal(categoryCode("Bills & Utilities"), "RENT_AND_UTILITIES");
  assert.equal(categoryCode("Gas"), "TRANSPORTATION_GAS");
  assert.equal(categoryCode("Barber"), null);
  assert.equal(categoryCode("Other"), null);
});

test("fingerprints match across overlapping files and tell same-day twins apart", () => {
  const coffee = { postedOn: "2026-11-02", amount: -4.5, description: "Corner Cafe #1" };
  const a = statementFingerprints("acc", [coffee, coffee, { ...coffee, postedOn: "2026-11-03" }]);
  assert.equal(a[0], "upload:acc:2026-11-02:-4.50:corner cafe 1");
  assert.equal(a[1], "upload:acc:2026-11-02:-4.50:corner cafe 1:2");
  assert.notEqual(a[0], a[2]);
  const b = statementFingerprints("acc", [coffee, coffee]);
  assert.deepEqual(b, a.slice(0, 2));
  // A screenshot shows the merchant name the export also has.
  const fromExport = { postedOn: "2026-11-02", amount: -4.5, description: "CORNER CAFE 21 ELM ST", merchant: "Corner Cafe" };
  const fromScreenshot = { postedOn: "2026-11-02", amount: -4.5, description: "Corner Cafe", merchant: "Corner Cafe" };
  assert.deepEqual(statementFingerprints("acc", [fromExport]), statementFingerprints("acc", [fromScreenshot]));
});

test("files that overlap keep each transaction once, but twins in one file stay", () => {
  const coffee = { postedOn: "2026-11-10", amount: -4.5, description: "COFFEE", merchant: "Coffee", category: null };
  const lunch = { postedOn: "2026-11-11", amount: -12, description: "LUNCH", merchant: "Lunch", category: null };
  const gas = { postedOn: "2026-11-12", amount: -40, description: "GAS", merchant: "Gas", category: null };
  const first = [coffee, coffee, lunch];
  const second = [lunch, coffee, gas];
  const merged = mergeStatements("acc", [first, second]);
  assert.deepEqual(merged.rows, [coffee, coffee, lunch, gas]);
  assert.equal(merged.overlap, 2);
});
