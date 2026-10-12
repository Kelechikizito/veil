---
name: verify
description: Run the same checks as CI (forge fmt --check, forge build --sizes, forge test -vvv) and report failures. Use before declaring a Solidity change done or before committing.
---

Run these from the repo root, in order, and stop at the first failure:

1. `forge fmt --check` — on failure, run `forge fmt` to fix, then re-check.
2. `forge build --sizes` — report any contract near or over Monad's 128 KB runtime size limit (forge's "margin" column assumes Ethereum's 24 KB — ignore negative margins below 128 KB).
3. `forge test -vvv` — on failure, show the failing test name and revert reason.

If $ARGUMENTS is given, treat it as a test name pattern and run `forge test --mt $ARGUMENTS -vvv` for step 3.

Finish with a short pass/fail line for each step. Don't claim success unless all three passed.
