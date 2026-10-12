# Setup

Get a local copy running on Linux, macOS, or Windows.

## 1. Install prerequisites

- **Git** and **Node.js 22+**.
- **Foundry v1.8.0+**: run `curl -L https://foundry.paradigm.xyz | bash`, then `foundryup`.
- A **Privy** app and a **World ID** app (Developer Portal) if you need sign-in and the Selfie Check.

**Windows:** run everything inside [WSL2](https://learn.microsoft.com/windows/wsl/install) (Ubuntu), since Foundry has no native Windows support.

## 2. Clone the repo

```bash
git clone --recurse-submodules https://github.com/Kelechikizito/veil.git
cd veil
```

If you already cloned without submodules, run `git submodule update --init --recursive`.

## 3. Configure environment

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env.local
```

Fill in the RPC URLs and the Privy and World ID values. Generate `NULLIFIER_SALT` once with `openssl rand -hex 32` and never change it.

## 4. Build and test contracts

```bash
make install
forge fmt --check && forge build --sizes && forge test -vvv
```

These are the same checks CI runs, so all three must pass before you push. `make help` lists every command.

## 5. Run the app

```bash
cd frontend
npm install
npm run dev
```

The app runs on `http://localhost:3000`.

## 6. Deploy (optional)

Import a deployer key into a Foundry keystore (`cast wallet import <name> --interactive`), then run in your own terminal:

```bash
make deploy-dry
make deploy
make export-abis
```
