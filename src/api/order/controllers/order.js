'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

// Helper: che số, chỉ để lại n ký tự cuối
const maskLastChars = (value, visible = 3) => {
  if (!value) return null;
  const s = String(value).trim();
  if (s.length <= visible) return '*'.repeat(s.length);

  const hiddenPart = '*'.repeat(s.length - visible);
  const visiblePart = s.slice(-visible);
  return hiddenPart + visiblePart;
};


module.exports = createCoreController('api::order.order', ({ strapi }) => ({
  /**
   * GET /api/orders/check/:code
   * Check đơn hàng theo mã CODE
   */
  async checkByCode(ctx) {
    const { code } = ctx.params;

    if (!code) {
      return ctx.badRequest('Order code is required');
    }

    // tìm đơn theo code
    const orders = await strapi.entityService.findMany('api::order.order', {
      filters: { code },
      populate: {
        items: {
          populate: {
            product: {
              fields: ['id', 'title', 'price', 'discount_price'],
            },
          },
        },
      },
      limit: 1,
    });

    const order = orders[0];

    if (!order) {
      return ctx.notFound('Order not found');
    }

    // Che sdt & địa chỉ: chỉ để lại 3 ký tự cuối
    const maskedPhone = maskLastChars(order.customer_phone, 3);
    const maskedAddress = maskLastChars(order.customer_address, 3);

    // Có thể ẩn bớt thông tin nhạy cảm nếu muốn (phone, address)
    ctx.body = {
      data: {
        id: order.id,
        code: order.code,
        status: order.status,
        total_price: order.total_price,
        customer_name: order.customer_name,
        customer_name: order.customer_name,
        customer_phone: maskedPhone,
        customer_address: maskedAddress,
        createdAt: order.createdAt,
        items: order.items.map((item) => ({
          id: item.id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal: item.subtotal,
          product: item.product
            ? {
                id: item.product.id,
                name: item.product.name,
                slug: item.product.slug,
                price: item.product.price,
                discount_price: item.product.discount_price,
              }
            : null,
        })),
      },
    };
  },
}));
