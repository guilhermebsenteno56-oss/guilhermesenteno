const { getValidAccessToken } = require('./lib/ml-token');
const { getDoc } = require('./lib/firestore');
const { saveOrder } = require('./lib/save-order');

// Busca os pedidos dos ultimos 7 dias na API do Mercado Livre e salva no
// Firestore. Serve pra recuperar pedidos que o webhook perdeu, e pode ser
// chamada manualmente (abrindo a URL da funcao) ou numa funcao agendada.
exports.handler = async () => {
  try {
    const painelId = process.env.PAINEL_ID;
    const tokens = await getDoc(`painel/${painelId}/meta/ml_tokens`);
    if (!tokens || !tokens.access_token) {
      return { statusCode: 200, body: 'Mercado Livre ainda nao foi conectado.' };
    }

    const { accessToken, sellerId } = await getValidAccessToken();
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const searchUrl =
      `https://api.mercadolibre.com/orders/search?seller=${encodeURIComponent(sellerId)}` +
      `&order.date_created.from=${encodeURIComponent(since)}`;

    const res = await fetch(searchUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json();
    const orders = data.results || [];

    for (const order of orders) {
      await saveOrder(order);
    }

    return { statusCode: 200, body: `Sincronizados ${orders.length} pedidos dos ultimos 7 dias.` };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: 'Erro: ' + String(err) };
  }
};
