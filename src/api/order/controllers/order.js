'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

const maskLastChars = (value, visible = 3) => {
  if (!value) return null;
  const s = String(value).trim();
  if (s.length <= visible) return '*'.repeat(s.length);
  return '*'.repeat(s.length - visible) + s.slice(-visible);
};

module.exports = createCoreController('api::order.order', ({ strapi }) => ({
  async checkByCode(ctx) {
    const { code } = ctx.params;
    if (!code) return ctx.badRequest('Order code is required');

    const orders = await strapi.entityService.findMany('api::order.order', {
      filters: { code },
      populate: {
        items: {
          populate: {
            product_variant: {
              fields: ['id', 'SKU', 'title', 'price', 'discount_price'],
              populate: {
                product: { fields: ['id', 'title'] }, // ✅ không query product.price
                size: { fields: ['id', 'name'] },
                color: { fields: ['id', 'name'] },
              },
            },
          },
        },
      },
      limit: 1,
    });

    const order = orders[0];
    if (!order) return ctx.notFound('Order not found');

    ctx.body = {
      data: {
        id: order.id,
        code: order.code,
        status: order.status,
        total_price: order.total_price,
        customer_name: order.customer_name,
        customer_phone: maskLastChars(order.customer_phone, 3),
        customer_address: maskLastChars(order.customer_address, 3),
        createdAt: order.createdAt,
        items: (order.items || []).map((item) => {
          const v = item.product_variant;
          return {
            quantity: item.quantity,
            unit_price: item.unit_price,
            sub_total: item.sub_total,
            product_variant: v
              ? {
                  price: v.price,
                  discount_price: v.discount_price,
                  size: v.size ? { name: v.size.name } : null,
                  color: v.color ? { name: v.color.name } : null,
                  product: v.product ? { id: v.product.id, title: v.product.title } : null,
                }
              : null,
          };
        }),
      },
    };
  },
}));
