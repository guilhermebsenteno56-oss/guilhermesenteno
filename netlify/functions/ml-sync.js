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
    // 90 dias pra tambem atualizar pedidos antigos (ex: com a taxa do ML
    // recalculada) quando a Ana Paula clicar em "Sincronizar agora".
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const limit = 50;
    let offset = 0;
    let total = 0;
    let synced = 0;

    do {
      const searchUrl =
        `https://api.mercadolibre.com/orders/search?seller=${encodeURIComponent(sellerId)}` +
        `&order.date_created.from=${encodeURIComponent(since)}` +
        `&limit=${limit}&offset=${offset}`;
      const res = await fetch(searchUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      const data = await res.json();
      const orders = data.results || [];
      total = (data.paging && data.paging.total) || orders.length;

      // Busca em paralelo (cada pedido precisa de 2 chamadas extras na API
      // do ML pra pegar a taxa e o custo do frete), senao demora demais e
      // a funcao pode estourar o tempo limite.
      const results = await Promise.allSettled(
        orders.map((order) => saveOrder(order.id, accessToken))
      );
      synced += results.filter((r) => r.status === 'fulfilled').length;

      offset += limit;
    } while (offset < total && offset < 500);

    return { statusCode: 200, body: `Sincronizados ${synced} pedidos dos ultimos 90 dias.` };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: 'Erro: ' + String(err) };
  }
};
