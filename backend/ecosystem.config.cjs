module.exports = {
  apps: [
    {
      name: 'biometrico-backend',
      script: 'index.js',
      cwd: '/var/www/html/sites/biometrico/backend',
      env: {
        NODE_ENV: 'development',
        PORT: 5176,
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,

      // --- Logs ---
      out_file: '/var/www/html/sites/biometrico/backend/logs/app.log',
      error_file: '/var/www/html/sites/biometrico/backend/logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
}
