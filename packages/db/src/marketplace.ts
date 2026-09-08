import type {
  Asset,
  Listing,
  SellerConnection,
  StoredModel,
} from "@repo/schemas"

import { and, eq, isNotNull } from "drizzle-orm"

import type { Database } from "./index.ts"

import {
  assets,
  connectedListings,
  installations,
  listingAssets,
  listingHeads,
  listingVersions,
  modelConnections,
  purchaseDestinations,
  purchasedFiles,
  quoteRequests,
  sellerConnections,
  sellerJobs,
  sellerProfiles,
} from "./schema.ts"

export function createListingQueries(db: Database) {
  function getVersion(
    id: string,
    version: number,
    status: Listing["status"] = "draft"
  ): Listing | undefined {
    const row = db
      .select()
      .from(listingVersions)
      .where(
        and(eq(listingVersions.id, id), eq(listingVersions.version, version))
      )
      .get()

    if (!row) {
      return undefined
    }

    const selected = db
      .select()
      .from(listingAssets)
      .where(
        and(eq(listingAssets.listingId, id), eq(listingAssets.version, version))
      )
      .orderBy(listingAssets.position)
      .all()

    return { ...row, status, assetIds: selected.map((asset) => asset.assetId) }
  }

  function get(id: string) {
    const head = db
      .select()
      .from(listingHeads)
      .where(eq(listingHeads.id, id))
      .get()

    if (!head) {
      return undefined
    }

    return getVersion(id, head.version, head.status)
  }

  function save(id: string, listing: Listing) {
    db.transaction(() => {
      const { assetIds, status, ...version } = listing
      const existing = getVersion(id, listing.version)

      // Content versions are insert-only. Status belongs to the mutable head.
      if (!existing) {
        db.insert(listingVersions).values(version).run()

        if (assetIds.length) {
          db.insert(listingAssets)
            .values(
              assetIds.map((assetId, position) => ({
                listingId: id,
                version: listing.version,
                assetId,
                position,
              }))
            )
            .run()
        }
      }

      db.insert(listingHeads)
        .values({ id, version: listing.version, status })
        .onConflictDoUpdate({
          target: listingHeads.id,
          set: { version: listing.version, status },
        })
        .run()
    })
  }

  const published = {
    get(id: string) {
      const head = db
        .select()
        .from(listingHeads)
        .where(eq(listingHeads.id, id))
        .get()

      return head?.publishedVersion
        ? getVersion(id, head.publishedVersion, "active")
        : undefined
    },
    list() {
      return db
        .select()
        .from(listingHeads)
        .where(isNotNull(listingHeads.publishedVersion))
        .all()
        .map((head) => getVersion(head.id, head.publishedVersion!, "active")!)
    },
    save(id: string, listing: Listing) {
      db.update(listingHeads)
        .set({ publishedVersion: listing.version })
        .where(eq(listingHeads.id, id))
        .run()
    },
    remove(id: string) {
      db.update(listingHeads)
        .set({ publishedVersion: null })
        .where(eq(listingHeads.id, id))
        .run()
    },
  }

  return {
    listings: {
      get,
      save,
      list: () =>
        db
          .select()
          .from(listingHeads)
          .all()
          .map((head) => getVersion(head.id, head.version, head.status)!),
    },
    versions: { get: getVersion },
    published,
  }
}

