const { setDoc } = require('./firestore');

// Salva (ou atualiza) um pedido do Mercado Livre no Firestore, em
// painel/{PAINEL_ID}/ml_orders/{order_id}. O painel le essa colecao
// para montar o relatorio do canal Mercado Livre.
async function saveOrder(order) {
  const painelId = process.env.PAINEL_ID;
  if (!painelId) throw new Error('PAINEL_ID nao configurado.');
  const dateStr = (order.date_created || '').slice(0, 10);
  if (!dateStr || !order.id) return;

  const item = order.order_items && order.order_items[0];
  const total = order.total_amount || 0;
  const shipping = (order.shipping && order.shipping.cost) || 0;

  // Soma a taxa de venda (comissao) que o Mercado Livre cobra em cada item do
  // pedido. O valor realmente recebido pelo vendedor e o total menos essa taxa.
  const items = order.order_items || [];
  const fee = items.reduce((sum, it) => sum + (Number(it.sale_fee) || 0) * (it.quantity || 1), 0);
  const netReceived = Math.max(0, total - fee);

  await setDoc(`painel/${painelId}/ml_orders/${order.id}`, {
    order_id: String(order.id),
    date: dateStr,
    title: item && item.item ? item.item.title : '',
    quantity: item ? item.quantity : 1,
    unit_price: item ? item.unit_price : total,
    total_amount: total,
    ml_fee: fee,
    net_received: netReceived,
    shipping_cost: shipping,
    status: order.status || '',
    synced_at: Date.now(),
  });
}

module.exports = { saveOrder };
