/**
 * contractService.js
 * ──────────────────────────────────────────────────────────────
 * Service layer for interacting with the on-chain Process Health
 * Registry Soroban smart contract from the Node.js health daemon.
 *
 * This module provides helper functions to:
 *   - Record process health heartbeats on-chain
 *   - Record crash-loop events on-chain
 *   - Query latest process health snapshots
 *   - Query crash event history
 * ──────────────────────────────────────────────────────────────
 */

require("dotenv").config();

const {
  Keypair,
  Contract,
  SorobanRpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  xdr,
  nativeToScVal,
  scValToNative,
  Address,
} = require("@stellar/stellar-sdk");

// ─── Configuration ──────────────────────────────────────────

const SOROBAN_RPC_URL =
  process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE =
  process.env.STELLAR_NETWORK_PASSPHRASE ||
  Networks.TESTNET;
const CONTRACT_ID = process.env.SOROBAN_CONTRACT_ID || "";
const ADMIN_SECRET = process.env.STELLAR_ADMIN_SECRET || "";

const server = new SorobanRpc.Server(SOROBAN_RPC_URL);

// ─── Helpers ────────────────────────────────────────────────

/**
 * Build, simulate, sign, and submit a Soroban transaction.
 * Returns the result value (if any) once the tx is confirmed.
 */
async function submitTx(caller, operation) {
  const account = await server.getAccount(caller.publicKey());

  let tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(operation)
    .setTimeout(30)
    .build();

  // Simulate to get the authorisation + resource footprint
  const simulated = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(simulated)) {
    throw new Error(`Simulation failed: ${simulated.error}`);
  }

  // Assemble a ready-to-submit transaction
  tx = SorobanRpc.assembleTransaction(tx, simulated).build();
  tx.sign(caller);

  const sent = await server.sendTransaction(tx);
  if (sent.status === "ERROR") {
    throw new Error(`Send failed: ${JSON.stringify(sent.errorResult)}`);
  }

  // Poll for confirmation
  let result;
  let attempts = 0;
  while (attempts < 30) {
    result = await server.getTransaction(sent.hash);
    if (result.status === "SUCCESS") {
      return result.returnValue ? scValToNative(result.returnValue) : null;
    }
    if (result.status === "FAILED") {
      throw new Error(`Transaction failed: ${JSON.stringify(result)}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
    attempts++;
  }
  throw new Error("Transaction confirmation timed out");
}

/**
 * Build a contract call operation.
 */
function buildCallOp(method, args = []) {
  const contract = new Contract(CONTRACT_ID);
  return contract.call(method, ...args);
}

// ─── Write Operations ───────────────────────────────────────

/**
 * Record a health heartbeat on-chain for one managed process.
 *
 * @param {Object} params
 * @param {string} params.processName - e.g. "stellar-mainnet-indexer"
 * @param {number} params.status      - 0=online 1=stopping 2=stopped 3=errored
 * @param {number} params.restartCount
 * @param {number} params.uptimeSecs
 * @param {number} params.memoryMb
 * @param {number} params.cpuPct
 * @param {number} params.blockLag
 * @returns {Promise<number>} The sequential on-chain record ID
 */
async function recordHealth({
  processName,
  status,
  restartCount,
  uptimeSecs,
  memoryMb,
  cpuPct,
  blockLag,
}) {
  if (!CONTRACT_ID || !ADMIN_SECRET) {
    console.warn("[contractService] Skipping on-chain write — not configured.");
    return null;
  }

  const caller = Keypair.fromSecret(ADMIN_SECRET);
  const op = buildCallOp("record_health", [
    nativeToScVal(processName, { type: "string" }),
    nativeToScVal(status, { type: "u32" }),
    nativeToScVal(restartCount, { type: "u32" }),
    nativeToScVal(uptimeSecs, { type: "u64" }),
    nativeToScVal(memoryMb, { type: "u32" }),
    nativeToScVal(cpuPct, { type: "u32" }),
    nativeToScVal(blockLag, { type: "u32" }),
  ]);

  return submitTx(caller, op);
}

/**
 * Record a crash-loop alert on-chain.
 *
 * @param {Object} params
 * @param {string} params.processName
 * @param {number} params.crashCount
 * @param {string} params.alertMessage
 * @returns {Promise<number>} The sequential on-chain crash event ID
 */
async function recordCrash({ processName, crashCount, alertMessage }) {
  if (!CONTRACT_ID || !ADMIN_SECRET) {
    console.warn("[contractService] Skipping on-chain write — not configured.");
    return null;
  }

  const caller = Keypair.fromSecret(ADMIN_SECRET);
  const op = buildCallOp("record_crash", [
    nativeToScVal(processName, { type: "string" }),
    nativeToScVal(crashCount, { type: "u32" }),
    nativeToScVal(alertMessage, { type: "string" }),
  ]);

  return submitTx(caller, op);
}

// ─── Read Operations ────────────────────────────────────────

/**
 * Query the latest on-chain health snapshot for a process.
 *
 * @param {string} processName
 * @returns {Promise<Object>} HealthRecord
 */
async function getLatestHealth(processName) {
  if (!CONTRACT_ID) return null;

  const caller = Keypair.random();
  const op = buildCallOp("get_latest_health", [
    nativeToScVal(processName, { type: "string" }),
  ]);

  return submitTx(caller, op);
}

/**
 * Get total number of health records ever written.
 */
async function getRecordCount() {
  if (!CONTRACT_ID) return 0;

  const caller = Keypair.random();
  const op = buildCallOp("get_record_count");
  return submitTx(caller, op);
}

/**
 * Get all registered process names.
 */
async function getProcessNames() {
  if (!CONTRACT_ID) return [];

  const caller = Keypair.random();
  const op = buildCallOp("get_process_names");
  return submitTx(caller, op);
}

/**
 * Get total crash events recorded.
 */
async function getCrashCount() {
  if (!CONTRACT_ID) return 0;

  const caller = Keypair.random();
  const op = buildCallOp("get_crash_count");
  return submitTx(caller, op);
}

/**
 * Retrieve a specific crash event by ID.
 *
 * @param {number} crashId
 * @returns {Promise<Object>} CrashEvent
 */
async function getCrash(crashId) {
  if (!CONTRACT_ID) return null;

  const caller = Keypair.random();
  const op = buildCallOp("get_crash", [
    nativeToScVal(crashId, { type: "u64" }),
  ]);
  return submitTx(caller, op);
}

// ─── Exports ────────────────────────────────────────────────

module.exports = {
  recordHealth,
  recordCrash,
  getLatestHealth,
  getRecordCount,
  getProcessNames,
  getCrashCount,
  getCrash,
};
