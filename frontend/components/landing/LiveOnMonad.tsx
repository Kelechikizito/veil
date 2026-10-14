"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui";
import { defaultChain } from "@/lib/chains";

/*
 * "Live on Monad": real numbers and the latest salaries, read from the contract through /api/stats.
 * It shows the point of Veil with live data: every amount is public, and a private salary's payee is a one-time
 * address nobody can link to the worker. Streams to a worker's own wallet are labelled as not private.
 */

type Stats = {
  streams: number;
  scanned: number;
  active: number;
  pending: number;
  employers: number;
  monthlyStreaming: string;
  token: string;
  latest: {
    id: string;
    employer: { address: string; name: string | null };
    paidTo: string;
    private: boolean;
    monthly: string;
    status: "pending" | "active" | "cancelled" | "none";
  }[];
};

type Result = { ok: true; stats: Stats } | { ok: false; code: string };

const explorer = defaultChain.blockExplorers.default.url;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const money = (v: string) => Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 });

const pill: Record<Stats["latest"][number]["status"], [string, string]> = {
  active: ["Active", "bg-carbon text-paper-white"],
  pending: ["Needs approval", "bg-lavender"],
  cancelled: ["Cancelled", "bg-soft-mist"],
  none: ["—", "bg-soft-mist"],
};

async function load(): Promise<Result> {
  const res = await fetch("/api/stats");
  const body = await res.json();
  return res.ok ? { ok: true, stats: body } : { ok: false, code: body.error ?? "rpc_error" };
}

export function LiveOnMonad() {
  const q = useQuery({ queryKey: ["veil-stats"], queryFn: load, refetchInterval: 15_000 });
  const s = q.data?.ok ? q.data.stats : undefined;

  // "…" while loading; 0 before deploy or when the chain can't be read
  const blank = q.isLoading ? "…" : "0";
  const tiles: [string, string, string][] = [
    ["Salaries", s ? String(s.streams) : blank, "bg-lavender"],
    ["Streaming now", s ? String(s.active) : blank, "bg-mint-pop"],
    ["Employers", s ? String(s.employers) : blank, "bg-sunburst"],
    ["USDC a month", s ? money(s.monthlyStreaming) : blank, "bg-electric-blue"],
  ];

  return (
    <section id="live" className="relative overflow-hidden bg-sky-wash py-20 md:py-28">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-10 px-4 md:px-10">
        <div className="flex max-w-4xl flex-col gap-6">
          <Badge ghost>Live on {defaultChain.name}</Badge>
          <h2 className="display-type text-[38px] sm:text-[52px] md:text-display-70">Every salary, in the open</h2>
          <p className="max-w-2xl text-subheading">
            Read from the contract as you look at it. Every amount is public by design. Private salaries go to
            one-time addresses, so nobody can tell whose pay is whose.
          </p>
        </div>

        <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {tiles.map(([label, value, fill]) => (
            <li key={label} className={`flex flex-col gap-2 rounded-cards border border-carbon p-5 ${fill}`}>
              <span className="label-type text-caption uppercase">{label}</span>
              <span className="display-type text-[40px] md:text-display-70">{value}</span>
            </li>
          ))}
        </ul>

        <div className="overflow-hidden rounded-cards-elevated border border-carbon bg-paper-white">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-carbon px-6 py-4">
            <h3 className="font-bold">Latest salaries</h3>
            <span className="text-caption text-carbon/55">
              {s && s.scanned < s.streams ? `Totals from the latest ${s.scanned}` : "Refreshes every 15 seconds"}
            </span>
          </div>
          {q.isLoading ? (
            <p className="px-6 py-8 font-mono text-caption">Reading Monad…</p>
          ) : !q.data?.ok ? (
            <p className="px-6 py-8 text-carbon/70">
              {q.data?.code === "not_deployed"
                ? "Veil isn't deployed yet. Salaries show up here as soon as it is."
                : "Couldn't reach Monad just now. It'll try again in a moment."}
            </p>
          ) : s!.latest.length === 0 ? (
            <p className="px-6 py-8 text-carbon/70">No salaries yet. The first one will show up here.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-caption">
                <thead>
                  <tr className="text-carbon/55">
                    {["Salary", "Employer", "Paid to", "Monthly", "Status"].map((h) => (
                      <th key={h} className="label-type px-6 py-3 uppercase">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s!.latest.map((r) => (
                    <tr key={r.id} className="border-t border-carbon/15">
                      <td className="px-6 py-3 font-mono">#{r.id}</td>
                      <td className="px-6 py-3">
                        <span className="font-bold">{r.employer.name ?? short(r.employer.address)}</span>
                      </td>
                      <td className="px-6 py-3">
                        <span className="flex flex-col gap-0.5">
                          <a
                            href={`${explorer}/address/${r.paidTo}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono underline underline-offset-4"
                            title={
                              r.private
                                ? "A one-time address. Only the worker's app knows it's theirs."
                                : "The worker's own wallet: they hadn't turned on private pay, so this salary is linked to them."
                            }
                          >
                            {short(r.paidTo)} ↗
                          </a>
                          <span className="text-carbon/55">{r.private ? "One-time address" : "Own wallet, not private"}</span>
                        </span>
                      </td>
                      <td className="px-6 py-3 tabular-nums">{money(r.monthly)} USDC</td>
                      <td className="px-6 py-3">
                        <span className={`label-type rounded-pills border border-carbon px-2.5 py-0.5 uppercase ${pill[r.status][1]}`}>
                          {pill[r.status][0]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
