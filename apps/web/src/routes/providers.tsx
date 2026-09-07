import { RiArrowLeftLine, RiSearchLine, RiTeamLine } from "@remixicon/react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"

import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card"
import { Input } from "#/components/ui/input"

type Provider = {
  id: string
  name: string
  category: string
  description: string
  services: { id: string; name: string; price: string }[]
}

const providers: Provider[] = [
  {
    id: "exchange-evidence",
    name: "Exchange Evidence",
    category: "Research & writing",
    description:
      "A separate agent interprets the brief, quotes the work, and delivers cited results.",
    services: [
      { id: "analysis", name: "Analysis", price: "0.01" },
      { id: "writing", name: "Recommendation brief", price: "0.005" },
    ],
  },
]

export const Route = createFileRoute("/providers")({ component: ProvidersPage })

function ProvidersPage() {
  const [search, setSearch] = useState("")
  const query = search.trim().toLowerCase()
  const matches = providers.filter((provider) =>
    [
      provider.name,
      provider.category,
      provider.description,
      ...provider.services.map((service) => service.name),
    ]
      .join(" ")
      .toLowerCase()
      .includes(query)
  )

  return (
    <main className="providers-page">
      <header className="providers-header">
        <Link to="/" className="brand">
          <span className="brand-copy">
            <span className="eyebrow">COMP7610</span>
            <strong>Agent Spend</strong>
          </span>
        </Link>
        <Button nativeButton={false} render={<Link to="/" />} variant="outline">
          <RiArrowLeftLine />
          Back to assistant
        </Button>
      </header>
      <section className="providers-content" aria-labelledby="providers-title">
        <div className="providers-intro">
          <p className="eyebrow">Specialist directory</p>
          <h1 id="providers-title">Providers</h1>
          <p>
            Explore the specialists your assistant can hire, and see what they
            offer.
          </p>
        </div>
        <div className="providers-toolbar">
          <div className="provider-search">
            <RiSearchLine aria-hidden="true" />
            <Input
              aria-label="Search providers and services"
              placeholder="Search providers or services…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <p className="text-sm text-muted-foreground" role="status">
            {matches.length} {matches.length === 1 ? "provider" : "providers"}
          </p>
        </div>
        <div className="provider-grid">
          {matches.map((provider) => (
            <ProviderCard key={provider.id} provider={provider} />
          ))}
        </div>
        {matches.length === 0 && (
          <div className="provider-empty">
            <RiSearchLine className="size-6" />
            <h2>No providers found</h2>
            <p>Try another provider name or service.</p>
            <Button variant="outline" onClick={() => setSearch("")}>
              Clear search
            </Button>
          </div>
        )}
      </section>
    </main>
  )
}

function ProviderCard({ provider }: { provider: Provider }) {
  return (
    <Card className="provider-card">
      <CardHeader>
        <div className="mb-4 flex items-center justify-between gap-4">
          <RiTeamLine className="size-6" />
          <Badge variant="secondary">{provider.category}</Badge>
        </div>
        <CardTitle>
          <h2>{provider.name}</h2>
        </CardTitle>
        <CardDescription>{provider.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="eyebrow mb-3">Services</p>
        <dl className="provider-services">
          {provider.services.map((service) => (
            <div key={service.id}>
              <dt>{service.name}</dt>
              <dd>{service.price} ATT</dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 text-sm text-muted-foreground">
          Ask your assistant to use this specialist in a conversation.
        </p>
      </CardContent>
    </Card>
  )
}
