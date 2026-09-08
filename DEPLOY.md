# Deployment guide

## 1. Set up a wallet

Install a browser wallet such as MetaMask, create an account, and switch to **Ethereum Sepolia**.

Copy your wallet address and get free Sepolia ETH from the [Google Cloud faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia).

![Copy the wallet address](assets/image-1.png)

![Get Sepolia ETH](assets/image-2.png)

## 2. Prepare the AI service

Visit the [DeepSeek platform](https://platform.deepseek.com/usage), add credit, and get an API key. You will enter it in the application later.

## 3. Get the project

```sh
git clone https://github.com/Foahh/comp7610-agent-allowance
cd comp7610-agent-allowance
```

Open the project folder in your preferred IDE.

## 4. Configure environment variables

Copy `.env.example` to `.env` and set `OWNER_ADDRESS` to your browser-wallet address. Keep the other defaults for now.

```dotenv
OWNER_ADDRESS=0x...
```

If your group already has shared contracts, fill in `TOKEN_ADDRESS` and `VAULT_ADDRESS` too.

## 5. Install dependencies

Follow the [Vite+ installation guide](https://viteplus.dev/guide/), then open a new terminal in the project root:

```sh
vp install
vp run accounts
```

The application generates backend keys locally and displays their public addresses. Send Sepolia ETH to the `agent` and `deployer` addresses. No private keys need to be entered in `.env`.

## 6. Deploy the smart contracts

```sh
vp run @repo/contracts#build
vp run deploy:sepolia
```

Addresses are saved to `data/deployment-11155111.json`. Skip deployment if you configured shared contracts; participants trading together must use the same contracts.

## 7. Start the application

```sh
vp run db:init
vp run dev
```

Open `http://localhost:3000`. Keep the terminal running. For later sessions, just run `vp run dev`.

## 8. Start using the application

Connect the wallet configured in `OWNER_ADDRESS` and sign in.

In **Settings**, add your DeepSeek endpoint, model name, and API key. Click **Check connection** and select the buyer's default model.

Publish a product in **My listings**, or add another participant's API URL in **Connected sellers**. In **Chat**, select sellers, claim test ATT when prompted, and authorize a spending allowance to start buying.
