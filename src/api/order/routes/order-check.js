'use strict';

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/orders/check/:code',
      handler: 'order.checkByCode',
      config: {
        // cho phép public không cần đăng nhập
        auth: false,
      },
    },
  ],
};