export function createSellerQueries(db: Database) {
  return {
    ...createListingQueries(db),
    models: {
      get(id: string) {
        return db
          .select()
          .from(modelConnections)
          .where(eq(modelConnections.id, id))
          .get()
      },
      list() {
        return db.select().from(modelConnections).all()
      },
      save(id: string, model: StoredModel) {
        db.insert(modelConnections)
          .values({ ...model, id })
          .onConflictDoUpdate({ target: modelConnections.id, set: model })
          .run()
      },
    },
    assets: {
      get(id: string) {
        return db.select().from(assets).where(eq(assets.id, id)).get()
      },
      list() {
        return db.select().from(assets).all()
      },
      save(id: string, asset: Asset) {
        db.insert(assets)
          .values({ ...asset, id })
          .run()
      },
    },
    settings: {
      get(id: string) {
        return db
          .select()
          .from(sellerProfiles)
          .where(eq(sellerProfiles.id, id))
          .get()
      },
      save(
        id: string,
        profile: Omit<typeof sellerProfiles.$inferInsert, "id">
      ) {
        db.insert(sellerProfiles)
          .values({ ...profile, id })
          .onConflictDoUpdate({ target: sellerProfiles.id, set: profile })
          .run()
      },
    },
    requests: {
      get(key: string) {
        return db
          .select()
          .from(quoteRequests)
          .where(eq(quoteRequests.requestKey, key))
          .get()
      },
      save(key: string, request: { id: string; taskHash: string }) {
        db.insert(quoteRequests)
          .values({ ...request, requestKey: key })
          .run()
      },
    },
    jobs: {
      get(id: string) {
        return db.select().from(sellerJobs).where(eq(sellerJobs.id, id)).get()
      },
      list() {
        return db.select().from(sellerJobs).all()
      },
      save(id: string, job: typeof sellerJobs.$inferInsert) {
        db.insert(sellerJobs)
          .values({ ...job, id })
          .onConflictDoUpdate({ target: sellerJobs.id, set: job })
          .run()
      },
    },
  }
}

export function createConnectionQueries(db: Database) {
  function read(row: typeof sellerConnections.$inferSelect): SellerConnection {
    const {
      address,
      name,
      description,
      chainId,
      vault,
      token,
      error,
      ...connection
    } = row
    const catalog = db
      .select()
      .from(connectedListings)
      .where(eq(connectedListings.connectionId, row.id))
      .all()

    return {
      ...connection,
      error: error ?? undefined,
      identity: {
        protocol: "agent-spend/2",
        address,
        name,
        description,
        chainId,
        vault,
        token,
      },
      listings: catalog.map(
        ({ connectionId: _connectionId, ...listing }) => listing
      ),
    }
  }

  return {
    get(id: string) {
      const row = db
        .select()
        .from(sellerConnections)
        .where(eq(sellerConnections.id, id))
        .get()

      if (!row) {
        return undefined
      }

      return read(row)
    },
    list() {
      return db.select().from(sellerConnections).all().map(read)
    },
    save(id: string, connection: SellerConnection) {
      const { identity, listings, error, ...fields } = connection
      const { protocol: _protocol, ...identityFields } = identity
      const row = { ...fields, ...identityFields, id, error: error ?? null }

      db.transaction(() => {
        db.insert(sellerConnections)
          .values(row)
          .onConflictDoUpdate({ target: sellerConnections.id, set: row })
          .run()
        db.delete(connectedListings)
          .where(eq(connectedListings.connectionId, id))
          .run()

        if (listings.length) {
          db.insert(connectedListings)
            .values(
              listings.map((listing) => ({ ...listing, connectionId: id }))
            )
            .run()
        }
      })
    },
    remove(id: string) {
      db.delete(sellerConnections).where(eq(sellerConnections.id, id)).run()
    },
  }
}

export function createBuyerMarketplaceQueries(db: Database) {
  return {
    connections: createConnectionQueries(db),
    destinations: {
      get(id: string) {
        return db
          .select()
          .from(purchaseDestinations)
          .where(eq(purchaseDestinations.id, id))
          .get()
      },
      save(id: string, destination: { endpoint: string }) {
        db.insert(purchaseDestinations)
          .values({ id, ...destination })
          .onConflictDoNothing()
          .run()
      },
    },
    files: {
      get(id: string) {
        return db
          .select()
          .from(purchasedFiles)
          .where(eq(purchasedFiles.id, id))
          .get()
      },
      save(id: string, file: { path: string }) {
        db.insert(purchasedFiles)
          .values({ id, ...file })
          .onConflictDoUpdate({ target: purchasedFiles.id, set: file })
          .run()
      },
    },
  }
}

// Never reconcile an existing journal against another chain deployment or signer.
export function bindInstallation(
  db: Database,
  identity: typeof installations.$inferInsert
) {
  const previous = db
    .select()
    .from(installations)
    .where(eq(installations.role, identity.role))
    .get()

  if (
    previous &&
    (previous.chain !== identity.chain ||
      previous.vault !== identity.vault ||
      previous.signer !== identity.signer)
  ) {
    throw new Error(
      "Database belongs to another deployment or signer. Restore its configuration or choose a fresh data directory."
    )
  }

  db.insert(installations).values(identity).onConflictDoNothing().run()
}
