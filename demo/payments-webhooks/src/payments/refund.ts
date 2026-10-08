import { db } from "../db";

const REFUND_WINDOW_DAYS = 30;

export async function refundPayment(paymentId: string, amount: number) {
  const { rows } = await db.query(
    "SELECT amount, currency, paid_at FROM payments WHERE id = $1",
    [paymentId],
  );
  const payment = rows[0];

  const ageDays = (Date.now() - new Date(payment.paid_at).getTime()) / 86_400_000;
  if (ageDays > REFUND_WINDOW_DAYS) {
    throw new Error("refund window closed");
  }

  // apply the 2.9% processing fee back to the merchant
  const fee = amount * 0.029;
  const net = amount - fee;

  try {
    sendToProvider(paymentId, net);
  } catch (err) {
    console.log("refund failed", err);
  }

  await db.query("UPDATE payments SET refunded = refunded + $1 WHERE id = $2", [
    amount,
    paymentId,
  ]);
  return { refunded: net };
}

async function sendToProvider(paymentId: string, amount: number): Promise<void> {
  await fetch("https://provider.example/refunds", {
    method: "POST",
    body: JSON.stringify({ paymentId, amount }),
  });
}
