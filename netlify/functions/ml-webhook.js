const { getValidAccessToken } = require('./lib/ml-token');
const { saveOrder } = require('./lib/save-order');

// O Mercado Livre chama essa URL toda vez que um pedido novo (ou atualizado)
// acontece. Busca o pedido completo e salva no Firestore.
exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    if (body.topic !== 'orders_v2' || !body.resource) {
      return { statusCode: 200, body: 'ok' };
    }
    const { accessToken } = await getValidAccessToken();
    const orderRes = await fetch(`https://api.mercadolibre.com${body.resource}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const order = await orderRes.json();
    await saveOrder(order);
    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    console.error(err);
    // Sempre responde 200 pro Mercado Livre nao ficar reenviando a mesma notificacao.
    return { statusCode: 200, body: 'ok' };
  }
};
