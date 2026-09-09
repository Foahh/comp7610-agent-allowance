import type {
  PublicListing,
  Purchase,
  SellerConnection,
  SignedQuote,
} from "@repo/schemas"

import { Link } from "@tanstack/react-router"
import { useId, useState } from "react"
import { formatUnits } from "viem"

import { useWorkspaceAssistant } from "#/components/assistant-context"
import { SheetActions } from "#/components/editor-sheet"
import { RequestState, TextField } from "#/components/marketplace-page"
import { PurchaseCard } from "#/components/purchase-card"
import { Button } from "#/components/ui/button"
import { Field, FieldLabel, FieldGroup } from "#/components/ui/field"
import { NativeSelect, NativeSelectOption } from "#/components/ui/native-select"
import { useMarketplaceAction } from "#/hooks/use-marketplace"
import { createConversation } from "#/lib/client"
import { marketplaceRequest, formText } from "#/lib/marketplace"
import { listingTypeLabel } from "#/lib/presentation"

type QuoteResult = {
  offer?: SignedQuote
  purchase?: Purchase
  clarification?: string
}

export function ListingPurchase({
  seller,
  listing,
  onClose,
}: {
  seller: SellerConnection
  listing: PublicListing
  onClose: () => void
}) {
  const formId = useId()
  const assistant = useWorkspaceAssistant()
  const [conversationId, setConversationId] = useState(assistant.selected || "")
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const quote = useMarketplaceAction(async (form: FormData) => {
    let id = conversationId

    if (!id) {
      id = (await createConversation(listing.name, "success")).id
      setConversationId(id)
    }
    assistant.select(id)

    return marketplaceRequest<QuoteResult>(`conversations/${id}/quotes`, {
      service: listing.id,
      version: listing.version,
      sellerId: seller.id,
      requestId,
      brief: formText(form, "brief"),
      evidence: formText(form, "evidence"),
    })
  })
  const purchase = useMarketplaceAction((offer: SignedQuote) =>
    marketplaceRequest<Purchase>(`conversations/${conversationId}/purchases`, {
      quoteId: offer.id,
    })
  )
  const result = purchase.data || quote.data?.purchase
  function resetQuote() {
    quote.reset()
    purchase.reset()
    setRequestId(crypto.randomUUID())
  }

  return (
    <div className="editor-content flex flex-col gap-5">
      <p className="text-xs text-muted-foreground">
        {seller.identity.name} · {listingTypeLabel(listing.type)} · v
        {listing.version}
      </p>
      <p>{listing.description}</p>
      {listing.preview && (
        <details className="detail-disclosure">
          <summary>Preview</summary>
          <p className="whitespace-pre-wrap">{listing.preview}</p>
        </details>
      )}
      <dl className="receipt">
        <dt>Deliverable</dt>
        <dd>{listing.deliverable}</dd>
        <dt>Scope</dt>
        <dd>{listing.scope || "One copy"}</dd>
        <dt>Price</dt>
        <dd>{formatUnits(BigInt(listing.amount), 6)} ATT</dd>
        <dt>Seller</dt>
        <dd>{seller.identity.address}</dd>
      </dl>
      <form
        id={formId}
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          quote.mutate(new FormData(event.currentTarget))
        }}
        onChange={resetQuote}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`${formId}-conversation`}>
              Conversation and allowance
            </FieldLabel>
            <NativeSelect
              id={`${formId}-conversation`}
              value={conversationId}
              onChange={(event) => setConversationId(event.target.value)}
            >
              <NativeSelectOption value="">
                Create a new conversation
              </NativeSelectOption>
              {assistant.conversations.map((conversation) => (
                <NativeSelectOption
                  key={conversation.id}
                  value={conversation.id}
                >
                  {conversation.title}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          {listing.type === "ai-service" && (
            <>
              <p className="text-sm text-muted-foreground">
                Required inputs: {listing.requiredInputs}
              </p>
              <TextField label="Your request" name="brief" multiline />
              <TextField
                label="Supporting evidence"
                name="evidence"
                multiline
              />
            </>
          )}
        </FieldGroup>
      </form>
      <RequestState error={quote.error || purchase.error} />
      <QuoteActions
        formId={formId}
        offer={quote.data?.offer}
        result={result}
        requesting={quote.isPending}
        purchasing={purchase.isPending}
        onPurchase={(offer) => purchase.mutate(offer)}
        onReset={resetQuote}
        onClose={onClose}
      />
      {quote.data?.clarification && (
        <div role="status" className="flex flex-col gap-2">
          <p>{quote.data.clarification}</p>
          <Link to="/" onClick={() => assistant.select(conversationId)}>
            Manage allowance
          </Link>
        </div>
      )}
      {quote.data?.offer && !result && (
        <div className="flex flex-col gap-3">
          <p>{quote.data.offer.deliverable}</p>
          <p className="text-sm text-muted-foreground">
            Payment precedes delivery. Gas is separate from the ATT price.
          </p>
        </div>
      )}
      {result && (
        <>
          <PurchaseCard
            purchase={result}
            chainId={assistant.config?.chainId || 11155111}
          />
          <Link to="/" onClick={() => assistant.select(conversationId)}>
            Continue in chat
          </Link>
        </>
      )}
    </div>
  )
}

function QuoteActions({
  formId,
  offer,
  result,
  requesting,
  purchasing,
  onPurchase,
  onReset,
  onClose,
}: {
  formId: string
  offer?: SignedQuote
  result?: Purchase
  requesting: boolean
  purchasing: boolean
  onPurchase: (offer: SignedQuote) => void
  onReset: () => void
  onClose: () => void
}) {
  return (
    <SheetActions>
      {!offer && !result && (
        <Button form={formId} type="submit" disabled={requesting || purchasing}>
          {requesting ? "Requesting…" : "Request quote"}
        </Button>
      )}
      {offer && !result && (
        <>
          <Button disabled={purchasing} onClick={() => onPurchase(offer!)}>
            {purchasing
              ? "Purchasing…"
              : `Pay ${formatUnits(BigInt(offer.quote.amount), 6)} ATT`}
          </Button>
          <Button variant="ghost" disabled={purchasing} onClick={onReset}>
            Discard quote
          </Button>
        </>
      )}
      <Button variant="outline" onClick={onClose}>
        Close
      </Button>
    </SheetActions>
  )
}
