const fs = require('fs');
const path = require('path');

// Read the indexers configuration
const configPath = path.join(__dirname, 'indexers.json');
const rawConfig = fs.readFileSync(configPath, 'utf-8');
const config = JSON.parse(rawConfig);

const apps = config.indexers.map((indexer) => {
  return {
    name: indexer.name,
    script: indexer.script,
    instances: indexer.instances || 1,
    exec_mode: 'cluster', // or 'fork' depending on your node script
    
    // Auto-healing / Watchcat settings
    max_memory_restart: '200M', // Auto-restart if memory exceeds 200MB (adjust as needed)
    exp_backoff_restart_delay: 100, // Wait 100ms before restarting, up to hours for continuous crashes
    
    // Graceful Stop
    kill_timeout: 5000, // Grant 5 seconds to gracefully stop indexer before forced kill
    wait_ready: true, // Application should emit 'ready' event to PM2
    listen_timeout: 10000, 

    // Logging
    out_file: `./logs/${indexer.name}-out.log`,
    error_file: `./logs/${indexer.name}-error.log`,
    merge_logs: true,

    // Environment variables
    // PM2 will also inject variables from `.env` file if started with `--update-env`
    env: {
      NODE_ENV: 'development',
      ...indexer.env
    },
    env_production: {
      NODE_ENV: 'production',
      ...indexer.env
    }
  };
});

// Optionally include the healthd monitor natively in the ecosystem
apps.push({
  name: 'process-manager-healthd',
  script: './healthd.js',
  instances: 1,
  exec_mode: 'fork',
  max_memory_restart: '100M',
  out_file: `./logs/healthd-out.log`,
  error_file: `./logs/healthd-error.log`,
  env: {
    NODE_ENV: 'production',
    PORT: 3000
  }
});

module.exports = { apps };
