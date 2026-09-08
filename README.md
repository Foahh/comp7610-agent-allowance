# Agent Spend Guard

A COMP7610 group project demo where a buyer agent purchases specialist work with a per-conversation allowance enforced by a smart contract.

## Deployment

See the [deployment guide](DEPLOY.md) for deploy the application locally.

[中文部署指南](部署.md) 请看这里.

## Validate

```powershell
vp check
vp run @repo/contracts#build
vp test
vp run -r build
vp exec react-doctor apps/web --verbose --scope changed
```
