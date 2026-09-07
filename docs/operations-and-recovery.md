# Operations and recovery

The buyer saves the exact signed transaction, nonce, and hash before broadcasting. Signer submissions are serialized. Startup reconciles pending transactions. An uncertain outcome blocks another charge and reuses the same signed bytes on retry.

Use **Refresh pending purchases** after an interrupted connection. Confirmed purchases resume or retrieve the same provider job. Completed and explicitly failed deliveries are retained.

Default files are `data/buyer-<chainId>.sqlite` and `data/provider-<chainId>.sqlite`; override them with `DATABASE_PATH` and `PROVIDER_DATABASE_PATH`. Wallet sessions expire and are owner-scoped. Browser mutations require the configured origin.

Keep one buyer process per agent signer and database. Run contract tests separately from interactive purchases against shared local accounts.

Application restarts preserve data. The contracts run on Sepolia independently of the local application. Existing purchase history may contain results from earlier versions; start a new conversation when validating live-model behavior.

Fresh databases are initialized at startup and by `vp run db:init` using `packages/db/src/schema.sql`. Drizzle table definitions live in `packages/db/src/schema.ts`; keep both definitions aligned. There is no migration or compatibility layer. When changing the schema, stop the services, delete the buyer/provider SQLite files and their `-wal`/`-shm` companions, then restart. This discards local history and sessions.

Quotes, purchases, deliveries, and delivery references are stored in relational columns and tables. Token amounts remain decimal text to preserve uint256 precision. Payment journal updates and delivery reference replacements are transactional; unresolved purchases are selected by their indexed payment status.
