/**
 * 形近词发现（C6：墨墨无相似词数据，本地编辑距离算法）。
 *
 * 单词接口无法列举全量词汇，候选只能来自已知词集合（FR-4 约束说明）。
 * 已知词集合可能上万（实测 8614），朴素两两比较是 O(n²) ≈ 3700 万次，
 * 必须用长度桶预过滤：编辑距离 ≤ maxDist 的两词长度差必 ≤ maxDist。
 */

/** 带上限的 Damerau 简化版：仅计算编辑距离，超过 maxDistance 提前返回 */
export function boundedEditDistance(a: string, b: string, maxDistance: number): number
{
  if (a === b)
  {
    return 0
  }

  const lenA = a.length
  const lenB = b.length

  if (Math.abs(lenA - lenB) > maxDistance)
  {
    return maxDistance + 1
  }

  // 滚动数组，空间 O(min)
  let prev = new Array<number>(lenB + 1)
  let curr = new Array<number>(lenB + 1)

  for (let j = 0; j <= lenB; j++)
  {
    prev[j] = j
  }

  for (let i = 1; i <= lenA; i++)
  {
    curr[0] = i
    let rowMin = curr[0]!

    for (let j = 1; j <= lenB; j++)
    {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(
        prev[j]! + 1,
        curr[j - 1]! + 1,
        prev[j - 1]! + cost
      )

      rowMin = Math.min(rowMin, curr[j]!)
    }

    // 整行下界已超阈值，提前终止
    if (rowMin > maxDistance)
    {
      return maxDistance + 1
    }

    const swap = prev
    prev = curr
    curr = swap
  }

  return prev[lenB]!
}

export interface SimilarPair
{
  a: string
  b: string
  distance: number
}

/**
 * 在已知词集合中寻找形近词。
 *
 * 长度桶：只在长度差 ≤ maxDistance 的词之间比较，
 * 8614 词全量扫描在毫秒级完成（R4 风险的落地实现）。
 */
export function findSimilarWords(
  words: string[],
  maxDistance = 1
): SimilarPair[]
{
  const normalized = [...new Set(words.map((w) => w.trim().toLowerCase()))].filter(
    (w) => w.length > 0
  )

  const buckets = new Map<number, string[]>()

  for (const word of normalized)
  {
    const list = buckets.get(word.length) ?? []
    list.push(word)
    buckets.set(word.length, list)
  }

  const lengths = [...buckets.keys()].sort((a, b) => a - b)
  const pairs: SimilarPair[] = []
  const seen = new Set<string>()

  for (const len of lengths)
  {
    for (let delta = 0; delta <= maxDistance; delta++)
    {
      const other = len + delta
      const listA = buckets.get(len)

      if (!listA)
      {
        continue
      }

      if (delta === 0)
      {
        collectPairs(listA, listA, maxDistance, pairs, seen, true)
      }
      else
      {
        const listB = buckets.get(other)

        if (listB)
        {
          collectPairs(listA, listB, maxDistance, pairs, seen, false)
        }
      }
    }
  }

  return pairs
}

function collectPairs(
  listA: string[],
  listB: string[],
  maxDistance: number,
  pairs: SimilarPair[],
  seen: Set<string>,
  sameList: boolean
): void
{
  for (let i = 0; i < listA.length; i++)
  {
    const start = sameList ? i + 1 : 0

    for (let j = start; j < listB.length; j++)
    {
      const a = listA[i]!
      const b = listB[j]!

      // 长度差快速剪枝
      if (Math.abs(a.length - b.length) > maxDistance)
      {
        continue
      }

      const distance = boundedEditDistance(a, b, maxDistance)

      if (distance <= maxDistance)
      {
        const key = a < b ? `${a}|${b}` : `${b}|${a}`

        if (!seen.has(key))
        {
          seen.add(key)
          pairs.push({ a, b, distance })
        }
      }
    }
  }
}
