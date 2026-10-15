import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { env } from '../config/env.js'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const KEY_LENGTH = 32

/** 与 maimemo_credentials / ai_credentials 表字段一一对应（PRD 第 8.1 节） */
export interface EncryptedToken
{
  ciphertext: string
  iv: string
  authTag: string
  keyVersion: number
}

/**
 * 凭据作用域。
 *
 * 同一张用户下可能存多类第三方凭据，若都用 userId 作 AAD，
 * 密文之间可以互相替换（把 AI Key 密文塞进墨墨 Token 字段）。
 * 加作用域后缀即可隔离，且不改变密钥与算法。
 */
export type CredentialScope = 'ai'

/**
 * 读取主密钥。
 *
 * 存放位置：服务器 .env（权限 600）或腾讯云 SSM 凭据管理。
 * 绝不进代码仓库、绝不进数据库备份。
 */
function getKey(): Buffer
{
  const key = Buffer.from(env.MAIMEMO_TOKEN_KEY, 'base64')
  if (key.length !== KEY_LENGTH)
  {
    throw new Error(`MAIMEMO_TOKEN_KEY 必须是 base64 编码的 ${KEY_LENGTH} 字节密钥`)
  }

  return key
}

/**
 * 构造附加认证数据（AAD）。
 *
 * 不传 scope 时退化为 userId 本身——这是墨墨 Token 的历史行为，
 * 已落库的密文必须继续按此解密，不能擅自改前缀。
 */
function buildAad(userId: string, scope?: CredentialScope): Buffer
{
  return Buffer.from(scope ? `${userId}:${scope}` : userId, 'utf8')
}

/** 每次写入重新生成 IV，AAD 由调用方决定 */
function seal(plaintext: string, aad: Buffer): EncryptedToken
{
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  cipher.setAAD(aad)

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    keyVersion: env.MAIMEMO_TOKEN_KEY_VERSION
  }
}

/** AAD 不匹配（userId 被篡改或密文被移用）会直接抛异常，不会返回错误明文 */
function open(record: EncryptedToken, aad: Buffer): string
{
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(record.iv, 'base64'))
  decipher.setAAD(aad)
  decipher.setAuthTag(Buffer.from(record.authTag, 'base64'))

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, 'base64')),
    decipher.final()
  ])

  return plaintext.toString('utf8')
}

/** 加密墨墨 Token（AAD = userId，历史行为，勿改） */
export function encryptToken(plaintext: string, userId: string): EncryptedToken
{
  return seal(plaintext, buildAad(userId))
}

/** 解密墨墨 Token */
export function decryptToken(record: EncryptedToken, userId: string): string
{
  return open(record, buildAad(userId))
}

/** 加密带作用域的凭据（当前仅 AI Key 使用） */
export function encryptScopedSecret(
  plaintext: string,
  userId: string,
  scope: CredentialScope
): EncryptedToken
{
  return seal(plaintext, buildAad(userId, scope))
}

/** 解密带作用域的凭据 */
export function decryptScopedSecret(
  record: EncryptedToken,
  userId: string,
  scope: CredentialScope
): string
{
  return open(record, buildAad(userId, scope))
}

/** 生成仅供 UI 回显的 Key 摘要（末 4 位），不足以还原密钥 */
export function hintKey(apiKey: string): string
{
  const tail = apiKey.slice(-4)
  return tail ? `****${tail}` : '****'
}
