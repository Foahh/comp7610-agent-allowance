# Deployment guide

## 1. Set up a wallet

Install a browser wallet such as MetaMask, create an account, and switch to **Ethereum Sepolia**.

Copy your wallet address and get free Sepolia ETH from the [Google Cloud faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia).

![Copy the wallet address](assets/image-1.png)

![Get Sepolia ETH](assets/image-2.png)

## 2. Prepare the AI service

Visit the [DeepSeek platform](https://platform.deepseek.com/usage), add credit, and get an API key.

## 3. Get the project

```sh
git clone https://github.com/Foahh/comp7610-agent-allowance
cd comp7610-agent-allowance
```

Open the project folder in your preferred IDE.

## 4. Install dependencies

Follow the [Vite+ installation guide](https://viteplus.dev/guide/), then open a new terminal in the project root:

```sh
vp install
```

## 5. Prepare the smart contracts

If your group already has a deployment JSON from this release, use that file and skip deployment.

Otherwise, copy `.env.contract.example` to `.env.contract`, then run:

```sh
vp run @repo/contracts#build
vp run deploy:sepolia
```

If prompted, send Sepolia ETH to the displayed deployer address and rerun the deployment command. Share the resulting `data/deployment-11155111.json` with your group.

## 6. Start the application

```sh
vp run dev
```

Open the URL printed in the terminal and keep the terminal running. The launcher handles ports and database setup automatically.

Connect your wallet and sign in. Import the deployment JSON, click **Validate network and contracts**, then **Save this deployment**. Participants trading together must use the same contracts.

## 7. Configure DeepSeek

In **Settings**, add your DeepSeek endpoint, model name, and API key. Click **Check connection** and select the buyer's default model.

## 8. Start using the application

Add another participant's complete seller endpoint in **Connected sellers**. Create a chat, claim test ATT when prompted, and authorize a spending budget. Confirm purchases in your wallet.

To sell, click **Authorize seller signer** in Settings, then publish a product in **My listings**.
