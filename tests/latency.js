const http = require('http');

const PORT = 8080;
const TEST_TOKEN = process.env.TEST_TOKEN || 'test-token'; // Assume a valid token or bypass auth for this script if running in dev
const NUM_REQUESTS = 100;
const ENDPOINT = '/api/vitals'; 

async function makeRequest() {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const req = http.get({
      hostname: 'localhost',
      port: PORT,
      path: ENDPOINT,
      headers: { 'Authorization': `Bearer ${TEST_TOKEN}` }
    }, (res) => {
      res.on('data', () => {}); // Consume stream
      res.on('end', () => {
        resolve(performance.now() - start);
      });
    });

    req.on('error', (e) => reject(e));
  });
}

async function runBenchmark() {
  console.log(`Starting benchmark against ${ENDPOINT} with ${NUM_REQUESTS} requests...`);
  
  const latencies = [];
  
  // Warmup
  try {
    await makeRequest();
  } catch(e) {
    console.error("Failed to connect to server. Ensure it's running on port 8080 and auth is bypassed/valid for token.");
    process.exit(1);
  }

  for (let i = 0; i < NUM_REQUESTS; i++) {
    try {
      const lat = await makeRequest();
      latencies.push(lat);
    } catch (err) {
      console.error('Request failed');
    }
  }

  latencies.sort((a, b) => a - b);
  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  
  console.log('--- Benchmark Results ---');
  console.log(`Average Latency: ${avg.toFixed(2)} ms`);
  console.log(`p95 Latency:     ${p95.toFixed(2)} ms`);
  console.log(`p99 Latency:     ${p99.toFixed(2)} ms`);
  console.log(`Min Latency:     ${latencies[0].toFixed(2)} ms`);
  console.log(`Max Latency:     ${latencies[latencies.length - 1].toFixed(2)} ms`);
}

runBenchmark();
