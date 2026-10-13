# Veil in brief

Veil is payroll on Monad. Employers stream salaries to workers second by second, and workers can prove their income without showing their salary.

## How it works

- **Fund:** the employer moves stablecoins into a payroll vault.
- **Stream:** each worker gets a salary stream, paid to a one-time address, that grows every second.
- **Run payroll:** once a period, the employer sets a budget. Each stream gets its share, so pay never outruns the money.
- **Approve:** salaries above a limit need approvers before they start.
- **Withdraw:** workers withdraw whenever they like, to any address, without paying gas.
- **Prove income:** a worker gives one landlord an expiring "earns at least $X" credential.
- **Audit:** an auditor chosen by the employer checks the books.

## How it's built

- **Frontend:** Next.js and React, with Privy for sign-in, embedded wallets and gas sponsorship, and viem/wagmi for the chain.
- **Identity:** the employer vouches for each worker, and the worker confirms with a passkey (Face ID, fingerprint or PIN), checked onchain. A landlord sees "verified employee of Acme".
- **Onchain:** Foundry contracts on Monad for payroll, approvals, the employee and stealth registries, join requests, audits and income credentials.

## Status

A port of Dayze (an earlier project on Base Sepolia, built on FHE). FHE doesn't run on Monad, so amounts are public. Privacy comes from stealth payees: each salary goes to a one-time address only the worker can link to themselves, and they withdraw gas-free through a relayer. A ZK income credential is next.
