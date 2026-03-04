import { checkStockAlerts } from './stockAlerts';

// Giả lập database (Prisma hoặc SQL)
// Trong thực tế, bạn sẽ import PrismaClient hoặc DB driver
const db = {
  order_items: {
    findMany: async (query: any) => [
      { product_id: 1, quantity: 2 },
      { product_id: 2, quantity: 1 }
    ]
  },
  bom: {
    findMany: async (query: any) => [
      { ingredient_id: 101, quantity_required: 50 }, // 50g cà phê
      { ingredient_id: 102, quantity_required: 200 } // 200ml sữa
    ]
  },
  ingredients: {
    update: async (query: any) => ({
      id: query.where.id,
      current_stock: 1000,
      safety_stock: 500
    }),
    findUnique: async (query: any) => ({
      id: query.where.id,
      name: 'Cà phê',
      current_stock: 400, // Dưới mức an toàn
      safety_stock: 500,
      unit: 'g'
    })
  }
};

// Queue đơn giản in-memory (có thể dùng BullMQ nếu có Redis)
const jobQueue: any[] = [];
let isProcessing = false;

/**
 * Xử lý trừ kho nguyên liệu dựa trên BOM
 */
async function processDeductions() {
  if (isProcessing || jobQueue.length === 0) return;
  isProcessing = true;

  while (jobQueue.length > 0) {
    const job = jobQueue.shift();
    if (!job) continue;

    try {
      const { orderId } = job;
      
      // 1. Fetch tất cả order_items cho đơn hàng này
      const items = await db.order_items.findMany({ where: { order_id: orderId } });
      
      for (const item of items) {
        // 2. Query BOM để lấy yêu cầu nguyên liệu cho sản phẩm này
        const boms = await db.bom.findMany({ where: { product_id: item.product_id } });
        
        for (const bom of boms) {
          // 3. Nhân: lượng nguyên liệu yêu cầu × số lượng sản phẩm
          const deductionAmount = bom.quantity_required * item.quantity;
          
          // 4. UPDATE ingredients SET current_stock = current_stock - X WHERE id = ingredient_id
          // Giả lập update
          await db.ingredients.update({
            where: { id: bom.ingredient_id },
            data: { current_stock: { decrement: deductionAmount } }
          });
          
          // 5. Sau mỗi lần trừ: kiểm tra xem current_stock < safety_stock không
          const updatedIngredient = await db.ingredients.findUnique({ where: { id: bom.ingredient_id } });
          
          if (updatedIngredient && updatedIngredient.current_stock < updatedIngredient.safety_stock) {
            // 6. Nếu dưới ngưỡng: kích hoạt cảnh báo
            await checkStockAlerts(updatedIngredient);
          }
        }
      }
      
      console.log(`[Worker] Đã xử lý trừ kho cho đơn hàng ${orderId}`);
    } catch (error) {
      console.error(`[Worker] Lỗi xử lý đơn hàng:`, error);
      // Có thể implement retry logic ở đây
    }
  }

  isProcessing = false;
}

/**
 * Trigger: Khi trạng thái đơn hàng chuyển sang 'completed'
 * Main thread: Đẩy job vào queue, trả về response ngay lập tức
 */
export function triggerInventoryDeduction(orderId: string) {
  jobQueue.push({ orderId });
  
  // Worker: xử lý trừ kho dưới background (không block main thread)
  setTimeout(processDeductions, 0);
}
