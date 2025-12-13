'use strict';

const generateOrderCode = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 100000000)
    .toString()
    .padStart(6, '0');
  return `ORD-${y}${m}${d}-${random}`;
};

module.exports = {
  async beforeCreate(event) {
    const { data } = event.params;
    if (!data) return;

    if (!data.code || String(data.code).trim() === '') {
      data.code = generateOrderCode();
    }
    if (!data.status) {
      data.status = 'pending';
    }
  },

  async beforeUpdate(event) {
    const { data } = event.params;
    if (!data) return;

    if (data.code !== undefined && String(data.code).trim() === '') {
      data.code = generateOrderCode();
    }
  },

  async afterCreate(event) {
    const id = event.result && event.result.id;
    if (!id) return;

    const fresh = await strapi.entityService.findOne('api::order.order', id, {
      populate: {
        items: {
          populate: {
            product_variant: {
              populate: {
                product: true,
                size: true,
                color: true,
              },
            },
          },
        },
      },
    });

    event.result = fresh;
  },

  async afterUpdate(event) {
    const id = event.result && event.result.id;
    if (!id) return;

    const fresh = await strapi.entityService.findOne('api::order.order', id, {
      populate: {
        items: {
          populate: {
            product_variant: {
              populate: { product: true, size: true, color: true },
            },
          },
        },
      }
    });

    event.result = fresh;
  },
};
