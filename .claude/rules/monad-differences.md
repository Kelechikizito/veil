# Differences between Monad and Ethereum

Source: https://docs.monad.xyz (full index: https://docs.monad.xyz/llms.txt). This project targets Monad, so these override Ethereum assumptions.

Use Foundry v1.8.0 or later with the Monad execution network enabled, so local development follows Monad's onchain behavior.

## Virtual Machine

1. Max contract code size is 128 KB (Ethereum: 24 KB); max init code size is 256 KB (Ethereum: 48 KB).
2. Some opcodes and precompiles are repriced. See https://docs.monad.xyz/developer-essentials/opcode-pricing
3. Memory expansion is priced linearly, not quadratically, and a transaction can use at most 8 MB of memory. See https://docs.monad.xyz/developer-essentials/opcode-pricing#memory-expansion
4. The `secp256r1` (P256) verification precompile at `0x0100` (EIP-7951) is supported, so WebAuthn/passkey signatures can be verified onchain. See https://docs.monad.xyz/developer-essentials/precompiles#p256-signature-verification

## Storage

Storage slots are grouped into pages of 128 consecutive slots. Slots are warmed per page, not per slot: the first `SLOAD`/`SSTORE` to a page pays the cold cost, and every other slot on that page is warm for the rest of the transaction.

Solidity's default layouts already benefit, because state variables, struct fields and array elements sit in consecutive slots. Layouts that scatter slots across pages aren't penalized; each page just pays its own cold cost.

Gas schedule: https://docs.monad.xyz/developer-essentials/opcode-pricing#storage-pages. Spec: https://mips.monad.xyz/MIPs/MIP-8

## Transactions

1. Gas is charged on gas **limit**, not gas used: the sender pays `value + gas_bid * gas_limit`. This prevents DoS under asynchronous execution. See https://docs.monad.xyz/developer-essentials/gas-pricing
2. Consensus and execution use the Reserve Balance mechanism to ensure every transaction included in consensus can be paid for. It lightly restricts inclusion at consensus time and defines conditions under which a transaction reverts at execution time. See https://docs.monad.xyz/developer-essentials/reserve-balance
3. Because of Reserve Balance, the chain can contain transactions that fail for trying to spend too much MON relative to the account balance. They still pay gas and are valid transactions that revert on execution.
4. Transaction type 3 (EIP-4844 blob transactions) is not supported.
5. There is no global mempool. Transactions are forwarded to the next few leaders. See https://docs.monad.xyz/monad-arch/consensus/local-mempool

## EIP-7702 Delegation

1. A delegated EOA's balance can't go below 10 MON (Reserve Balance rules). Once the delegation is removed, it can. See https://docs.monad.xyz/developer-essentials/eip-7702#delegated-eoas-can%E2%80%99t-dip-below-10-mon
2. When a delegated EOA is called as a smart contract, `CREATE` and `CREATE2` are banned. See https://docs.monad.xyz/developer-essentials/eip-7702#delegated-contract-code-cannot-call-create/create2

## Historical Data

Because of Monad's high throughput, full nodes don't serve arbitrary historic state. See https://docs.monad.xyz/developer-essentials/historical-data

## RPC

See https://docs.monad.xyz/reference/rpc-differences
