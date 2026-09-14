# Mandate

A COMP7610 group project where participants buy and sell digital items and AI services. An AI assistant makes purchases using a conversation allowance enforced by a smart contract on Ethereum Sepolia.

## Deployment

See the [deployment guide](DEPLOY.md) to run the application locally.

中文请看[部署指南](部署.md)。

## Validate

```powershell
vp check
vp run @repo/contracts#build
vp test
vp run -r build
vp exec react-doctor apps/web --verbose --scope changed
```

Tests create their own temporary local chain and accounts. The application uses Sepolia.
