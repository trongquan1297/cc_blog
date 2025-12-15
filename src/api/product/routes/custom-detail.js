module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/products/view/:id', // Đường dẫn API mới: /api/products/view/6
      handler: 'product-detail.getDetail', // Cú pháp: [tên-file-controller].[tên-hàm]
      config: {
        auth: false, // Để false nếu cho phép xem không cần đăng nhập
      },
    },
  ],
};