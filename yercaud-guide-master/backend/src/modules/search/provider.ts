import { config } from "../../config.js";

/**
 * The one new seam introduced by the search engine (issue #11).
 *
 * Everything that needs an embedding — the reconcile job embedding documents,
 * the search route embedding a query — depends on this narrow interface, never
 * on Azure directly. Production resolves it from config (`fromConfig`); tests
 * inject a deterministic fake. An *absent* provider (null) is a first-class
 * state, not an error: it's the "no credentials" case, and it's what makes the
 * whole semantic leg optional — search degrades to lexical-only and the test
 * suite runs with no Azure access.
 */
export interface EmbeddingProvider {
  /** Embed a batch. Returns one vector per input, in the same order. */
  embed(texts: string[]): Promise<number[][]>;
}

/** text-embedding-3-small's native width — matches the migration's vector(1536). */
export const EMBEDDING_DIMENSIONS = 1536;

interface AzureEmbeddingResponse {
  data: { embedding: number[]; index: number }[];
}

/**
 * Azure OpenAI embeddings over its REST API. Batches: the endpoint accepts an
 * array of inputs and returns a vector per input, which is what lets the
 * reconcile job embed many documents in one round-trip.
 */
class AzureEmbeddingProvider implements EmbeddingProvider {
  constructor(
    private readonly endpoint: string,
    private readonly apiKey: string,
    private readonly deployment: string,
    private readonly apiVersion: string,
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const base = this.endpoint.replace(/\/$/, "");
    const url = `${base}/openai/deployments/${this.deployment}/embeddings?api-version=${this.apiVersion}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "api-key": this.apiKey, "content-type": "application/json" },
      body: JSON.stringify({ input: texts }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Azure embeddings failed (${response.status}): ${detail.slice(0, 200)}`);
    }
    const body = (await response.json()) as AzureEmbeddingResponse;
    // Azure returns results with an `index`; sort by it rather than trusting
    // array order, so a vector never lands against the wrong input.
    return body.data.slice().sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }
}

/**
 * Build the provider from config, or null when the required trio
 * (endpoint/apiKey/deployment) isn't fully set. Null is the signal to run
 * lexical-only — callers check for it rather than catching a config error.
 */
export function embeddingProviderFromConfig(): EmbeddingProvider | null {
  const { endpoint, apiKey, deployment, apiVersion } = config.azureEmbeddings;
  if (!endpoint || !apiKey || !deployment) return null;
  return new AzureEmbeddingProvider(endpoint, apiKey, deployment, apiVersion);
}
