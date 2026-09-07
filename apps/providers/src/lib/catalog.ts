import type { ServiceOffer } from "@repo/schemas"

export const catalog: ServiceOffer[] = [
  {
    id: "analysis",
    name: "City evidence analysis",
    description:
      "Compare the specialist's labeled accommodation and transport synthetic dataset, with row references.",
    amount: "10000",
  },
  {
    id: "writing",
    name: "Recommendation brief",
    description:
      "Turn supplied evidence into a tailored recommendation with retained citations.",
    amount: "5000",
  },
]

export const dataset = {
  version: "exchange-cities-synthetic-v1",
  notice:
    "Synthetic teaching dataset, not current accommodation prices or travel advice. All monthly amounts are illustrative USD.",
  rows: [
    {
      id: "TOK-01",
      city: "Tokyo",
      accommodation: 900,
      transport: 80,
      note: "Extensive urban transport; highest modeled cost.",
    },
    {
      id: "SEL-01",
      city: "Seoul",
      accommodation: 650,
      transport: 55,
      note: "Middle modeled cost; campus housing availability not modeled.",
    },
    {
      id: "TPE-01",
      city: "Taipei",
      accommodation: 500,
      transport: 40,
      note: "Lowest modeled cost; tuition and food excluded.",
    },
  ],
}

export const writingTemplate = {
  sections: ["Recommendation", "Supporting evidence", "Limitations"],
  rule: "Retain supplied references; do not invent facts or sources.",
}
