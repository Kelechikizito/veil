import { NextResponse } from "next/server";
import { decodeEventLog, encodeEventTopics, type Hex } from "viem";
import { VeilPayrollAbi } from "@/lib/contracts/abis";
import { addresses } from "@/lib/contracts/addresses";
import { defaultChain } from "@/lib/chains";

/*
 * Every stealth-stream announcement from VeilPayroll, read from Envio HyperSync
 * (https://docs.envio.dev/docs/HyperSync/overview). A worker's browser matches them against its viewing key,
 * so it reads only its own streams instead of every stream. Public RPCs cap eth_getLogs at 10 to 100 blocks;
 * HyperSync returns the whole history in one or two requests. The token stays on the server.
 *
 * 503 when ENVIO_API_TOKEN isn't set: the app then falls back to reading streams over RPC.
 */

export type AnnouncementRow = { id: string; stealthAddress: Hex; ephemeralPubKey: Hex; viewTag: Hex };

const HYPERSYNC = `https://${defaultChain.id}.hypersync.xyz/query`;
const MAX_PAGES = 20;
const TOPIC0 = encodeEventTopics({ abi: VeilPayrollAbi, eventName: "Announcement" })[0];

type HyperSyncLog = { topic0?: Hex; topic1?: Hex; topic2?: Hex; topic3?: Hex; data?: Hex };
type HyperSyncResponse = { data?: { logs?: HyperSyncLog[] }[]; next_block?: number; archive_height?: number };

export async function GET() {
  const token = process.env.ENVIO_API_TOKEN;
  if (!token) return NextResponse.json({ error: "HyperSync isn't configured" }, { status: 503 });
  const d = (addresses as Record<string, { payroll?: Hex; deployBlock?: number }>)[String(defaultChain.id)];
  if (!d?.payroll) return NextResponse.json({ error: "Veil isn't deployed" }, { status: 503 });

  const rows: AnnouncementRow[] = [];
  let from = d.deployBlock ?? 0;
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await fetch(HYPERSYNC, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          from_block: from,
          logs: [{ address: [d.payroll], topics: [[TOPIC0]] }],
          field_selection: { log: ["topic0", "topic1", "topic2", "topic3", "data"] },
        }),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HyperSync ${res.status}`);
      const body = (await res.json()) as HyperSyncResponse;
      for (const batch of body.data ?? []) {
        for (const log of batch.logs ?? []) {
          const row = decode(log);
          if (row) rows.push(row);
        }
      }
      // HyperSync pages by block range; stop once it has served up to the chain head
      if (!body.next_block || !body.archive_height || body.next_block >= body.archive_height) break;
      from = body.next_block;
    }
  } catch (e) {
    console.warn("[announcements]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "HyperSync is unavailable" }, { status: 502 });
  }

  return NextResponse.json({ announcements: rows, source: "envio-hypersync" }, { headers: { "Cache-Control": "no-store" } });
}

/** An Announcement log as a row; metadata is the view tag byte, then the stream id as 32 bytes */
function decode(log: HyperSyncLog): AnnouncementRow | undefined {
  if (!log.topic0 || !log.data) return undefined;
  try {
    const { args } = decodeEventLog({
      abi: VeilPayrollAbi,
      eventName: "Announcement",
      topics: [log.topic0, log.topic1!, log.topic2!, log.topic3!],
      data: log.data,
    });
    const metadata = args.metadata as Hex;
    if (metadata.length !== 2 + 66) return undefined;
    return {
      id: BigInt(`0x${metadata.slice(4)}`).toString(),
      stealthAddress: args.stealthAddress as Hex,
      ephemeralPubKey: args.ephemeralPubKey as Hex,
      viewTag: `0x${metadata.slice(2, 4)}` as Hex,
    };
  } catch {
    return undefined;
  }
}
