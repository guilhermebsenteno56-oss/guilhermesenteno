const { setDoc } = require('./firestore');

// Busca o detalhe completo do custo do envio (o quanto o VENDEDOR paga desse
// frete, nao o que o comprador paga). Vem de um endpoint separado do pedido.
async function getSellerShippingCost(shippingId, accessToken) {
  if (!shippingId) return 0;
  try {
    const res = await fetch(`https://api.mercadolibre.com/shipments/${shippingId}/costs`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return 0;
    const data = await res.json();
    if (Array.isArray(data.senders)) {
      return data.senders.reduce((sum, s) => sum + (Number(s.cost) || 0), 0);
    }
    if (data.receiver && typeof data.receiver.cost === 'number' && data.senders == null) {
      // fallback defensivo: algumas respostas trazem só "receiver"
      return 0;
    }
    return 0;
  } catch (err) {
    console.error('Erro ao buscar custo do envio:', shippingId, err);
    return 0;
  }
}

// Busca o pedido completo na API (garante que order_items[].sale_fee venha
// preenchido — o endpoint de busca/listagem as vezes nao traz esse campo) e
// salva (ou atualiza) em painel/{PAINEL_ID}/ml_orders/{order_id}. O painel le
// essa colecao para montar o relatorio do canal Mercado Livre.
async function saveOrder(orderId, accessToken) {
  const painelId = process.env.PAINEL_ID;
  if (!painelId) throw new Error('PAINEL_ID nao configurado.');
  if (!orderId) return;

  const res = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const order = await res.json();
  if (!order || !order.id) return;

  const dateStr = (order.date_created || '').slice(0, 10);
  if (!dateStr) return;

  const item = order.order_items && order.order_items[0];
  const total = order.total_amount || 0;

  // Taxa/comissao que o Mercado Livre cobra em cada item do pedido.
  const items = order.order_items || [];
  const fee = items.reduce((sum, it) => sum + (Number(it.sale_fee) || 0) * (it.quantity || 1), 0);

  // Custo do frete que fica por conta do vendedor (quando o anuncio
  // subsidia o frete grátis, por exemplo). Vem de um endpoint separado.
  const shippingId = order.shipping && order.shipping.id;
  const shippingCost = await getSellerShippingCost(shippingId, accessToken);

  // Valor que realmente cai pro vendedor: total da venda menos a taxa do ML
  // e menos o frete que o vendedor paga.
  const netReceived = Math.max(0, total - fee - shippingCost);

  await setDoc(`painel/${painelId}/ml_orders/${order.id}`, {
    order_id: String(order.id),
    date: dateStr,
    title: item && item.item ? item.item.title : '',
    quantity: item ? item.quantity : 1,
    unit_price: item ? item.unit_price : total,
    total_amount: total,
    ml_fee: fee,
    shipping_cost: shippingCost,
    net_received: netReceived,
    status: order.status || '',
    synced_at: Date.now(),
  });
}

module.exports = { saveOrder };
