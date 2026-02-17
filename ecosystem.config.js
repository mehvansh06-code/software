module.exports = {
  apps: [
    {
      name: 'flotex-server',
      script: 'server.js',
      watch: false,
      env: {
        NODE_ENV: 'production'
      },
      max_memory_restart: '500M',
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
};
