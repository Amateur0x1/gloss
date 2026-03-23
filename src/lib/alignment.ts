import type { MatchResult } from '../types'

export function findTopMatches(
  sourceEmbeddings: number[][],
  targetEmbeddings: number[][],
  sourceIndex: number,
  limit = 5,
): MatchResult[] {
  const selected = sourceEmbeddings[sourceIndex]
  if (!selected) {
    return []
  }

  return targetEmbeddings
    .map((target, targetIndex) => {
      const baseScore = cosineLike(selected, target)
      const score =
        baseScore +
        0.16 * neighborScore(sourceEmbeddings, targetEmbeddings, sourceIndex, targetIndex, -1) +
        0.16 * neighborScore(sourceEmbeddings, targetEmbeddings, sourceIndex, targetIndex, 1) +
        0.08 * neighborScore(sourceEmbeddings, targetEmbeddings, sourceIndex, targetIndex, -2) +
        0.08 * neighborScore(sourceEmbeddings, targetEmbeddings, sourceIndex, targetIndex, 2)

      return {
        targetIndex,
        baseScore,
        score,
      }
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
}

function neighborScore(
  sourceEmbeddings: number[][],
  targetEmbeddings: number[][],
  sourceIndex: number,
  targetIndex: number,
  offset: number,
) {
  const source = sourceEmbeddings[sourceIndex + offset]
  const target = targetEmbeddings[targetIndex + offset]

  if (!source || !target) {
    return 0
  }

  return Math.max(cosineLike(source, target), 0)
}

function cosineLike(left: number[], right: number[]) {
  let sum = 0

  for (let index = 0; index < left.length; index += 1) {
    sum += left[index] * (right[index] ?? 0)
  }

  return sum
}
