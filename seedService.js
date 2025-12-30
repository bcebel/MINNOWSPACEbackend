// server/seedService.js - UPDATED TO REACTIVE "SEED BOOSTER"
import WebTorrent from "webtorrent";
import fs from "fs/promises";
import path from "path";

class ReactiveSeedBooster {
  constructor() {
    this.client = new WebTorrent({ maxConns: 100 });
    // chunkId -> { torrent, checkInterval, isHeader, filePath }
    this.activeTorrents = new Map();
    console.log("🎯 Reactive Seed Booster started (Peer-Aware)");
  }

  /**
   * Main method: start seeding a chunk and monitor its swarm health.
   * Will automatically stop seeding when the chunk has enough peers.
   */
  async boostChunkIfNeeded(filePath, chunkId, announceUrls) {
    // If already boosting this chunk, do nothing
    if (this.activeTorrents.has(chunkId)) {
      console.log(`⏭️ Already boosting chunk ${chunkId}. Skipping.`);
      const job = this.activeTorrents.get(chunkId);
      return job.torrent.magnetURI;
    }

    const torrentOptions = {
      announce: announceUrls,
      name: `chunk-${chunkId}`,
    };

    return new Promise((resolve) => {
      this.client.seed(filePath, torrentOptions, (torrent) => {
        console.log(
          `🔍 Monitoring chunk ${chunkId}. Initial peers: ${torrent.numPeers}`
        );

        // Determine if this is a header chunk (contains '-1' in ID)
        const isHeader = chunkId.includes("-1");

        const boosterJob = {
          torrent: torrent,
          isHeader: isHeader,
          filePath: filePath,
          // Start a periodic health check for non-header chunks
          checkInterval: null,
        };

        // HEADER: Keep forever. REGULAR: Start health checks.
        if (!boosterJob.isHeader) {
          boosterJob.checkInterval = setInterval(() => {
            this._evaluateSwarmHealth(chunkId, torrent);
          }, 30000); // Check every 30 seconds
        } else {
          console.log(
            `🎯 Header chunk ${chunkId} detected. Will seed indefinitely.`
          );
        }

        this.activeTorrents.set(chunkId, boosterJob);
        resolve(torrent.magnetURI);
      });
    });
  }

  /**
   * Core logic: Decide whether to keep or stop seeding based on peer count.
   */
  _evaluateSwarmHealth(chunkId, torrent) {
    const totalPeers = torrent.numPeers;
    const job = this.activeTorrents.get(chunkId);
    if (!job) return;

    // DECISION MATRIX
    if (totalPeers === 0) {
      console.log(
        `🆘 Chunk ${chunkId} has 0 peers! Staying alive as critical backup.`
      );
    } else if (totalPeers >= 5) {
      console.log(
        `✅ Chunk ${chunkId} has ${totalPeers} peers. Swarm healthy. STOPPING BOOST.`
      );
      this._stopBoosting(chunkId, "healthy swarm");
    } else if (totalPeers >= 3) {
      console.log(
        `🟡 Chunk ${chunkId} has ${totalPeers} peers. Getting there...`
      );
    } else {
      console.log(`🔵 Chunk ${chunkId} has ${totalPeers} peers. Still needed.`);
    }
  }

  /**
   * Cleanly stop boosting a chunk and clean up resources.
   */
  async _stopBoosting(chunkId, reason) {
    const job = this.activeTorrents.get(chunkId);
    if (!job) return;

    // Clear the health check interval
    if (job.checkInterval) {
      clearInterval(job.checkInterval);
    }

    // Remove from WebTorrent client
    this.client.remove(job.torrent.infoHash);

    // Try to delete the temporary file
    try {
      await fs.unlink(job.filePath);
      console.log(`🧹 Deleted temp file: ${path.basename(job.filePath)}`);
    } catch (err) {
      // File might already be gone; ignore
    }

    this.activeTorrents.delete(chunkId);
    console.log(`⏹️ Stopped boosting chunk ${chunkId} (${reason})`);
  }

  /**
   * Manual cleanup for an entire stream session.
   * Call this when a stream ends to clean up all its chunks.
   */
  async stopStreamBoost(sessionId) {
    const chunksToRemove = [];

    for (const [chunkId, job] of this.activeTorrents.entries()) {
      if (chunkId.startsWith(sessionId)) {
        chunksToRemove.push(chunkId);
      }
    }

    console.log(
      `🧼 Stopping boost for ${chunksToRemove.length} chunks from stream ${sessionId}`
    );

    for (const chunkId of chunksToRemove) {
      await this._stopBoosting(chunkId, "stream ended");
    }
  }

  /**
   * Get status for monitoring (useful for a dashboard or health endpoint).
   */
  getStatus() {
    const status = {
      activeTorrents: this.activeTorrents.size,
      totalPeers: 0,
      bySession: {},
    };

    for (const [chunkId, job] of this.activeTorrents.entries()) {
      const peerCount = job.torrent.numPeers;
      status.totalPeers += peerCount;

      // Extract sessionId from chunkId (format: "sessionId-chunkIndex")
      const sessionId = chunkId.split("-").slice(0, -1).join("-");
      if (!status.bySession[sessionId]) {
        status.bySession[sessionId] = { chunks: 0, peers: 0, headers: 0 };
      }
      status.bySession[sessionId].chunks++;
      status.bySession[sessionId].peers += peerCount;
      if (job.isHeader) status.bySession[sessionId].headers++;
    }

    return status;
  }

  /**
   * Emergency cleanup - stops everything.
   */
  destroy() {
    console.log("🛑 Shutting down ReactiveSeedBooster...");

    for (const [chunkId, job] of this.activeTorrents.entries()) {
      if (job.checkInterval) clearInterval(job.checkInterval);
      this.client.remove(job.torrent.infoHash);
    }

    this.activeTorrents.clear();
    this.client.destroy();
  }
}

// Export a singleton instance
export const reactiveBooster = new ReactiveSeedBooster();
