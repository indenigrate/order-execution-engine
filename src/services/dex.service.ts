import { Quote, DexName, SwapResult } from '../types';

// Mock base prices for simulation (e.g., 1 SOL = 150 USDC)
const MOCK_PRICES: Record<string, number> = {
  'SOL-USDC': 150,
  'BTC-USDC': 60000,
  'ETH-USDC': 3000,
};

export class DexService {
  
  /**
   * Helper to simulate network delay
   * per requirements: "Simulate DEX responses with realistic delays (2-3 seconds)" [cite: 31]
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get Mock Quote from Raydium
   * Logic: Base Price * (0.98 + random * 0.04) [cite: 99]
   */
  async getRaydiumQuote(tokenIn: string, tokenOut: string, amountIn: number): Promise<Quote> {
    await this.delay(200); // Simulate network latency [cite: 97]
    
    const pair = `${tokenIn}-${tokenOut}`;
    const basePrice = MOCK_PRICES[pair] || 100; // Default to 100 if pair not found

    // Price variation logic from PDF [cite: 99]
    const variance = 0.98 + Math.random() * 0.04; 
    const price = basePrice * variance;
    const fee = amountIn * 0.003; // 0.3% fee

    return {
      dex: 'Raydium',
      price: price,
      fee: fee,
      amountOut: (amountIn * price) - fee
    };
  }

  /**
   * Get Mock Quote from Meteora
   * Logic: Base Price * (0.97 + random * 0.05) [cite: 101]
   */
  async getMeteoraQuote(tokenIn: string, tokenOut: string, amountIn: number): Promise<Quote> {
    await this.delay(200); // Simulate network latency [cite: 100]

    const pair = `${tokenIn}-${tokenOut}`;
    const basePrice = MOCK_PRICES[pair] || 100;

    // Price variation logic from PDF [cite: 101]
    const variance = 0.97 + Math.random() * 0.05;
    const price = basePrice * variance;
    const fee = amountIn * 0.002; // Meteora fee logic from PDF [cite: 101]

    return {
      dex: 'Meteora',
      price: price,
      fee: fee,
      amountOut: (amountIn * price) - fee
    };
  }

  /**
   * ROUTER LOGIC: Compare both and return the best
   * "Compares prices and selects best execution venue" [cite: 13]
   */
  async getBestQuote(tokenIn: string, tokenOut: string, amountIn: number): Promise<Quote> {
    // Query both DEXs in parallel for efficiency
    const [raydiumQuote, meteoraQuote] = await Promise.all([
      this.getRaydiumQuote(tokenIn, tokenOut, amountIn),
      this.getMeteoraQuote(tokenIn, tokenOut, amountIn)
    ]);

    console.log(`📊 Comparison: Raydium ($${raydiumQuote.amountOut.toFixed(2)}) vs Meteora ($${meteoraQuote.amountOut.toFixed(2)})`);

    // Return the one with higher output amount
    return raydiumQuote.amountOut > meteoraQuote.amountOut ? raydiumQuote : meteoraQuote;
  }

  /**
   * EXECUTION LOGIC
   * "Simulate 2-3 second execution" [cite: 105]
   */
  async executeSwap(dex: DexName, tokenIn: string, tokenOut: string, amountIn: number): Promise<SwapResult> {
    console.log(`🚀 Executing swap on ${dex}...`);
    
    // Simulate processing time (2000ms + random 1000ms) [cite: 106]
    const processingTime = 2000 + Math.random() * 1000;
    await this.delay(processingTime);

    // Simulate occasional failure (optional but good for testing retries)
    const isSuccess = Math.random() > 0.1; // 10% chance of failure

    if (!isSuccess) {
      throw new Error(`Swap failed on ${dex} due to slippage exceeded`);
    }

    return {
      txHash: 'sol_' + Math.random().toString(36).substring(7),
      executedPrice: MOCK_PRICES[`${tokenIn}-${tokenOut}`] || 100, // Simplified
      status: 'confirmed'
    };
  }
}

// Export a singleton instance
export const dexService = new DexService();