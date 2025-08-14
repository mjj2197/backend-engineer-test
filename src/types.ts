export type Output = { address: string; value: number };
export type Input = { txId: string; index: number };
export type Transaction = { id: string; inputs: Input[]; outputs: Output[] };
export type Block = { id: string; height: number; transactions: Transaction[] };
