import { env, pipeline } from '@huggingface/transformers'

const MODEL_ID = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'
const BATCH_SIZE = 16

type SerializedTensor = number[] | number[][]

type EmbeddingExtractor = (
  input: string[],
  options: {
    pooling: 'mean'
    normalize: true
  },
) => Promise<{
  tolist: () => SerializedTensor
}>

type ProgressInfo = {
  status?: string
  progress?: number
}

const createPipeline = pipeline as unknown as (
  task: string,
  model: string,
  options: Record<string, unknown>,
) => Promise<EmbeddingExtractor>

env.allowLocalModels = false
env.useBrowserCache = true
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.proxy = false
}

let extractorPromise: Promise<EmbeddingExtractor> | null = null

export async function embedTexts(
  texts: string[],
  onProgress?: (detail: string) => void,
) {
  const extractor = await getExtractor(onProgress)
  const vectors: number[][] = []

  for (let start = 0; start < texts.length; start += BATCH_SIZE) {
    const batch = texts.slice(start, start + BATCH_SIZE)
    onProgress?.(`Embedding ${Math.min(start + batch.length, texts.length)}/${texts.length}`)

    const output = await extractor(batch, {
      pooling: 'mean',
      normalize: true,
    })

    const serialized = output.tolist()
    const rows = Array.isArray(serialized[0])
      ? (serialized as number[][])
      : [serialized as number[]]

    vectors.push(...rows)
  }

  return vectors
}

async function getExtractor(onProgress?: (detail: string) => void) {
  if (!extractorPromise) {
    onProgress?.('Downloading multilingual embedding model')
    extractorPromise = createPipeline('feature-extraction', MODEL_ID, {
      progress_callback: (progress: ProgressInfo) => {
        if (progress.status === 'progress' && progress.progress) {
          onProgress?.(`Model download ${Math.round(progress.progress)}%`)
          return
        }

        if (typeof progress.status === 'string') {
          onProgress?.(`Model ${progress.status}`)
        }
      },
      quantized: true,
    })
  }

  return extractorPromise
}
