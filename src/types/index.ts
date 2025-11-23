export type DexName = 'Raydium' | 'Meteora';

export interface Quote {
  dex: DexName;
  price: number;
  fee: number;
  amountOut: number;
}

export interface SwapResult {
  txHash: string;
  executedPrice: number;
  status: 'confirmed' | 'failed';
}