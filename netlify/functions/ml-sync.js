const { getValidAccessToken } = require('./lib/ml-token');
const { getDoc } = require('./lib/firestore');
const { saveOrder } = require('./lib/save-order');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Processa os pedidos aos poucos (nao todos de uma vez). Cada pedido precisa
// de 2 chamadas extras na API do Mercado Livre (taxa + frete), e disparar
// tudo em paralelo de uma vez fazia a API do ML recusar parte das chamadas
// (limite de requisicoes), e o pedido ficava com os dados antigos sem avisar
// ninguem. Com lotes pequenos e uma nova tentativa em caso de erro, isso nao
// acontece mais.
async function saveOrdersInBatches(orderIds, accessToken, batchSize) {
  let ok = 0;
  const failed = [];
  for (let i = 0; i < orderIds.length; i += batchSize) {
    const batch = orderIds.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (id) => {
        try {
          await saveOrder(id, accessToken);
        } catch (err) {
          // uma segunda tentativa, depois de uma pequena pausa
          await sleep(500);
          await saveOrder(id, accessToken);
        }
      })
    );
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') ok++;
      else failed.push({ id: batch[idx], err: String(r.reason) });
    });
  }
  return { ok, failed };
}

// Busca os pedidos dos ultimos 90 dias na API do Mercado Livre (os mais
// recentes primeiro) e salva no Firestore. Serve pra recuperar pedidos que o
// webhook perdeu, e pode ser chamada manualmente (abrindo a URL da funcao,
// ou clicando em "Sincronizar agora" no painel).
exports.handler = async () => {
  try {
    const painelId = process.env.PAINEL_ID;
    const tokens = await getDoc(`painel/${painelId}/meta/ml_tokens`);
    if (!tokens || !tokens.access_token) {
      return { statusCode: 200, body: 'Mercado Livre ainda nao foi conectado.' };
    }

    const { accessToken, sellerId } = await getValidAccessToken();
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const limit = 50;
    let offset = 0;
    let total = 0;
    let synced = 0;
    const allFailed = [];

    do {
      const searchUrl =
        `https://api.mercadolibre.com/orders/search?seller=${encodeURIComponent(sellerId)}` +
        `&order.date_created.from=${encodeURIComponent(since)}` +
        `&sort=date_desc&limit=${limit}&offset=${offset}`;
      const res = await fetch(searchUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      const data = await res.json();
      const orders = data.results || [];
      total = (data.paging && data.paging.total) || orders.length;

      const { ok, failed } = await saveOrdersInBatches(
        orders.map((o) => o.id),
        accessToken,
        8
      );
      synced += ok;
      allFailed.push(...failed);

      offset += limit;
    } while (offset < total && offset < 500);

    const msg = `Sincronizados ${synced} pedidos dos ultimos 90 dias.` +
      (allFailed.length ? ` ${allFailed.length} pedido(s) falharam e serao tentados na proxima sincronizacao.` : '');
    if (allFailed.length) console.error('Pedidos que falharam:', allFailed);
    return { statusCode: 200, body: msg };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: 'Erro: ' + String(err) };
  }
};
