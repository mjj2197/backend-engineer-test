import { expect, test, beforeAll } from "bun:test";
import { initDb, pool } from "../src/db.js";
import { computeBlockId, addBlock, getBalance, rollbackTo, getCurrentHeight } from "../src/services/indexer.js";

beforeAll(async () => {
	await initDb();
	// clean DB between runs
	await pool.query("DELETE FROM blocks");
});

test("happy path: add 3 blocks, balances match example, rollback to 2", async () => {
	// Block 1
	const b1 = {
		height: 1,
		transactions: [
			{
				id: "tx1",
				inputs: [],
				outputs: [{ address: "addr1", value: 10 }]
			}
		]
	};
	const id1 = computeBlockId(b1.height, b1.transactions);
	const res1 = await addBlock({ ...b1, id: id1 });
	expect(res1.ok).toBeTrue();
	expect(await getBalance("addr1")).toBe(10);

	// Block 2
	const b2 = {
		height: 2,
		transactions: [
			{
				id: "tx2",
				inputs: [{ txId: "tx1", index: 0 }],
				outputs: [{ address: "addr2", value: 4 }, { address: "addr3", value: 6 }]
			}
		]
	};
	const id2 = computeBlockId(b2.height, b2.transactions);
	const res2 = await addBlock({ ...b2, id: id2 });
	expect(res2.ok).toBeTrue();
	expect(await getBalance("addr1")).toBe(0);
	expect(await getBalance("addr2")).toBe(4);
	expect(await getBalance("addr3")).toBe(6);

	// Block 3
	const b3 = {
		height: 3,
		transactions: [
			{
				id: "tx3",
				inputs: [{ txId: "tx2", index: 1 }],
				outputs: [{ address: "addr4", value: 2 }, { address: "addr5", value: 2 }, { address: "addr6", value: 2 }]
			}
		]
	};
	const id3 = computeBlockId(b3.height, b3.transactions);
	const res3 = await addBlock({ ...b3, id: id3 });
	expect(res3.ok).toBeTrue();
	expect(await getBalance("addr2")).toBe(4);
	expect(await getBalance("addr3")).toBe(0);
	expect(await getBalance("addr4")).toBe(2);
	expect(await getBalance("addr5")).toBe(2);
	expect(await getBalance("addr6")).toBe(2);

	// rollback to 2
	const rb = await rollbackTo(2);
	expect(rb.ok).toBeTrue();
	expect(await getCurrentHeight()).toBe(2);
	expect(await getBalance("addr2")).toBe(4);
	expect(await getBalance("addr3")).toBe(6);
});

test("validation: height gap rejected", async () => {
	const bBad = { height: 4, transactions: [], id: "x" };
	const out = await addBlock(bBad as any);
	expect(out.ok).toBeFalse();
});
