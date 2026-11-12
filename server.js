'use strict';

// Servidor de produção (padrão do house-flipping-app na Hostinger): abre a porta antes de preparar o Next.js.
const { createServer } = require('http');
const fs = require('fs');
const path = require('path');

const dev = process.env.NODE_ENV === 'development';
if (!dev) process.env.NODE_ENV = 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);
let handle;

const server = createServer(async (req, res) => {
  if (!handle) {
    res.writeHead(503, { 'Retry-After': '3', 'Cache-Control': 'no-store' });
    return res.end('Aplicação inicializando. Tente novamente em instantes.');
  }
  try { await handle(req, res); }
  catch (error) {
    console.error('Erro ao processar requisição:', error);
    if (!res.headersSent) { res.statusCode = 500; res.end('Internal Server Error'); }
    else res.destroy();
  }
});
server.on('error', (error) => { console.error('Erro no servidor HTTP:', error); process.exit(1); });
server.listen(port, hostname, () => console.log(`> Servidor HTTP em http://${hostname}:${port}`));

(async () => {
  if (!dev && !fs.existsSync(path.join(__dirname, '.next/BUILD_ID'))) {
    throw new Error('Build de produção ausente. Configure "npm run build" na etapa de build do deploy.');
  }
  const started = Date.now();
  const app = require('next')({ dev, hostname, port });
  await app.prepare();
  handle = app.getRequestHandler();
  console.log(`> Aplicação pronta em ${Date.now() - started} ms.`);
})().catch((error) => {
  console.error('Erro fatal ao iniciar o Next.js:', error.message);
  server.close(() => process.exit(1));
});
