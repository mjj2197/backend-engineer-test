import crypto from "node:crypto";
import type { Block, Transaction } from "../types.js";
import { withTx, pool } from "../db.js";

/** sha256(height + txId1 + txId2 + ... ) as a hex string */
export function computeBlockId(height: number, txs: Transaction[]): string {
    const s = String(height) + txs.map(t => t.id).join("");
    return crypto.createHash("sha256").update(s).digest("hex");
}

export async function getCurrentHeight(): Promise<number> {
    const { rows } = await pool.query("SELECT COALESCE(MAX(height), 0) AS h FROM blocks");
    return Number(rows[0].h);
}

export async function getBalance(address: string): Promise<number> {
    const { rows } = await pool.query(
        "SELECT COALESCE(SUM(value),0) AS bal FROM outputs WHERE address=$1 AND spent=false",
        [address]
    );
    return Number(rows[0].bal);
}

/** Validate and insert a block, updating UTXO set */
export async function addBlock(block: Block) {
    // height must be previous + 1 (first block is 1)
    const cur = await getCurrentHeight();
    if (block.height !== cur + 1) {
        const msg = `Invalid height: expected ${cur + 1}, got ${block.height}`;
        return { ok: false as const, status: 400, message: msg };
    }

    // id must match SHA256(height + concat(tx ids))
    const want = computeBlockId(block.height, block.transactions);
    if (block.id !== want) {
        return { ok: false as const, status: 400, message: "Invalid block id (sha256 mismatch)" };
    }

    // Validate each tx: inputs exist & unspent; inputs sum == outputs sum
    return await withTx(async (client) => {
        // per-TX validation first
        for (const tx of block.transactions) {
            let inputSum = 0;

            for (const [i, inp] of tx.inputs.entries()) {
                const { rows } = await client.query(
                    "SELECT address, value, spent FROM outputs WHERE tx_id=$1 AND idx=$2",
                    [inp.txId, inp.index]
                );
                if (rows.length === 0) {
                    throw Object.assign(new Error(`Input not found: ${inp.txId}:${inp.index}`), { status: 400 });
                }
                if (rows[0].spent) {
                    throw Object.assign(new Error(`Input already spent: ${inp.txId}:${inp.index}`), { status: 400 });
                }
                inputSum += Number(rows[0].value);
            }
            const outputSum = tx.outputs.reduce((a, b) => a + Number(b.value), 0);
            // Skip check for first tx
            if (tx.inputs.length > 0 && inputSum !== outputSum) {
                throw Object.assign(
                    new Error(`Inputs (${inputSum}) must equal outputs (${outputSum}) for tx ${tx.id}`),
                    { status: 400 }
                );
            }
        }

        // Insert block & transactions
        await client.query("INSERT INTO blocks (height, id) VALUES ($1,$2)", [block.height, block.id]);

        for (const tx of block.transactions) {
            await client.query("INSERT INTO transactions (id, height) VALUES ($1,$2)", [tx.id, block.height]);

            // consume inputs (mark spent) + record inputs
            for (const [i, inp] of tx.inputs.entries()) {
                await client.query(
                    "INSERT INTO inputs (tx_id, in_idx, ref_tx_id, ref_index) VALUES ($1,$2,$3,$4)",
                    [tx.id, i, inp.txId, inp.index]
                );
                await client.query("UPDATE outputs SET spent=true WHERE tx_id=$1 AND idx=$2", [inp.txId, inp.index]);
            }

            // create outputs
            for (const [idx, out] of tx.outputs.entries()) {
                await client.query(
                    "INSERT INTO outputs (tx_id, idx, address, value, spent) VALUES ($1,$2,$3,$4,false)",
                    [tx.id, idx, out.address, out.value]
                );
            }
        }

        return { ok: true as const };
    });
}

export async function rollbackTo(height: number) {
    const cur = await getCurrentHeight();
    if (height < 0 || height > cur) {
        return { ok: false as const, status: 400, message: `Invalid rollback height ${height}` };
    }

    // Roll back everything above target height
    await withTx(async (client) => {
        // unspend outputs consumed by inputs in blocks > height
        const { rows: inputsToUndo } = await client.query(
            `SELECT i.ref_tx_id, i.ref_index
       FROM inputs i
       JOIN transactions t ON t.id = i.tx_id
       WHERE t.height > $1`,
            [height]
        );

        for (const r of inputsToUndo) {
            await client.query(
                "UPDATE outputs SET spent=false WHERE tx_id=$1 AND idx=$2",
                [r.ref_tx_id, r.ref_index]
            );
        }

        // delete blocks > height (cascade will remove txs/outputs/inputs)
        await client.query("DELETE FROM blocks WHERE height > $1", [height]);
    });

    return { ok: true as const };
}
