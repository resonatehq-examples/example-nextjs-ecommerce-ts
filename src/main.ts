import express from "express";
import path from "path";
import { Resonate } from "@resonatehq/sdk";
import { oneClickBuy, type PurchaseResult } from "./workflow";
import { bus } from "./bus";

// ---------------------------------------------------------------------------
// Resonate setup
// ---------------------------------------------------------------------------

const resonate = new Resonate();
resonate.register(oneClickBuy);

// ---------------------------------------------------------------------------
// Express server
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());
app.use(express.static(path.join(import.meta.dir, "..", "public")));

// ---------------------------------------------------------------------------
// POST /buy/:key
// ---------------------------------------------------------------------------
// Start the checkout workflow for a given idempotency key.
// Duplicate clicks with the same key → same workflow execution.

app.post("/buy/:key", async (req, res) => {
  const key = req.params.key;
  const itemId = (req.body as { itemId?: string }).itemId ?? "widget-001";

  console.log(`[api]       POST /buy/${key} — item: ${itemId}`);

  // Fire-and-forget: workflow runs in background
  resonate.run(`checkout/${key}`, oneClickBuy, itemId, key).catch(console.error);

  res.json({ status: "pending", key });
});

// ---------------------------------------------------------------------------
// POST /cancel/:key
// ---------------------------------------------------------------------------
// Signal the workflow to cancel during the 5-second window.

app.post("/cancel/:key", (req, res) => {
  const key = req.params.key;
  console.log(`[api]       POST /cancel/${key} — cancellation requested`);
  bus.emit(`cancel:${key}`);
  res.json({ status: "ok" });
});

// ---------------------------------------------------------------------------
// GET /status/:key
// ---------------------------------------------------------------------------
// Poll for current workflow state. Returns as soon as the result is ready.

app.get("/status/:key", async (req, res) => {
  const key = req.params.key;

  try {
    const handle = await resonate.get(`checkout/${key}`);
    const done = await handle.done();

    if (!done) {
      res.json({ status: "pending" });
      return;
    }

    const result = (await handle.result()) as PurchaseResult;
    res.json({ status: "done", result });
  } catch {
    res.status(404).json({ status: "not_found" });
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env["PORT"] ?? "3000");
app.listen(PORT, () => {
  console.log(`\nOne-Click Buy running at http://localhost:${PORT}`);
  console.log("Open the URL in your browser to try it.\n");
});
