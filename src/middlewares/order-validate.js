'use strict';

module.exports = (config, { strapi }) => {
  // Hàm dùng chung để tính lại total_price từ DB
  const recalcOrderFromDb = async (orderId) => {
    if (!orderId) return;

    // Lấy lại order từ DB, populate items + product
    const order = await strapi.entityService.findOne(
      'api::order.order',
      orderId,
      {
        populate: {
          items: {
            populate: {
              product: {
                fields: ['id', 'price', 'discount_price'],
              },
            },
          },
        },
      }
    );

    if (!order || !Array.isArray(order.items) || order.items.length === 0) {
      return;
    }

    let total = 0;
    const updatedItems = [];

    for (const item of order.items) {
      const quantity = Number(item.quantity || 1);
      const product = item.product;

      if (!product) {
        // Nếu không có product thì bỏ qua dòng này
        continue;
      }

      let unitPrice = null;

      if (
        product.discount_price !== null &&
        product.discount_price !== undefined
      ) {
        unitPrice = Number(product.discount_price);
      } else if (
        product.price !== null &&
        product.price !== undefined
      ) {
        unitPrice = Number(product.price);
      }

      if (unitPrice === null || Number.isNaN(unitPrice) || unitPrice < 0) {
        // Nếu giá không hợp lệ thì coi như 0
        unitPrice = 0;
      }

      const subtotal = unitPrice * quantity;
      total += subtotal;

      updatedItems.push({
        id: item.id,
        product: product.id,
        quantity,
        unit_price: unitPrice,
        subtotal,
      });
    }

    // Update lại order với total_price + items (unit_price/subtotal mới)
    await strapi.entityService.update('api::order.order', orderId, {
      data: {
        total_price: total,
        items: updatedItems,
      },
    });
  };

  return async (ctx, next) => {
    const method = ctx.request.method;
    const path = ctx.request.path || ctx.path;

    const isWriteMethod = ['POST', 'PUT', 'PATCH'].includes(method);
    const isAction = path.includes('/actions/');
    const isOrderApi = path.startsWith('/api/orders');
    const isAdminOrder =
      path.startsWith('/content-manager/collection-types/api::order.order');

    if (!isWriteMethod || isAction || (!isOrderApi && !isAdminOrder)) {
      return next();
    }

    // ----------- CASE 1: CREATE (POST) - tính giá trước khi lưu -----------
    if (method === 'POST') {
      let body = ctx.request.body || {};

      let data;
      let usingDataWrapper = false;

      if (body && body.data && typeof body.data === 'object') {
        data = body.data;
        usingDataWrapper = true;
      } else {
        data = body;
        usingDataWrapper = false;
      }

      const items = data.items;

      if (!Array.isArray(items) || items.length === 0) {
        ctx.throw(400, 'Order must contain at least one item.');
      }

      const productIds = [];

      items.forEach((item, index) => {
        const rawProduct = item.product;

        if (!rawProduct) {
          ctx.throw(400, `Item[${index}] is missing product.`);
        }

        let productId = null;

        if (
          typeof rawProduct === 'number' ||
          typeof rawProduct === 'string'
        ) {
          productId = Number(rawProduct);
        } else if (typeof rawProduct === 'object') {
          if (rawProduct.id != null) {
            productId = Number(rawProduct.id);
          } else if (
            Array.isArray(rawProduct.connect) &&
            rawProduct.connect[0]?.id != null
          ) {
            productId = Number(rawProduct.connect[0].id);
          }
        }

        if (!productId || Number.isNaN(productId)) {
          ctx.throw(
            400,
            `Item[${index}] has invalid product field (no valid id).`
          );
        }

        const quantity = Number(item.quantity || 1);
        if (Number.isNaN(quantity) || quantity <= 0) {
          ctx.throw(
            400,
            `Item[${index}] has invalid quantity (must be > 0).`
          );
        }

        item._productId = productId;
        productIds.push(productId);
      });

      // Lấy giá product
      const uniqueIds = [...new Set(productIds)];

      const products = await strapi.entityService.findMany(
        'api::product.product',
        {
          filters: { id: { $in: uniqueIds } },
          fields: ['id', 'price', 'discount_price'],
        }
      );

      const productMap = {};
      for (const p of products) {
        productMap[p.id] = p;
      }

      uniqueIds.forEach((id) => {
        if (!productMap[id]) {
          ctx.throw(400, `Product ${id} not found.`);
        }
      });

      let total = 0;

      items.forEach((item) => {
        const productId = item._productId;
        const product = productMap[productId];

        let unitPrice = null;

        if (
          product.discount_price !== null &&
          product.discount_price !== undefined
        ) {
          unitPrice = Number(product.discount_price);
        } else if (
          product.price !== null &&
          product.price !== undefined
        ) {
          unitPrice = Number(product.price);
        }

        if (unitPrice === null || Number.isNaN(unitPrice) || unitPrice < 0) {
          ctx.throw(
            400,
            `Product ${productId} has invalid price.`
          );
        }

        const quantity = Number(item.quantity || 1);
        const subtotal = unitPrice * quantity;

        item.product = productId;
        item.quantity = quantity;
        item.unit_price = unitPrice;
        item.subtotal = subtotal;

        delete item._productId;

        total += subtotal;
      });

      data.total_price = total;

      if (!data.status) {
        data.status = 'pending';
      }

      if (usingDataWrapper) {
        body.data = data;
        ctx.request.body = body;
      } else {
        ctx.request.body = data;
      }

      await next();
      return;
    }

    // ----------- CASE 2: UPDATE (PUT/PATCH) - tính lại sau khi Strapi update xong -----------
    // Cho FE: /api/orders/:id
    // Cho Admin: /content-manager/collection-types/api::order.order/:id
    await next();

    let orderId = null;

    // /api/orders/:id
    const matchApi = path.match(/^\/api\/orders\/([^/]+)/);
    if (matchApi && matchApi[1]) {
      orderId = matchApi[1];
    }

    // /content-manager/collection-types/api::order.order/:id
    const matchAdmin = path.match(/order\.order\/([^/]+)/);
    if (!orderId && matchAdmin && matchAdmin[1]) {
      orderId = matchAdmin[1];
    }

    if (!orderId) {
      return;
    }

    try {
      await recalcOrderFromDb(orderId);
    } catch (err) {
      strapi.log.error('Failed to recalc order total_price:', err);
    }
  };
};
