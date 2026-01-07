import axios from "axios";

/**
 * Simply Trees Product API for Baqyards Integration
 *
 * Purpose:
 * Fetches products from Shopify, calculates total inventory, and generates
 * ready-to-use checkout links. By default, it hides out-of-stock items.
 *
 * Usage:
 * GET /api/products              -> Returns all IN-STOCK trees (active/published only)
 * GET /api/products?status=all   -> Returns EVERYTHING (including sold out & drafts)
 * GET /api/products?limit=3      -> Returns only the first 3 items
 * GET /api/products?include_drafts=true -> Include draft products
 */

export default async function handler(req, res) {
  // 1. Secure Credentials
  const { SHOPIFY_STORE_URL, SHOPIFY_ACCESS_TOKEN } = process.env;

  // 2. Parse Query Parameters
  const { limit, status, include_drafts } = req.query;

  try {
    // 3. Fetch Data from Shopify
    const response = await axios.get(
      `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/products.json`,
      {
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        },
      }
    );

    const rawProducts = response.data.products;

    // 4. Transform Data for Baqyards
    let cleanProducts = rawProducts
      .map((p) => {
        // A. Filter variants to only show those with inventory > 0 FIRST
        const availableVariants = p.variants.filter(
          (v) => v.inventory_quantity > 0
        );

        // B. Calculate Total Stock (Sum of AVAILABLE variants only)
        const totalInventory = availableVariants.reduce(
          (sum, variant) => sum + (variant.inventory_quantity || 0),
          0
        );

        // C. Determine Availability
        const isInStock = totalInventory > 0 && availableVariants.length > 0;

        // D. Check if product is published
        const isPublished = p.published_at !== null;
        const isActive = p.status === "active";

        // E. Select the "Default" Variant to Sell
        // IMPORTANT: Only select from available variants
        const defaultVariant =
          availableVariants.length > 0 ? availableVariants[0] : null;

        // F. Construct the Output Object
        return {
          id: p.id,
          title: p.title,
          handle: p.handle,
          image_url: p.image ? p.image.src : null,

          // Product Status Info
          status: p.status,
          is_published: isPublished,

          // Inventory Status
          is_available: isInStock,
          total_stock: totalInventory,
          available_variant_count: availableVariants.length,

          // The "Buy Now" Link - ONLY if we have a valid default variant
          checkout_url: defaultVariant
            ? `https://${SHOPIFY_STORE_URL}/cart/${defaultVariant.id}:1`
            : null,

          // Default variant info
          default_variant: defaultVariant
            ? {
                id: defaultVariant.id,
                title: defaultVariant.title,
                price: defaultVariant.price,
                stock: defaultVariant.inventory_quantity,
                sku: defaultVariant.sku,
              }
            : null,

          // Only include variants that have inventory
          variants: availableVariants.map((v) => ({
            id: v.id,
            title: v.title,
            price: v.price,
            stock: v.inventory_quantity,
            sku: v.sku,
            checkout_link: `https://${SHOPIFY_STORE_URL}/cart/${v.id}:1`,
          })),
        };
      })
      .filter((p) => {
        // 5. Primary Filtering: Remove products based on status and inventory

        // If status=all is requested, skip all filters
        if (status === "all") {
          return true;
        }

        // Filter out draft products (unless explicitly requested)
        if (p.status === "draft" && include_drafts !== "true") {
          return false;
        }

        // Filter out unpublished products
        if (!p.is_published) {
          return false;
        }

        // Filter out products with no inventory (CRITICAL CHECK)
        if (!p.is_available || p.available_variant_count === 0) {
          return false;
        }

        // Additional safety check: ensure default variant exists
        if (!p.default_variant) {
          return false;
        }

        return true;
      });

    // 6. Pagination: Limit results if requested
    if (limit) {
      cleanProducts = cleanProducts.slice(0, parseInt(limit));
    }

    // 7. Calculate metadata
    const totalAvailable = cleanProducts.filter((p) => p.is_available).length;

    // 8. Success Response
    return res.status(200).json({
      success: true,
      meta: {
        total_returned: cleanProducts.length,
        total_available: totalAvailable,
        filters_applied: {
          limit: limit ? parseInt(limit) : null,
          status: status || "available_only",
          include_drafts: include_drafts === "true",
        },
      },
      data: cleanProducts,
    });
  } catch (error) {
    // Error Handling
    console.error("Simply Trees API Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch Simply Trees inventory.",
      details: error.message,
    });
  }
}
