'use strict';

/**
 * product controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::product.product', ({ strapi }) => ({

  async getListing(ctx) {
    try {
      // 1. FETCH DATA
      const products = await strapi.entityService.findMany('api::product.product', {
        sort: { createdAt: 'desc' },
        populate: {
          cover: true,
          branch: true,
          product_variants: {
            populate: {
              color: true,
              size: true,
              pictures: true
            }
          }
        },
      });

      // 2. PROCESS & FLATTEN DATA
      let displayItems = [];
      const now = new Date(); // Lấy thời gian hiện tại để check discount

      products.forEach(product => {
        const variants = product.product_variants || [];
        const colorGroups = {};

        variants.forEach(v => {
          if (!v.color) return;

          const colorId = v.color.id;
          const colorName = v.color.name || v.color.title || "Default";

          // Khởi tạo nhóm nếu chưa có
          if (!colorGroups[colorId]) {
            colorGroups[colorId] = {
              uuid: `${product.id}-color-${colorId}`,
              productId: product.id,
              productName: product.title,
              colorName: colorName,
              image: (v.pictures && v.pictures.length > 0) 
                ? v.pictures[0].url 
                : (product.cover ? product.cover.url : null),
              
              // Mảng tạm để tính toán min/max
              finalPrices: [], // Giá bán cuối cùng (đã trừ KM nếu có)
              originalPrices: [], // Giá gốc (để gạch ngang)
              
              // Lưu thông tin discount đầu tiên tìm thấy hợp lệ để hiển thị countdown
              discountData: null, 
              
              totalStock: 0,
              isHot: false,
              sizes: [] 
            };
          }

          const group = colorGroups[colorId];

          // --- LOGIC CHECK DISCOUNT ---
          let finalPrice = v.price;
          let isDiscountActive = false;

          // Parse ngày (nếu có)
          const startDate = v.discount_start_date ? new Date(v.discount_start_date) : null;
          const endDate = v.discount_end_date ? new Date(v.discount_end_date) : null;

          // Điều kiện giảm giá hợp lệ: Có giá giảm + Thời gian hợp lệ
          if (v.discount_price && 
              (!startDate || startDate <= now) && 
              (!endDate || endDate >= now)) {
              
              finalPrice = v.discount_price;
              isDiscountActive = true;

              // Lưu lại thông tin discount này vào group để trả về frontend
              // (Chỉ lưu lần đầu hoặc ưu tiên discount sâu nhất tùy bạn - ở đây lưu cái đầu tiên tìm thấy)
              if (!group.discountData) {
                  group.discountData = {
                      price: v.discount_price,
                      startDate: v.discount_start_date,
                      endDate: v.discount_end_date
                  };
              }
          }

          // Push dữ liệu vào mảng tính toán
          group.finalPrices.push(finalPrice);
          group.originalPrices.push(v.price);
          group.totalStock += v.stock;
          group.sizes.push({ size: v.size?.name, stock: v.stock });

          if (v.hottrend) group.isHot = true;
        });

        // Hoàn thiện object hiển thị
        Object.values(colorGroups).forEach(group => {
            const minFinal = Math.min(...group.finalPrices);
            const maxFinal = Math.max(...group.finalPrices);
            const minOriginal = Math.min(...group.originalPrices);
            const maxOriginal = Math.max(...group.originalPrices);

            // Xóa mảng tạm
            delete group.finalPrices;
            delete group.originalPrices;

            // 1. Giá bán hiển thị (Số to đậm)
            group.price = minFinal; 

            // 2. Giá gốc hiển thị (Số gạch ngang - chỉ hiện nếu có chênh lệch)
            if (minFinal < minOriginal) {          
                // Tính % giảm giá (cho badge -xx%)
                group.discountPercent = Math.round(((minOriginal - minFinal) / minOriginal) * 100);
            } else {
                group.discountPercent = null;
            }

            // 3. Các trường discount cụ thể bạn yêu cầu
            // Nếu có ít nhất 1 variant trong nhóm màu này đang giảm giá -> trả về info
            if (group.discountData) {
                group.discount_price = group.discountData.price;
                // group.discount_start_date = group.discountData.startDate;
                // group.discount_end_date = group.discountData.endDate;
            } else {
                group.discount_price = null;
                // group.discount_start_date = null;
                // group.discount_end_date = null;
            }
            delete group.discountData; // Cleanup

            // Chỉ hiển thị nếu còn hàng (Tùy chọn)
            // if (group.totalStock > 0) 
            displayItems.push(group);
        });
      });

      // 3. THUẬT TOÁN SẮP XẾP & INTERLEAVING (Giữ nguyên)
      const hotItems = displayItems.filter(i => i.isHot);
      const normalItems = displayItems.filter(i => !i.isHot);

      const interleave = (items) => {
        const groups = items.reduce((acc, item) => {
          (acc[item.productId] = acc[item.productId] || []).push(item);
          return acc;
        }, {});
        const groupedArrays = Object.values(groups);
        const result = [];
        const maxLen = Math.max(...groupedArrays.map(arr => arr.length));
        for (let i = 0; i < maxLen; i++) {
          for (let group of groupedArrays) {
            if (group[i]) result.push(group[i]);
          }
        }
        return result;
      };

      const finalResult = [...interleave(hotItems), ...interleave(normalItems)];

      // 4. PAGINATION (Giữ nguyên)
      const page = ctx.query.page ? parseInt(ctx.query.page) : 1;
      const pageSize = ctx.query.pageSize ? parseInt(ctx.query.pageSize) : 20;
      const start = (page - 1) * pageSize;
      const paginatedItems = finalResult.slice(start, start + pageSize);

      return {
        data: paginatedItems,
        meta: {
          pagination: {
            page, pageSize, total: finalResult.length,
            pageCount: Math.ceil(finalResult.length / pageSize)
          }
        }
      };

    } catch (err) {
      ctx.body = err;
    }
  }
}));