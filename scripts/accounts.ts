import { readConfig, signer } from "@repo/utils/config"

const config = readConfig()

console.log(`Owner browser wallet: ${config.owner}`)

for (const role of ["agent", "seller", "deployer"] as const) {
  console.log(`${role}: ${signer(role).address}`)
}

console.log(
  "Only public addresses are shown. Backend keys are stored encrypted in the local credentials directory."
)
console.log(
  "Fund the agent and deployer with Sepolia ETH; seller delivery does not require gas."
)
