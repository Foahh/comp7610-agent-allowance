import { mnemonicToAccount } from "viem/accounts"

// Public Hardhat development mnemonic. These accounts are only for chain 31337.
const developmentMnemonic =
  "test test test test test test test test test test test junk"
const roleIndexes = { owner: 0, buyer: 1, seller: 2, deployer: 1 } as const

export function localAccount(role: keyof typeof roleIndexes, installation = 0) {
  if (!Number.isInteger(installation) || installation < 0 || installation > 5) {
    throw new Error("LOCAL_INSTALLATION must be an integer from 0 to 5.")
  }

  return mnemonicToAccount(developmentMnemonic, {
    addressIndex: installation * 3 + roleIndexes[role],
  })
}
