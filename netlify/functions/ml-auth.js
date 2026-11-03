// Ponto de entrada: leva a Ana Paula para a tela de autorizacao do
// Mercado Livre. O botao "Conectar Mercado Livre" do painel aponta pra ca.
exports.handler = async (event) => {
  const clientId = process.env.ML_CLIENT_ID;
  if (!clientId) {
    return { statusCode: 500, body: 'ML_CLIENT_ID nao configurado nas variaveis de ambiente do Netlify.' };
  }
  const siteUrl = process.env.SITE_URL || `https://${event.headers.host}`;
  const redirectUri = `${siteUrl}/.netlify/functions/ml-callback`;
  const authUrl =
    'https://auth.mercadolivre.com.br/authorization' +
    `?response_type=code&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}`;

  return {
    statusCode: 302,
    headers: { Location: authUrl },
  };
};
