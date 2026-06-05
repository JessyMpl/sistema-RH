module.exports = {
  apps: [
    {
      name: 'biometrico-frontend',
      script: 'pnpm',
      args: 'run dev',
      cwd: '/var/www/html/sites/biometrico/frontend',
      interpreter: 'none',
      env: {
        NODE_ENV: 'development',
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,

      // --- Logs ---
      out_file: '/var/www/html/sites/biometrico/frontend/logs/app.log',
      error_file: '/var/www/html/sites/biometrico/frontend/logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
}
