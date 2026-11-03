const { getValidAccessToken } = require('./lib/ml-token');

// TEMPORARIO: so pra diagnosticar o formato real que a API do Mercado Livre
// devolve pra taxa de venda e custo de frete. Apagar depois de usar.
exports.handler = async () => {
  try {
    const { accessToken, sellerId } = await getValidAccessToken();
    const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const searchUrl =
      `https://api.mercadolibre.com/orders/search?seller=${encodeURIComponent(sellerId)}` +
      `&order.date_created.from=${encodeURIComponent(since)}&limit=1&sort=date_desc`;
    const searchRes = await fetch(searchUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    const searchData = await searchRes.json();
    const first = (searchData.results || [])[0];
    if (!first) return { statusCode: 200, body: 'Nenhum pedido encontrado nos ultimos 2 dias.' };

    const orderRes = await fetch(`https://api.mercadolibre.com/orders/${first.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const order = await orderRes.json();

    let shipmentCosts = null;
    let shipmentCostsErr = null;
    const shippingId = order.shipping && order.shipping.id;
    if (shippingId) {
      try {
        const costsRes = await fetch(`https://api.mercadolibre.com/shipments/${shippingId}/costs`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        shipmentCosts = await costsRes.json();
        if (!costsRes.ok) shipmentCostsErr = `status ${costsRes.status}`;
      } catch (e) {
        shipmentCostsErr = String(e);
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        {
          order_id: order.id,
          total_amount: order.total_amount,
          order_items: order.order_items,
          payments: order.payments,
          shipping: order.shipping,
          shippingId,
          shipmentCosts,
          shipmentCostsErr,
        },
        null,
        2
      ),
    };
  } catch (err) {
    return { statusCode: 500, body: 'Erro: ' + String(err) };
  }
};
