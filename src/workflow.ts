import type { Context } from "@resonatehq/sdk";
import { bus } from "./bus";

// ---------------------------------------------------------------------------
// One-Click Buy Workflow
// ---------------------------------------------------------------------------
// 1. User clicks Buy → workflow starts
// 2. 5-second cancellation window opens
// 3. If user cancels during window → purchase cancelled
// 4. If window expires without cancellation → purchase confirmed → checkout
//
// Compare to Temporal's nextjs-ecommerce-oneclick:
//   Temporal uses wf.condition(predicate, timeout) + Signals + Activities.
//   Here, ctx.run(waitForCancelOrTimeout) wraps a Promise that races
//   an EventEmitter event against a 5-second timer.
//   Same pattern, no framework-specific abstractions needed.

export type PurchaseState =
  | "PURCHASE_PENDING"
  | "PURCHASE_CONFIRMED"
  | "PURCHASE_CANCELLED";

export interface PurchaseResult {
  state: PurchaseState;
  itemId: string;
  orderId?: string;
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

export function* oneClickBuy(
  ctx: Context,
  itemId: string,
  key: string,
): Generator<any, PurchaseResult, any> {
  // Wait up to CANCEL_WINDOW_MS for a cancellation.
  // ctx.run() checkpoints the result — if the process crashes during the
  // window, it either returns the cached cancellation or restarts the timer.
  const decision = yield* ctx.run(waitForCancelOrTimeout, key, CANCEL_WINDOW_MS);

  if (decision === "cancelled") {
    yield* ctx.run(cancelledPurchase, itemId);
    return { state: "PURCHASE_CANCELLED", itemId };
  }

  const orderId = yield* ctx.run(checkoutItem, itemId);
  return { state: "PURCHASE_CONFIRMED", itemId, orderId };
}

// ---------------------------------------------------------------------------
// Activities (called via ctx.run — results are checkpointed)
// ---------------------------------------------------------------------------

const CANCEL_WINDOW_MS = 5_000;

// Wait for cancel signal OR let the timer expire.
// Result is stored durably so a process restart doesn't re-run this.
async function waitForCancelOrTimeout(
  _ctx: Context,
  key: string,
  windowMs: number,
): Promise<"cancelled" | "confirmed"> {
  return new Promise<"cancelled" | "confirmed">((resolve) => {
    const timer = setTimeout(() => {
      bus.removeAllListeners(`cancel:${key}`);
      resolve("confirmed");
    }, windowMs);

    bus.once(`cancel:${key}`, () => {
      clearTimeout(timer);
      resolve("cancelled");
    });
  });
}

async function cancelledPurchase(_ctx: Context, itemId: string): Promise<void> {
  console.log(`[checkout]  Purchase cancelled for item: ${itemId}`);
  // In a real app: release held inventory, send cancellation email, etc.
  await new Promise((r) => setTimeout(r, 100));
}

async function checkoutItem(
  _ctx: Context,
  itemId: string,
): Promise<string> {
  console.log(`[checkout]  Processing purchase for item: ${itemId}`);
  // In a real app: charge card, create order, update inventory, send receipt
  await new Promise((r) => setTimeout(r, 200));
  const orderId = `order-${Date.now()}`;
  console.log(`[checkout]  Order created: ${orderId}`);
  return orderId;
}
