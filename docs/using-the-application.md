# Using the application

Connect and sign the one-time wallet challenge. Conversation is available before funding; purchases require an active allowance.

Authorize **5 ATT total**, **2 ATT per purchase**, valid for 24 hours. The UI presents token approval followed by allowance creation. If the wallet needs ATT, the faucet supplies 100 ATT per claim. Gas is paid separately in test ETH.

Example request:

> Compare Tokyo, Seoul, and Taipei for an exchange semester, then prepare a recommendation brief. Spend at most 5 ATT, with a maximum of 2 ATT per purchase.

The model chooses useful services, asks for clarification when necessary, and can purchase within the wallet-confirmed allowance. Analysis and writing can be purchased independently. Writing requires supporting evidence, which can be supplied by the user or a purchased analysis.

Purchase cards show the provider, deliverable, amount, payment status, delivery status, and receipt. Saved results are available for follow-up messages. The **Budget limit** preset provides a 1 ATT allowance example; the 1.2 ATT analysis exceeds that cap.

Use **Stop future spending** to revoke an allowance, then **Withdraw unused ATT**. Revocation takes effect when mined and does not reverse earlier payments. Changing limits requires revoking the old allowance and creating another.

A real delivery failure remains visible after confirmed payment. The application does not simulate failures, automatically refund payments, or purchase a replacement.

Sepolia verification waits for two confirmations and local verification waits for one. This is a demonstration confirmation policy, not a finality guarantee. Sepolia receipts link to the transaction and show gas separately from ATT.
