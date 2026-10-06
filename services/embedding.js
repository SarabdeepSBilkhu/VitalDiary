/**
 * Embedding service — uses local @xenova/transformers for completely free,
 * on-device RAG vector embeddings. No API keys required.
 */
let pipeline;
// all-MiniLM-L6-v2 produces 384-dimensional embeddings
const EMBEDDING_DIM = 384;

/**
 * Lazy load the embedding pipeline.
 */
async function getPipeline() {
  if (!pipeline) {
    const { pipeline: loadPipeline } = await import('@xenova/transformers');
    // Load the feature extraction pipeline
    pipeline = await loadPipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return pipeline;
}

/**
 * Embed a single text string.
 * @param {string} text
 * @returns {Promise<Float32Array>}
 */
async function embed(text) {
  // In test environment, skip the actual model execution to avoid Jest Float32Array context issues
  if (process.env.NODE_ENV === 'test') {
    return new Float32Array(EMBEDDING_DIM);
  }

  try {
    const extractor = await getPipeline();
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    // Convert Tensor data to Float32Array
    return new Float32Array(output.data);
  } catch (err) {
    console.error('[embedding] Failed to generate embedding:', err);
    throw err;
  }
}

/**
 * Serialize Float32Array to Buffer for storage.
 */
function serialize(float32Array) {
  return Buffer.from(float32Array.buffer);
}

/**
 * Deserialize Buffer back to Float32Array.
 */
function deserialize(buffer) {
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
}

module.exports = { embed, serialize, deserialize, EMBEDDING_DIM };
