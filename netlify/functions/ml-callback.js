const { setDoc } = require('./lib/firestore');

// O Mercado Livre volta pra ca depois que a Ana Paula autoriza o app.
// Troca o "code" por um access_token + refresh_token e guarda no Firestore.
exports.handler = async (event) => {
  const code = event.queryStringParameters && event.queryStringParameters.code;
  if (!code) {
    return { statusCode: 400, body: 'Codigo de autorizacao ausente na URL.' };
  }

  const clientId = process.env.ML_CLIENT_ID;
  const clientSecret = process.env.ML_CLIENT_SECRET;
  const painelId = process.env.PAINEL_ID;
  const siteUrl = process.env.SITE_URL || `https://${event.headers.host}`;
  const redirectUri = `${siteUrl}/.netlify/functions/ml-callback`;

  if (!clientId || !clientSecret || !painelId) {
    return { statusCode: 500, body: 'Variaveis de ambiente faltando (ML_CLIENT_ID / ML_CLIENT_SECRET / PAINEL_ID).' };
  }

  try {
    const tokenRes = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return { statusCode: 400, body: 'Falha ao obter token do Mercado Livre: ' + JSON.stringify(tokenData) };
    }

    await setDoc(`painel/${painelId}/meta/ml_tokens`, {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || '',
      user_id: String(tokenData.user_id || ''),
      expires_in: tokenData.expires_in,
      obtained_at: Date.now(),
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body:
        '<html><body style="font-family:sans-serif;padding:48px;text-align:center;background:#1E1E1C;color:#E7E5D8">' +
        '<h2>Mercado Livre conectado com sucesso!</h2>' +
        '<p>Pode fechar esta aba e voltar para o painel.</p>' +
        '</body></html>',
    };
  } catch (err) {
    return { statusCode: 500, body: 'Erro: ' + String(err) };
  }
};
