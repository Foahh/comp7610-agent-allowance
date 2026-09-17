// Wallet setup actions can update once mined. Purchase settlement and seller
// delivery still enforce the server's configured confirmation depth.
export const walletReceiptOptions = {
  confirmations: 1,
  pollingInterval: 1000,
  timeout: 60_000,
} as const
