import type {
  PublicListing,
  Purchase,
  SellerConnection,
  SignedQuote,
} from "@repo/schemas"

import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { formatUnits } from "viem"

import { useWorkspaceAssistant } from "#/components/assistant-context"
import { RequestState, TextField } from "#/components/marketplace-page"
import { PurchaseCard } from "#/components/purchase-card"
import { Button } from "#/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "#/components/ui/card"
import { Field, FieldLabel } from "#/components/ui/field"
import { NativeSelect, NativeSelectOption } from "#/components/ui/native-select"
import { useMarketplaceAction } from "#/hooks/use-marketplace"
import { createConversation } from "#/lib/client"
import { marketplaceRequest, formText } from "#/lib/marketplace"

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
    <Card className="my-6">
      <CardHeader>
        <CardTitle>{listing.name}</CardTitle>
        <CardDescription>
          {seller.identity.name} · {listing.type} · version {listing.version}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <p>{listing.description}</p>
        {listing.preview && (
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">
            {listing.preview}
          </p>
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
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            quote.mutate(new FormData(event.currentTarget))
          }}
          onChange={resetQuote}
        >
          <Field>
            <FieldLabel htmlFor="purchase-conversation">
              Conversation and allowance
            </FieldLabel>
            <NativeSelect
              id="purchase-conversation"
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
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              disabled={quote.isPending || purchase.isPending}
            >
              Request quote
            </Button>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </form>
        <RequestState
          pending={quote.isPending || purchase.isPending}
          error={quote.error || purchase.error}
        />
        {quote.data?.clarification && (
          <div role="status" className="flex flex-col gap-2">
            <p>{quote.data.clarification}</p>
            <Link to="/" onClick={() => assistant.select(conversationId)}>
              Open chat and manage this conversation’s allowance
            </Link>
          </div>
        )}
        {quote.data?.offer && !result && (
          <div className="flex flex-col gap-3">
            <p>{quote.data.offer.deliverable}</p>
            <p className="text-sm text-muted-foreground">
              Payment happens before delivery. Gas is paid separately by the
              buyer agent.
            </p>
            <Button
              disabled={purchase.isPending}
              onClick={() => purchase.mutate(quote.data!.offer!)}
            >
              Pay {formatUnits(BigInt(quote.data.offer.quote.amount), 6)} ATT
            </Button>
            <Button variant="ghost" onClick={resetQuote}>
              Discard quote and request another
            </Button>
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
      </CardContent>
    </Card>
  )
}
