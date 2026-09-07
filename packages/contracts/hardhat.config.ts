import { defineConfig } from "hardhat/config"

export default defineConfig({
  solidity: {
    version: "0.8.30",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    sepolia: {
      type: "http",
      chainType: "l1",
      chainId: 11155111,
      url: process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
    },
  },
})
