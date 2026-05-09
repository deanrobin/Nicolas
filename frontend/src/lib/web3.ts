// Tiny Web3 helpers — uses window.ethereum directly, no extra deps.

const ERC20_TRANSFER_SELECTOR = '0xa9059cbb'

function toChainHex(chainId: number): string {
  return '0x' + chainId.toString(16)
}

function padLeft(hex: string, length: number): string {
  const clean = hex.replace(/^0x/, '')
  return clean.padStart(length, '0')
}

/**
 * Convert a decimal amount to BigInt raw units. Accepts string or number so a
 * stray `BigDecimal` serialized as a JSON number from the backend doesn't crash
 * us with `amount.split is not a function`.
 */
export function toUnits(amount: string | number, decimals: number): bigint {
  const s = typeof amount === 'string' ? amount : String(amount)
  const [whole = '0', fracRaw = ''] = s.split('.')
  const frac = (fracRaw + '0'.repeat(decimals)).slice(0, decimals)
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac || 0)
}

/** Encode ERC-20 transfer(address,uint256) calldata. */
export function encodeErc20Transfer(toAddress: string, amount: bigint): string {
  const addr = padLeft(toAddress, 64)
  const amt = padLeft(amount.toString(16), 64)
  return ERC20_TRANSFER_SELECTOR + addr + amt
}

export async function getCurrentAddress(): Promise<string> {
  if (!window.ethereum) throw new Error('未检测到 Web3 钱包 / No Web3 wallet detected')
  const accounts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as string[]
  if (!accounts || accounts.length === 0) throw new Error('No accounts available')
  return accounts[0]
}

export async function ensureChain(targetChainId: number): Promise<void> {
  if (!window.ethereum) throw new Error('未检测到 Web3 钱包 / No Web3 wallet detected')
  const current = (await window.ethereum.request({ method: 'eth_chainId' })) as string
  const target = toChainHex(targetChainId)
  if (current.toLowerCase() === target.toLowerCase()) return

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: target }],
    })
  } catch (err: unknown) {
    const code = (err as { code?: number }).code
    if (code === 4902 && targetChainId === 196) {
      // Try to add XLayer mainnet
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: target,
          chainName: 'X Layer',
          nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
          rpcUrls: ['https://rpc.xlayer.tech'],
          blockExplorerUrls: ['https://www.oklink.com/xlayer'],
        }],
      })
    } else {
      throw err
    }
  }
}

export async function sendUsdtTransfer(opts: {
  fromAddress: string
  toAddress: string
  usdtAddress: string
  amount: string
  decimals: number
  chainId: number
}): Promise<string> {
  if (!window.ethereum) throw new Error('未检测到 Web3 钱包 / No Web3 wallet detected')
  await ensureChain(opts.chainId)
  const raw = toUnits(opts.amount, opts.decimals)
  const data = encodeErc20Transfer(opts.toAddress, raw)
  const txHash = (await window.ethereum.request({
    method: 'eth_sendTransaction',
    params: [{
      from: opts.fromAddress,
      to: opts.usdtAddress,
      data,
      value: '0x0',
    }],
  })) as string
  return txHash
}
