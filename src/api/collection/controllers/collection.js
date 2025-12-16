'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::collection.collection', ({ strapi }) => ({

  // Override hàm findOne: GET /api/collections/:id
  async findOne(ctx) {
    try {
      const { id } = ctx.params;

      // 1. Lấy dữ liệu Collection + Populate sâu vào Product Variants
      const collection = await strapi.entityService.findOne('api::collection.collection', id, {
        populate: {
          cover: true, // Ảnh bìa bộ sưu tập
          product_variants: {
            populate: {
              product: true,  // Để lấy tên sản phẩm cha (VD: Áo thun A)
              pictures: true, // Để lấy ảnh hiển thị
              color: true,    // Lấy tên màu
              size: true      // Lấy tên size
            }
          }
        }
      });

      if (!collection) {
        return ctx.notFound('Không tìm thấy bộ sưu tập');
      }

      // 2. Logic làm sạch dữ liệu (Clean Response)
      // Biến đổi danh sách variants thô thành danh sách "Product Card" để hiển thị
      const items = (collection.product_variants || []).map(v => {
        
        // Logic lấy ảnh: Ưu tiên ảnh của Variant -> Nếu không có thì lấy ảnh Product cha (nếu bạn populate product.cover)
        // Ở đây mình lấy ảnh đầu tiên của variant làm đại diện
        let thumbnail = null;
        if (v.pictures && v.pictures.length > 0) {
            const img = v.pictures[0];
            thumbnail = img.formats?.medium?.url || img.formats?.small?.url || img.url;
        }

        return {
          id: v.id,
          sku: v.SKU,
          // Tên hiển thị: Kết hợp Tên SP cha + Màu (nếu muốn) hoặc chỉ Tên SP cha
          productName: v.product ? v.product.title : v.title, 
          variantName: v.title, // VD: Áo Thun - Đỏ - L
          
          price: v.price,
          discount_price: v.discount_price,
          
          // Các thông tin bổ trợ hiển thị trên card
          isHot: v.hottrend,
          stock: v.stock,
          color: v.color?.name || null,
          size: v.size?.name || null,
          
          image: thumbnail // URL ảnh đại diện cho card
        };
      });

      // 3. Xử lý ảnh bìa Collection
      const coverUrl = collection.cover 
        ? (collection.cover.formats?.medium?.url || collection.cover.url) 
        : null;

      // 4. Trả về kết quả gọn nhẹ
      return ctx.send({
        id: collection.id,
        title: collection.title,
        description: collection.description, // Nếu có mô tả bộ sưu tập
        cover: coverUrl,
        products: items // Danh sách sản phẩm trong bộ sưu tập
      });

    } catch (err) {
      ctx.body = err;
    }
  }
}));