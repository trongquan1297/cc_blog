'use strict';

module.exports = {
  async getDetail(ctx) {
    try {
      const { id } = ctx.params;
      const { color } = ctx.query; // 1. Lấy tham số color từ URL (?color=PINK)

      // 2. Tạo bộ lọc cho variants
      // Nếu có color -> Lọc theo tên màu (dùng $eqi để không phân biệt hoa thường)
      // Nếu không có color -> Lấy hết (object rỗng)
      const variantFilter = color 
        ? { 
            color: { 
              name: { $eqi: color } 
            } 
          } 
        : {};

      // 3. Query Database với bộ lọc
      const product = await strapi.entityService.findOne('api::product.product', id, {
        populate: {
          cover: true,
          product_variants: {
            filters: variantFilter, // <--- ĐIỂM QUAN TRỌNG: Áp dụng lọc tại đây
            populate: {
              color: true,
              size: true,
              pictures: true
            }
          },
          blocks: true,
          seo: true
        }
      });

      if (!product) {
        return ctx.notFound('Không tìm thấy sản phẩm');
      }

      // 4. Logic làm sạch dữ liệu (Clean Response) - Giữ nguyên như cũ
      const cleanVariants = product.product_variants.map(v => {
        const images = v.pictures ? v.pictures.map(img => {
            const formats = img.formats || {};
            return {
                id: img.id,
                url: formats.medium?.url || formats.small?.url || img.url,
                thumbnail: formats.thumbnail?.url || formats.small?.url || img.url
            };
        }) : [];

        return {
          id: v.id,
          sku: v.SKU,
          price: v.price,
          discount_price: v.discount_price, 
          stock: v.stock,
          isHot: v.hottrend,
          color: v.color?.name || null,
          size: v.size?.name || null,
          images: images 
        };
      });

      // Cover
      const coverFormats = product.cover?.formats || {};
      const cleanCover = product.cover ? {
          url: coverFormats.medium?.url || coverFormats.small?.url || product.cover.url,
          thumbnail: coverFormats.thumbnail?.url || coverFormats.small?.url || product.cover.url
      } : null;

      const response = {
        id: product.id,
        title: product.title,
        description: product.description,
        cover: cleanCover,
        variants: cleanVariants, // Mảng này giờ chỉ chứa các size của màu PINK
        seo: product.seo || null
      };

      return ctx.send(response);

    } catch (err) {
      ctx.body = err;
    }
  }
};