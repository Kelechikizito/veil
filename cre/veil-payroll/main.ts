import {
  CronCapability,
  EVMClient,
  LAST_FINALIZED_BLOCK_NUMBER,
  Runner,
  TxStatus,
  bytesToHex,
  encodeCallMsg,
  getNetwork,
  handler,
  prepareReportRequest,
  type Runtime,
} from '@chainlink/cre-sdk'
import {
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  parseAbi,
  parseAbiParameters,
  zeroAddress,
  type Address,
} from 'viem'
import { z } from 'zod'

/*
 * Veil scheduled payroll. On each tick it reads one employer's streams on Monad, picks the Active streams in
 * the payroll token that aren't funded for the current period, and works out what they need for the time left.
 * In production it sends that as a signed report to the employer's VeilPayrollAutomation receiver, which runs
 * payroll with it (capped by the employer's onchain maxBudget). The local-simulation target stops before any
 * report or write.
 */

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'must be an address')

const shared = {
  schedule: z.string().min(1),
  chainSelectorName: z.string().min(1),
  payroll: address,
  token: address,
  payer: address,
}

const configSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('local-simulation'), ...shared }).strict(),
  z
    .object({
      mode: z.literal('production'),
      ...shared,
      receiver: address.refine((v) => v.toLowerCase() !== zeroAddress, 'receiver must be nonzero'),
      gasLimit: z.string().regex(/^\d+$/, 'gasLimit must be a decimal string'),
    })
    .strict(),
])

type Config = z.infer<typeof configSchema>

const payrollAbi = parseAbi([
  'function streamsOfPayer(address payer) view returns (uint256[])',
  'function periodEnd(uint64 timestamp) view returns (uint64)',
  'function PERIOD() view returns (uint64)',
  'function getStream(uint256 id) view returns ((address payer, address payee, address token, uint256 monthly, uint256 withdrawn, uint256 allocated, uint256 banked, uint64 startTime, uint64 endTime, uint64 allocStart, uint64 allocEnd, uint8 status))',
])

/** VeilPayroll's Status.Active */
const ACTIVE = 2

const onCronTrigger = (runtime: Runtime<Config>): string => {
  const config = runtime.config
  const network = getNetwork({ chainFamily: 'evm', chainSelectorName: config.chainSelectorName })
  if (!network) throw new Error(`Unknown chain selector: ${config.chainSelectorName}`)
  const client = new EVMClient(network.chainSelector.selector)
  const payroll = config.payroll as Address

  const read = <F extends 'streamsOfPayer' | 'periodEnd' | 'PERIOD' | 'getStream'>(functionName: F, args: readonly unknown[]) => {
    const reply = client
      .callContract(runtime, {
        call: encodeCallMsg({
          from: zeroAddress,
          to: payroll,
          data: encodeFunctionData({ abi: payrollAbi, functionName, args } as never),
        }),
        blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
      })
      .result()
    return decodeFunctionResult({ abi: payrollAbi, functionName, data: bytesToHex(reply.data) } as never)
  }

  const now = BigInt(runtime.now().getTime()) / 1000n
  const period = read('PERIOD', []) as bigint
  const end = read('periodEnd', [now]) as bigint
  const left = end > now ? end - now : 0n
  const ids = read('streamsOfPayer', [config.payer]) as readonly bigint[]

  const due: bigint[] = []
  let budget = 0n
  for (const id of ids) {
    const s = read('getStream', [id]) as { token: Address; monthly: bigint; allocEnd: bigint; status: number }
    if (s.status !== ACTIVE || s.token.toLowerCase() !== config.token.toLowerCase() || s.allocEnd === end) continue
    due.push(id)
    budget += (s.monthly * left) / period
  }

  const summary = { streams: due.map(String), budget: budget.toString(), periodEnd: end.toString() }
  runtime.log(`Unfunded streams: ${summary.streams.length}, budget ${summary.budget}, period ends ${summary.periodEnd}`)

  if (config.mode === 'local-simulation') {
    return JSON.stringify({ mode: 'local-simulation', wouldWrite: due.length > 0, ...summary })
  }
  if (due.length === 0) return JSON.stringify({ mode: 'production', written: false, ...summary })

  const encoded = encodeAbiParameters(parseAbiParameters('uint256 budget, uint256[] ids'), [budget, due])
  const report = runtime.report(prepareReportRequest(encoded)).result()
  const result = client
    .writeReport(runtime, { receiver: config.receiver, report, gasConfig: { gasLimit: config.gasLimit } })
    .result()
  if (result.txStatus !== TxStatus.SUCCESS) throw new Error(result.errorMessage ?? `write status ${result.txStatus}`)
  if (!result.txHash) throw new Error('write succeeded without a transaction hash')
  const txHash = bytesToHex(result.txHash)
  runtime.log(`Ran payroll: ${txHash}`)
  return JSON.stringify({ mode: 'production', written: true, txHash, ...summary })
}

const initWorkflow = (config: Config) => [handler(new CronCapability().trigger({ schedule: config.schedule }), onCronTrigger)]

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema })
  await runner.run(initWorkflow)
}
