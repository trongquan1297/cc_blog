'use strict';

const { ValidationError } = require('@strapi/utils').errors;

module.exports = (config, { strapi }) => {
  const isWithinDiscountWindow = (variant) => {
    const hasDiscount =
      variant.discount_price !== null && variant.discount_price !== undefined;
    if (!hasDiscount) return false;

    const start = variant.discount_start_date
      ? new Date(variant.discount_start_date).getTime()
      : null;
    const end = variant.discount_end_date
      ? new Date(variant.discount_end_date).getTime()
      : null;

    const now = Date.now();
    if (start !== null && now < start) return false;
    if (end !== null && now > end) return false;
    return true;
  };

  const pickUnitPrice = (variant) => {
    if (isWithinDiscountWindow(variant)) return Number(variant.discount_price);
    return Number(variant.price);
  };

  const getVariantIdFromItem = (item) => {
    if (!item || !item.product_variant) return null;
    const v = item.product_variant;

    // number / string
    if (typeof v === 'number' || typeof v === 'string') return Number(v);

    if (typeof v === 'object') {
      // { id }
      if (v.id != null) return Number(v.id);

      // { connect: [{ id }] }
      if (Array.isArray(v.connect) && v.connect[0]?.id != null) {
        return Number(v.connect[0].id);
      }

      // Admin hay gửi { count: 1 } -> không có id
      // => return null để fallback lấy từ DB
    }

    return null;
  };

  const parseOrderIdFromPath = (ctx) => {
    const path = ctx.request.path || ctx.path;

    // /api/orders/:id
    const m1 = path.match(/^\/api\/orders\/([^/]+)/);
    if (m1?.[1]) return Number(m1[1]);

    // /content-manager/collection-types/api::order.order/:id
    const m2 = path.match(/api::order\.order\/([^/]+)/);
    if (m2?.[1]) return Number(m2[1]);

    return null;
  };

  const shouldHandle = (ctx) => {
    const method = ctx.request.method;
    const path = ctx.request.path || ctx.path;

    if (!['POST', 'PUT', 'PATCH'].includes(method)) return false;
    if (path.includes('/actions/')) return false;

    if (path.startsWith('/api/orders')) return true;
    if (path.startsWith('/content-manager/collection-types/api::order.order'))
      return true;

    return false;
  };

  return async (ctx, next) => {
    if (!shouldHandle(ctx)) return next();

    const method = ctx.request.method;
    const path = ctx.request.path || ctx.path;

    let body = ctx.request.body || {};
    const usingDataWrapper = body && body.data && typeof body.data === 'object';
    const data = usingDataWrapper ? body.data : body;

    // Nếu request update không gửi items -> bỏ qua
    if (!Object.prototype.hasOwnProperty.call(data, 'items')) {
      return next();
    }

    const items = data.items;

    if (!Array.isArray(items) || items.length === 0) {
      if (method === 'POST') {
        throw new ValidationError('Order must contain at least one item.');
      }
      return next();
    }

    // ---- Fallback cho UPDATE: build map itemId -> variantId từ DB ----
    let existingItemVariantMap = null;
    if (method !== 'POST') {
      const orderId = parseOrderIdFromPath(ctx);

      if (orderId) {
        const existing = await strapi.entityService.findOne(
          'api::order.order',
          orderId,
          {
            populate: {
              items: {
                populate: {
                  product_variant: { fields: ['id'] },
                },
              },
            },
          }
        );

        existingItemVariantMap = new Map();
        for (const it of existing?.items || []) {
          if (it?.id && it?.product_variant?.id) {
            existingItemVariantMap.set(Number(it.id), Number(it.product_variant.id));
          }
        }
      }
    }

    // ---- Normalize items: resolve variantId (từ payload hoặc từ DB) ----
    const normalizedItems = [];
    const variantIds = [];

    for (let i = 0; i < items.length; i++) {
      const raw = items[i];

      let variantId = getVariantIdFromItem(raw);

      // fallback: nếu admin update gửi { product_variant: {count:1} } nhưng có item.id
      if (!variantId && raw?.id && existingItemVariantMap) {
        variantId = existingItemVariantMap.get(Number(raw.id)) || null;
      }

      // POST bắt buộc phải có variantId từ payload
      if (!variantId && method === 'POST') {
        throw new ValidationError(
          `Item[${i}] has invalid product_variant (no valid id).`
        );
      }

      // PUT/PATCH: nếu vẫn không resolve được variantId thì coi như payload items không hợp lệ
      // (thường là add item mới nhưng admin không gửi connect/id)
      if (!variantId && method !== 'POST') {
        throw new ValidationError(
          `Item[${i}] missing product_variant id. When updating items, please select a product variant.`
        );
      }

      const quantity = Number(raw.quantity || 1);
      if (Number.isNaN(quantity) || quantity <= 0) {
        throw new ValidationError(
          `Item[${i}] quantity must be a positive number.`
        );
      }

      variantIds.push(variantId);

      normalizedItems.push({
        ...(raw.id ? { id: raw.id } : {}),
        product_variant: variantId,
        quantity,
      });
    }

    // ---- Fetch variants ----
    const uniqueIds = [...new Set(variantIds)];

    const variants = await strapi.entityService.findMany(
      'api::product-variant.product-variant',
      {
        filters: { id: { $in: uniqueIds } },
        fields: [
          'id',
          'price',
          'discount_price',
          'discount_start_date',
          'discount_end_date',
          'stock',
          'SKU',
          'title',
        ],
      }
    );

    const map = {};
    for (const v of variants) map[v.id] = v;

    for (const id of uniqueIds) {
      if (!map[id]) throw new ValidationError(`Variant ${id} not found.`);
    }

    // ---- Compute totals ----
    let total = 0;
    const pricedItems = [];

    for (let i = 0; i < normalizedItems.length; i++) {
      const it = normalizedItems[i];
      const variant = map[it.product_variant];

      // Optional stock check
      if (
        variant.stock !== null &&
        variant.stock !== undefined &&
        Number.isFinite(Number(variant.stock)) &&
        Number(variant.stock) < it.quantity
      ) {
        throw new ValidationError(
          `Variant ${variant.id} is out of stock (requested ${it.quantity}, available ${variant.stock}).`
        );
      }

      const unitPrice = pickUnitPrice(variant);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new ValidationError(`Variant ${variant.id} has invalid price.`);
      }

      const subTotal = unitPrice * it.quantity;
      total += subTotal;

      pricedItems.push({
        ...(it.id ? { id: it.id } : {}),
        product_variant: it.product_variant,
        quantity: it.quantity,
        unit_price: unitPrice,
        sub_total: subTotal,
      });
    }

    data.items = pricedItems;
    data.total_price = total;

    if (method === 'POST' && !data.status) data.status = 'pending';

    if (usingDataWrapper) ctx.request.body = { ...body, data };
    else ctx.request.body = data;

    await next();
  };
};
