const express = require('express');
const pm2 = require('pm2');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to the local PM2 daemon
pm2.connect((err) => {
  if (err) {
    console.error("Error connecting to PM2", err);
    process.exit(2);
  }
  console.log("Connected to PM2 daemon.");

  // Health API Endpoint
  app.get('/health', (req, res) => {
    pm2.list((err, processDescriptionList) => {
      if (err) {
        return res.status(500).json({ error: "Failed to fetch PM2 list" });
      }

      const formattedStats = processDescriptionList.map((proc) => {
        // Here we format the verbose process output into something clean
        return {
          id: proc.pm_id,
          name: proc.name,
          pid: proc.pid,
          status: proc.pm2_env.status,
          restarts: proc.pm2_env.restart_time,
          uptime: proc.pm2_env.pm_uptime ? (Date.now() - proc.pm2_env.pm_uptime) / 1000 : 0,
          memoryUsageMB: Math.round(proc.monit.memory / 1024 / 1024),
          cpuUsagePercent: proc.monit.cpu,
          
          // Mock fetch of "Block Height Lag" 
          // In reality, this might query your database, or query a Stellar Horizon API testnet
          // Or communicate via IPC with the process directly. For display, we will mock it:
          blockHeightLag: proc.name.includes('indexer') ? Math.floor(Math.random() * 5) : null
        };
      });

      res.json({
        timestamp: new Date().toISOString(),
        manager: "PM2",
        processes: formattedStats
      });
    });
  });

  // Watchcat Alerting Hook for Crashes (Crash Loops)
  pm2.launchBus((err, bus) => {
    if (err) {
      console.error("Error launching PM2 bus", err);
      return;
    }

    console.log("Listening to PM2 Events for Watchdog Alerting...");

    const recentRestarts = {};

    bus.on('process:event', (packet) => {
      if (packet.event === 'exit') {
        const pName = packet.process.name;
        const now = Date.now();

        if (!recentRestarts[pName]) recentRestarts[pName] = [];
        // Keep only restarts in the last 60 seconds
        recentRestarts[pName] = recentRestarts[pName].filter(time => now - time < 60000);
        recentRestarts[pName].push(now);

        // If an app crashed 3 times inside 60 seconds, alert!
        if (recentRestarts[pName].length >= 3) {
          sendAlert(`[CRITICAL] Watchdog Warning: Process ${pName} has crashed ${recentRestarts[pName].length} times in the last minute. Potential restart loop detected.`);
          // Reset array to avoid spamming
          recentRestarts[pName] = []; 
        }
      }
    });
  });
});

app.listen(PORT, () => {
  console.log(`Health Dashboard listening at http://localhost:${PORT}`);
});

// A function for sending out webhook notifications to Slack/Discord/etc.
function sendAlert(message) {
  console.error(message);
  // Example for Slack Webhook:
  // fetch(process.env.SLACK_WEBHOOK_URL, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ text: message })
  // }).catch(err => console.error("Alert delivery failed:", err));
}
