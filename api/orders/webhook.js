import crypto from "crypto";
import getRawBody from "raw-body";
import { Client } from "pg";

const SHOPIFY_WEBHOOK_SECRET =
  "8fc7e2d15deb9550d35fe69863c8a86806131f1959c598f3de81ef59ac39e403";

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  console.log("Request Received");

  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  try {
    // 1. Verify Request Security
    const rawBody = await getRawBody(req);
    const hmacHeader = req.headers["x-shopify-hmac-sha256"];
    const hash = crypto
      .createHmac("sha256", SHOPIFY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("base64");

    if (hash !== hmacHeader) {
      console.error("⛔ HMAC mismatch.");
      return res.status(401).send("Forbidden");
    }

    // 2. Parse & Process Orders
    const payload = JSON.parse(rawBody.toString("utf8"));
    const orders = Array.isArray(payload) ? payload : [payload];

    for (const order of orders) {
      const ref = getAttribute(order, "ref");
      const refId = getAttribute(order, "ref_id"); // Captured for future use

      console.log(`📦 Order ${order.id} | Ref: ${ref || "None"}`);

      if (ref === "bacqyard" || ref === "bacqyard_test") {
        await processBacqyardOrder(order, refId);
      }
    }

    res.status(200).send("Processed");
  } catch (error) {
    console.error("❌ Error:", error);
    res.status(500).send("Server Error");
  }
}

// --- 🛠️ MODIFIABLE BUSINESS LOGIC ---

/**
 * This function triggers when a Bacqyard order is found.
 * Modify this function to send data to your external API.
 */
async function processBacqyardOrder(order, refId) {
  console.log(`✅ Bacqyard Order Detected! (Ref ID: ${refId})`);

  // TODO: Add your external HTTP Request here
  /*
  const externalPayload = {
    shopify_order_id: order.id,
    ref_id: refId,
    customer: order.customer,
    total: order.total_price
  };

  await fetch("YOUR_EXTERNAL_API_URL", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(externalPayload)
  });
  */

  // Database Connection
  const connectionString =
    "postgresql://neondb_owner:npg_wGIl19RQscEa@ep-twilight-wind-ahg0973s-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

  const client = new Client({
    connectionString: connectionString,
  });

  try {
    await client.connect();

    const query = `
      INSERT INTO orders (order_id, status, ref_id, total_price, order_details)
      VALUES ($1, $2, $3, $4, $5)
    `;

    const values = [
      order.id,
      order.financial_status || "pending",
      refId,
      Math.floor(parseFloat(order.total_price)),
      order,
    ];

    await client.query(query, values);
    console.log(`💾 Saved Order ${order.id} to Neon DB successfully.`);
  } catch (dbError) {
    console.error("❌ Database Error:", dbError);
  } finally {
    await client.end();
  }
}

// --- 🔌 HELPERS ---

// Helper to safely get note attributes
function getAttribute(order, key) {
  return (
    order.note_attributes?.find((attr) => attr.name === key)?.value || null
  );
}
