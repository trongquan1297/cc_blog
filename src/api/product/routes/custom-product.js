module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/products/listing', // Đây là endpoint frontend sẽ gọi
      handler: 'product.getListing',
      config: {
        auth: false, // Hoặc true nếu cần đăng nhập
      },
    },
  ],
};