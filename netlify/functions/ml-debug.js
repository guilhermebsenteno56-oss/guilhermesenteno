const { getValidAccessToken } = require('./lib/ml-token');

// TEMPORARIO: diagnostico. Apagar depois de usar.
exports.handler = async () => {
  try {
    const { accessToken, sellerId } = await getValidAccessToken();
    const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const searchUrl =
      `https://api.mercadolibre.com/orders/search?seller=${encodeURIComponent(sellerId)}` +
      `&order.date_created.from=${encodeURIComponent(since)}&limit=10&sort=date_desc`;
    const searchRes = await fetch(searchUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    const searchData = await searchRes.json();
    const results = searchData.results || [];

    const out = [];
    for (const r of results) {
      try {
        const orderRes = await fetch(`https://api.mercadolibre.com/orders/${r.id}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const order = await orderRes.json();
        const items = order.order_items || [];
        const fee = items.reduce((s, it) => s + (Number(it.sale_fee) || 0) * (it.quantity || 1), 0);
        const shippingId = order.shipping && order.shipping.id;
        let shipCost = null, shipErr = null;
        if (shippingId) {
          try {
            const cRes = await fetch(`https://api.mercadolibre.com/shipments/${shippingId}/costs`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (cRes.ok) shipCost = await cRes.json();
            else shipErr = 'status ' + cRes.status + ': ' + (await cRes.text());
          } catch (e) { shipErr = String(e); }
        }
        out.push({
          order_id: order.id,
          title: items[0] && items[0].item && items[0].item.title,
          total_amount: order.total_amount,
          sale_fee_raw: items[0] && items[0].sale_fee,
          fee_computed: fee,
          shippingId,
          shipCostSenders: shipCost && shipCost.senders,
          shipErr,
        });
      } catch (e) {
        out.push({ order_id: r.id, error: String(e) });
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(out, null, 2),
    };
  } catch (err) {
    return { statusCode: 500, body: 'Erro: ' + String(err) };
  }
};
