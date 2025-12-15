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
                product: { fields: ['id', 'title'] },
                size: { fields: ['id', 'name'] },
                color: { fields: ['id', 'name'] },
                pictures: true, // <--- 1. THÊM DÒNG NÀY: Để lấy danh sách ảnh
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
          
          // <--- 2. LOGIC LẤY ẢNH ĐẦU TIÊN ---
          let firstPicture = null;
          if (v && v.pictures && v.pictures.length > 0) {
            const img = v.pictures[0]; // Lấy ảnh đầu tiên trong mảng
            firstPicture = {
                // Lấy URL thumbnail cho nhẹ, nếu không có thì lấy ảnh gốc
                url: img.formats?.thumbnail?.url || img.formats?.small?.url || img.url,
                // Trả về cả url gốc nếu cần zoom
                original_url: img.url 
            };
          }
          // ----------------------------------

          return {
            quantity: item.quantity,
            unit_price: item.unit_price,
            sub_total: item.sub_total,
            product_variant: v
              ? {
                  id: v.id,
                  sku: v.SKU,   // Bổ sung hiển thị SKU cho rõ ràng
                  title: v.title, // Bổ sung title variant
                  price: v.price,
                  discount_price: v.discount_price,
                  size: v.size ? { name: v.size.name } : null,
                  color: v.color ? { name: v.color.name } : null,
                  product: v.product ? { id: v.product.id, title: v.product.title } : null,
                  picture: firstPicture // <--- Gán ảnh vào response
                }
              : null,
          };
        }),
      },
    };
  },
}));