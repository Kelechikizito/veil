# veil-payroll (Chainlink CRE)

Runs a Veil employer's payroll every pay period. Each tick reads the employer's streams on Monad testnet, picks the Active streams in the payroll token that aren't funded for the current period, and works out what they need for the time left. In production it sends that as a signed report to the employer's `VeilPayrollAutomation` receiver ([`src/VeilPayrollAutomation.sol`](../../src/VeilPayrollAutomation.sol)), which runs payroll through `VeilPayroll.runPayrollFor`, capped by the employer's onchain `maxBudget`.

The schedule `5 */10 * * * *` fires 5 seconds into each 10-minute demo period.

| Target | Config | Writes |
|---|---|---|
| `local-simulation` | `config.local-simulation.json` | Never: returns what it would fund |
| `staging-settings` | `config.staging.json` | With `--broadcast`, through Monad testnet's MockKeystoneForwarder |
| `production-settings` | `config.production.json` | Through the KeystoneForwarder, once deployed |

From `cre/`:

```bash
bun install --cwd ./veil-payroll
cre workflow simulate veil-payroll --target local-simulation --non-interactive --trigger-index 0
```
