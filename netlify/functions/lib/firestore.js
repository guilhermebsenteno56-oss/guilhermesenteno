// Cliente minimalista para o Firestore via REST, usando uma conta de servico
// do Firebase (FIREBASE_SERVICE_ACCOUNT). Nao depende de nenhum pacote externo:
// usa so 'crypto' (built-in do Node) e fetch (built-in no runtime do Netlify).
const crypto = require('crypto');

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

let cachedToken = null; // { accessToken, projectId, expiresAt }

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken;
  }
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!saJson) throw new Error('FIREBASE_SERVICE_ACCOUNT nao configurado nas variaveis de ambiente.');
  const sa = JSON.parse(saJson);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const unsigned = base64url(JSON.stringify(header)) + '.' + base64url(JSON.stringify(claim));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer
    .sign(sa.private_key)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const jwt = unsigned + '.' + signature;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error('Falha ao obter access token do Firebase: ' + JSON.stringify(data));
  }
  cachedToken = {
    accessToken: data.access_token,
    projectId: sa.project_id,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
  return cachedToken;
}

function toFirestoreValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFirestoreValue) } };
  if (typeof v === 'object') return { mapValue: { fields: toFirestoreFields(v) } };
  return { stringValue: String(v) };
}
function toFirestoreFields(obj) {
  const fields = {};
  for (const k in obj) fields[k] = toFirestoreValue(obj[k]);
  return fields;
}
function fromFirestoreValue(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return parseInt(v.integerValue, 10);
  if ('doubleValue' in v) return v.doubleValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFirestoreValue);
  if ('mapValue' in v) return fromFirestoreFields(v.mapValue.fields || {});
  return null;
}
function fromFirestoreFields(fields) {
  const obj = {};
  for (const k in fields) obj[k] = fromFirestoreValue(fields[k]);
  return obj;
}

async function getDoc(path) {
  const { accessToken, projectId } = await getAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 404) return null;
  const data = await res.json();
  if (!data.fields) return null;
  return fromFirestoreFields(data.fields);
}

async function setDoc(path, obj, options) {
  const { accessToken, projectId } = await getAccessToken();
  let url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
  // merge:true faz um PATCH parcial (so os campos passados em obj sao
  // gravados; os demais campos que ja existiam no documento continuam la).
  // Sem isso, um PATCH do Firestore sobrescreve o documento inteiro -- e era
  // isso que apagava o custo/imposto que o usuario preenchia manualmente
  // toda vez que o pedido era sincronizado de novo.
  if (options && options.merge) {
    const mask = Object.keys(obj)
      .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
      .join('&');
    url += `?${mask}`;
  }
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFirestoreFields(obj) }),
  });
  const data = await res.json();
  if (data.error) throw new Error('Erro ao gravar no Firestore: ' + JSON.stringify(data.error));
  return data;
}

async function listDocs(collectionPath, pageSize) {
  const { accessToken, projectId } = await getAccessToken();
  let url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionPath}`;
  if (pageSize) url += `?pageSize=${pageSize}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json();
  if (!data.documents) return [];
  return data.documents.map((d) => ({
    id: d.name.split('/').pop(),
    ...fromFirestoreFields(d.fields || {}),
  }));
}

module.exports = { getDoc, setDoc, listDocs, getAccessToken };
