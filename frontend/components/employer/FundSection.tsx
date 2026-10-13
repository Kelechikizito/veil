"use client";

import { useState } from "react";
import { maxUint256 } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { Field, Input, Panel, PillPicker, Stat } from "@/components/forms";
import { TxLinks, TxStatus } from "@/components/TxStatus";
import { Button } from "@/components/ui";
import { useVeil } from "@/hooks/useVeil";
import { useTx } from "@/hooks/useTx";
import { DemoTokenAbi, VeilPayrollAbi } from "@/lib/contracts/abis";
import { clearTxLog } from "@/lib/txLog";
import { formatAmount, parseAmount, type TokenInfo, type TokenKey } from "@/lib/tokens";

/** Whether the connected employer has money in any vault */
export function useHasFundedVault() {
  const { account, d, tokens } = useVeil();
  const { data } = useReadContracts({
    contracts: tokens.map((t) => ({
      address: d?.payroll,
      abi: VeilPayrollAbi,
      functionName: "vaultOf" as const,
      args: [account!, t.address] as const,
    })),
    query: { enabled: !!account && !!d },
  });
  return (data ?? []).some((r) => r.status === "success" && (r.result as bigint) > BigInt(0));
}

/** §2 Fund: one amount, one button. Minting test money, approving and funding run behind it. */
export function FundSection() {
  const { tokens } = useVeil();
  const [key, setKey] = useState<TokenKey>(tokens[0]?.key ?? "usdc");
  const token = tokens.find((t) => t.key === key) ?? tokens[0];
  if (!token) return null;

  return (
    <Panel
      title="Payroll vault"
      help="Add money to pay salaries from. Each payroll run sets this period's pay aside from here."
      aside={
        tokens.length > 1 && (
          <PillPicker options={tokens.map((t) => ({ value: t.key, label: t.symbol }))} value={token.key} onChange={setKey} />
        )
      }
    >
      <TokenFunding key={token.key} token={token} />
    </Panel>
  );
}

function TokenFunding({ token }: { token: TokenInfo }) {
  const { account, d } = useVeil();
  const tx = useTx("fund");
  const [amount, setAmount] = useState("");
  const [progress, setProgress] = useState<string>();

  const balance = useReadContract({
    address: token.address,
    abi: DemoTokenAbi,
    functionName: "balanceOf",
    args: account ? [account] : undefined,
    query: { enabled: !!account },
  });
  const allowance = useReadContract({
    address: token.address,
    abi: DemoTokenAbi,
    functionName: "allowance",
    args: account && d ? [account, d.payroll] : undefined,
    query: { enabled: !!account && !!d },
  });
  const vault = useReadContract({
    address: d?.payroll,
    abi: VeilPayrollAbi,
    functionName: "vaultOf",
    args: account ? [account, token.address] : undefined,
    query: { enabled: !!account && !!d },
  });

  const parsed = safeParse(amount, token.decimals);
  const shortfall = parsed !== undefined && balance.data !== undefined && parsed > balance.data ? parsed - balance.data : BigInt(0);

  /** Mint (testnet) → approve → fund, each only if needed, one click */
  const addFunds = async () => {
    if (!parsed || !d || !account) return;
    const steps: { label: string; run: () => Promise<unknown> }[] = [];

    if (shortfall > BigInt(0)) {
      steps.push({
        label: `Getting test ${token.symbol}`,
        run: () =>
          tx.run(() => ({ address: token.address, abi: DemoTokenAbi, functionName: "mint", args: [account, shortfall] }), {
            keepOpen: true,
            label: `Got test ${token.symbol}`,
          }),
      });
    }
    if ((allowance.data ?? BigInt(0)) < parsed) {
      steps.push({
        label: `Letting payroll take ${token.symbol}`,
        run: () =>
          tx.run(() => ({ address: token.address, abi: DemoTokenAbi, functionName: "approve", args: [d.payroll, maxUint256] }), {
            keepOpen: true,
            label: `Approved ${token.symbol}`,
          }),
      });
    }
    steps.push({
      label: "Moving it into your vault",
      run: () =>
        tx.run(() => ({ address: d.payroll, abi: VeilPayrollAbi, functionName: "fundVault", args: [token.address, parsed] }), {
          label: "Moved it into the vault",
        }),
    });

    clearTxLog(account, "fund");
    for (const [i, step] of steps.entries()) {
      setProgress(`Step ${i + 1} of ${steps.length}: ${step.label}…`);
      if (!(await step.run())) {
        setProgress(undefined);
        return;
      }
    }
    setProgress(`✓ Added ${formatAmount(parsed, token.decimals)} ${token.symbol} to your payroll vault.`);
    setAmount("");
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Stat label="Payroll vault">
          {vault.data === undefined ? "…" : `${formatAmount(vault.data, token.decimals)} ${token.symbol}`}
        </Stat>
        <Stat label="In your wallet">
          {balance.data === undefined ? "…" : `${formatAmount(balance.data, token.decimals)} ${token.symbol}`}
        </Stat>
      </div>

      <form
        className="flex flex-col gap-4 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void addFunds();
        }}
      >
        <div className="flex-1">
          <Field
            label={`Amount (${token.symbol})`}
            hint={
              shortfall > BigInt(0)
                ? `Testnet: the missing ${formatAmount(shortfall, token.decimals)} ${token.symbol} is minted for you.`
                : undefined
            }
          >
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5000" />
          </Field>
        </div>
        <Button type="submit" disabled={!parsed || tx.busy}>
          Add to payroll
        </Button>
      </form>

      {progress && <p className="text-caption">{progress}</p>}
      <TxStatus stage={tx.stage} error={tx.error} txHash={tx.hash} />
      {!tx.busy && <TxLinks scope="fund" />}
    </div>
  );
}

/** Parses a typed amount, or undefined if it's empty, invalid or zero */
function safeParse(value: string, decimals: number): bigint | undefined {
  try {
    const v = parseAmount(value, decimals);
    return v > BigInt(0) ? v : undefined;
  } catch {
    return undefined;
  }
}
