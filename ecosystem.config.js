// PM2 Ecosystem Configuration for DeviceMon Web
// This configuration works on Linux, macOS, and Windows
module.exports = {
  apps: [{
    name: 'devicemon-web',
    script: './dist/server/index.js',

    // Process management
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',

    // Environment variables
    env: {
      NODE_ENV: 'production',
      PORT: 3002
    },

    // Logging
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    combine_logs: true,
    merge_logs: true,

    // Advanced options
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000,

    // Graceful shutdown
    kill_timeout: 5000,
    wait_ready: false,
    listen_timeout: 3000
  }]
};
