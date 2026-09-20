import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { env } from '../config/env.js'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const KEY_LENGTH = 32

/** 与 maimemo_credentials 表字段一一对应（PRD 第 8.1 节） */
export interface EncryptedToken
{
  ciphertext: string
  iv: string
  authTag: string
  keyVersion: number
}

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
 * 加密墨墨 Token。
 *
 * 每次写入重新生成 IV；以 userId 作为附加认证数据（AAD），
 * 防止密文被跨用户替换。
 */
export function encryptToken(plaintext: string, userId: string): EncryptedToken
{
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  cipher.setAAD(Buffer.from(userId, 'utf8'))

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    keyVersion: env.MAIMEMO_TOKEN_KEY_VERSION
  }
}

/**
 * 解密墨墨 Token。
 *
 * AAD 不匹配（如 userId 被篡改）会直接抛出异常，不会返回错误明文。
 */
export function decryptToken(record: EncryptedToken, userId: string): string
{
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(record.iv, 'base64'))
  decipher.setAAD(Buffer.from(userId, 'utf8'))
  decipher.setAuthTag(Buffer.from(record.authTag, 'base64'))

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, 'base64')),
    decipher.final()
  ])

  return plaintext.toString('utf8')
}
