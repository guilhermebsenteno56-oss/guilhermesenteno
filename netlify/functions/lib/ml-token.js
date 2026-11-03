const { getDoc, setDoc } = require('./firestore');

// Devolve um access_token valido do Mercado Livre, renovando com o
// refresh_token guardado no Firestore quando necessario.
async function getValidAccessToken() {
  const painelId = process.env.PAINEL_ID;
  if (!painelId) throw new Error('PAINEL_ID nao configurado.');
  const tokens = await getDoc(`painel/${painelId}/meta/ml_tokens`);
  if (!tokens || !tokens.access_token) {
    throw new Error('Conta do Mercado Livre ainda nao foi conectada (sem token salvo).');
  }

  const ageSec = (Date.now() - (tokens.obtained_at || 0)) / 1000;
  if (ageSec < (tokens.expires_in || 0) - 300) {
    return { accessToken: tokens.access_token, sellerId: tokens.user_id };
  }

  const clientId = process.env.ML_CLIENT_ID;
  const clientSecret = process.env.ML_CLIENT_SECRET;
  const res = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokens.refresh_token,
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error('Falha ao renovar token do Mercado Livre: ' + JSON.stringify(data));
  }

  await setDoc(`painel/${painelId}/meta/ml_tokens`, {
    access_token: data.access_token,
    refresh_token: data.refresh_token || tokens.refresh_token,
    user_id: tokens.user_id,
    expires_in: data.expires_in,
    obtained_at: Date.now(),
  });

  return { accessToken: data.access_token, sellerId: tokens.user_id };
}

module.exports = { getValidAccessToken };
