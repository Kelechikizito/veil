# Veil in brief

Veil is payroll on Monad. Employers stream salaries to workers second by second, and workers can prove their income without showing their salary.

## How it works

- **Fund:** the employer moves stablecoins into a payroll vault.
- **Stream:** each worker gets a salary stream that grows every second.
- **Run payroll:** once a period, the employer sets a budget. Each stream gets its share, so pay never outruns the money.
- **Approve:** salaries above a limit need approvers before they start.
- **Withdraw:** workers withdraw whenever they like.
- **Prove income:** a worker gives one landlord an expiring "earns at least $X" credential.
- **Audit:** an auditor chosen by the employer checks the books.

## How it's built

- **Frontend:** Next.js and React, with Privy for sign-in, embedded wallets and gas sponsorship, and viem/wagmi for the chain.
- **Identity:** World ID Selfie Check, so each worker is one unique human.
- **Onchain:** Foundry contracts on Monad for payroll, approvals, the human registry, join requests, audits and income credentials.

## Status

A port of Dayze (an earlier project on Base Sepolia). The contracts and frontend work there. The port has started: everything is renamed to Veil. Nothing runs on Monad yet, and how salaries stay private on Monad is still open (see `CLAUDE.md`).
