import express from "express";
import type { Block } from "./types.js";
import { addBlock, getBalance, rollbackTo, computeBlockId } from "./services/indexer.js";

export const router = express.Router();

router.get("/health", (_, res) => res.json({ ok: true }));

router.post("/blocks", async (req, res) => {
    try {
        const block = req.body as Block;

        if (
            typeof block?.height !== "number" ||
            !Array.isArray(block?.transactions) ||
            typeof block?.id !== "string"
        ) {
            return res.status(400).json({ message: "Invalid block payload" });
        }

        const result = await addBlock(block);
        if (!result.ok) return res.status(result.status).json({ message: result.message });
        res.status(200).json({ ok: true });
    } catch (e: any) {
        const status = e?.status ?? 500;
        res.status(status).json({ message: e?.message ?? "Internal error" });
    }
});

router.get("/balance/:address", async (req, res) => {
    const address = req.params.address;
    const bal = await getBalance(address);
    res.json({ address, balance: bal });
});

router.post("/rollback", async (req, res) => {
    const h = Number(req.query.height);
    if (!Number.isFinite(h)) return res.status(400).json({ message: "height must be a number" });
    const r = await rollbackTo(h);
    if (!r.ok) return res.status(r.status).json({ message: r.message });
    res.json({ ok: true });
});

router.post("/compute-id", (req, res) => {
    const { height, transactions } = req.body ?? {};
    if (typeof height !== "number" || !Array.isArray(transactions)) {
        return res.status(400).json({ message: "Invalid payload" });
    }
    return res.json({ id: computeBlockId(height, transactions) });
});
