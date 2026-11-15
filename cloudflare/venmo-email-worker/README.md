# Venmo email worker

Venmo isn't connected through Plaid. Its emails are forwarded to the app:

1. **Gmail** forwards emails from `venmo@venmo.com` to `venmo@torrezhq.com`
   (a filter with "Forward it to"). Gmail first sends a confirmation code to
   the new address; it appears on the app's Banks page under Venmo.
2. **Cloudflare Email Routing** on torrezhq.com receives mail for
   `venmo@torrezhq.com` and sends it to this worker (`worker.js`).
3. **The worker** posts the raw email to
   `https://budget.torrezhq.com/api/venmo/inbound`.
4. **The app** checks the email's DKIM signature (it must really come from
   venmo.com and be addressed to your own mailbox), reads the amount, and adds
   the transaction to the Venmo account once, by Venmo's transaction ID.

What changes the Venmo balance:

| Email | Effect |
| --- | --- |
| You paid someone from your Venmo balance | Money out |
| You paid someone from a bank or card | Skipped: the bank already shows it |
| Someone paid you, or paid your request | Money in |
| Standard or Instant transfer to your bank | Money out |
| Requests, declines, monthly history, offers | Nothing |

Venmo debit card purchases may not send an email. If the balance drifts from
the Venmo app, use **Correct balance** on the Banks page.
