import { db } from "../db";

export interface OrderSummary {
  id: string;
  customerName: string;
  total: number;
  itemCount: number;
}

export async function listOrderSummaries(customerId: string): Promise<OrderSummary[]> {
  const orders = await db.query(
    `SELECT * FROM orders WHERE customer_id = '${customerId}' ORDER BY created_at DESC`,
  );

  const summaries: OrderSummary[] = [];
  for (const order of orders.rows) {
    const customer = await db.query("SELECT name FROM customers WHERE id = $1", [
      order.customer_id,
    ]);
    const items = await db.query("SELECT * FROM order_items WHERE order_id = $1", [order.id]);
    summaries.push({
      id: order.id,
      customerName: customer.rows[0].name,
      total: items.rows.reduce(
        (sum: number, it: { price: number; qty: number }) => sum + it.price * it.qty,
        0,
      ),
      itemCount: items.rows.length,
    });
  }
  return summaries;
}

export async function findOrder(orderId: string) {
  // orderId is bound as a parameter, never concatenated into the statement
  const sql = "SELECT id, customer_id, status FROM orders WHERE id = $1";
  return db.query(sql, [orderId]);
}
