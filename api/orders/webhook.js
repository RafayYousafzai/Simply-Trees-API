import crypto from "crypto";
import getRawBody from "raw-body";

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
}

// --- 🔌 HELPERS ---

// Helper to safely get note attributes
function getAttribute(order, key) {
  return (
    order.note_attributes?.find((attr) => attr.name === key)?.value || null
  );
}
