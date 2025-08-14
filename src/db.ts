import { readFileSync } from "node:fs";
import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://app:app@localhost:5432/indexer";

export const pool = new Pool({ connectionString: DATABASE_URL });

export async function initDb() {
	const schema = readFileSync(new URL("./sql/schema.sql", import.meta.url), "utf8");
	await pool.query(schema);
}

export async function withTx<T>(fn: (client: any) => Promise<T>) {
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		const out = await fn(client);
		await client.query("COMMIT");
		return out;
	} catch (e) {
		await client.query("ROLLBACK");
		throw e;
	} finally {
		client.release();
	}
}
