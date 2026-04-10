const crypto = require('crypto');

// The script simulates a Web3 indexer running, potentially slowly leaking memory,
// tracking its current block vs the network block.

// Send ready signal to PM2 (wait_ready: true in ecosystem)
if (process.send) {
  process.send('ready');
  console.log(`[${process.env.name}] App is ready.`);
}

let networkBlockHeight = 1000000;
let syncedBlockHeight = 999990; // Start with a small lag

const state = {
  dbConnections: [],
  processing: false
};

// Simulate Sync Loop
setInterval(() => {
  networkBlockHeight += Math.floor(Math.random() * 2); // Network produces blocks
  
  // Indexer syncs
  if (syncedBlockHeight < networkBlockHeight) {
    state.processing = true;
    syncedBlockHeight++;
    
    // Memory leak simulation (creates minor memory bloat to eventually test max_memory_restart)
    // Note: this takes a bit to hit 200MB, to test it quickly you can lower max_memory_restart to 50M
    // state.dbConnections.push(crypto.randomBytes(1024 * 1024)); // 1MB buffer

    state.processing = false;
  }
}, 2000);

// We can expose custom metrics to PM2 using `tx2` (formerly pmx),
// but we can also just expose it over an IPC message or local simple HTTP
// For this simple mock, we'll listen for IPC messages from PM2
process.on('message', (msg) => {
  if (msg === 'get_block_lag') {
    const lag = networkBlockHeight - syncedBlockHeight;
    process.send({
      type: 'process:msg',
      data: { lag: lag }
    });
  }
});

// Mock HTTP Server just to keep the process bound to a port (Optional for listeners)
const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end(`Indexer Lag: ${networkBlockHeight - syncedBlockHeight}`);
});
server.listen(0); // Random port

// Graceful Shutdown implementation
process.on('SIGINT', () => {
  console.log(`[${process.env.name}] SIGINT received. Performing Graceful Shutdown...`);
  
  // 1. Stop accepting new connections
  server.close();
  
  // 2. Wait for current blockchain transaction to finish processing
  const waitProcessing = setInterval(() => {
    if (!state.processing) {
      clearInterval(waitProcessing);
      console.log(`[${process.env.name}] Graceful Stop Complete. Exiting process.`);
      process.exit(0);
    }
  }, 100);

  // PM2 will forcefully kill us after `kill_timeout` (5000ms setup in ecosystem config)
});
