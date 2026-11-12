// PM2 (VPS): `pm2 start ecosystem.config.cjs && pm2 save`. Carrega variáveis do .env via dotenv no próprio código.
module.exports = {
  apps: [
    {
      name: 'regnus-worker',
      script: 'node_modules/tsx/dist/cli.mjs',
      args: 'src/worker/main.ts',
      cwd: __dirname,
      env: { NODE_ENV: 'production', GEOCODE: process.env.GEOCODE || '0' },
      max_memory_restart: '700M',
      autorestart: true,
      restart_delay: 10000,
      time: true,
    },
  ],
};
