import {
  RiChat3Line,
  RiStore2Line,
  RiPriceTag3Line,
  RiBookShelfLine,
  RiReceiptLine,
  RiSettings3Line,
} from "@remixicon/react"

export const marketplaceNavigation = [
  { to: "/", label: "Assistant", icon: RiChat3Line },
  { to: "/sellers", label: "Sellers", icon: RiStore2Line },
  { to: "/listings", label: "My listings", icon: RiPriceTag3Line },
  { to: "/library", label: "Library", icon: RiBookShelfLine },
  { to: "/orders", label: "Orders", icon: RiReceiptLine },
  { to: "/settings", label: "Settings", icon: RiSettings3Line },
] as const
