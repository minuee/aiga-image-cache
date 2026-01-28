import express from 'express';
import sharp from 'sharp';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dns from 'dns/promises';
import net from 'net';

const app = express();
const PORT = 7001;

const CACHE_DIR = path.join(process.cwd(), 'cache');
const FALLBACK_IMAGE = path.join(process.cwd(), 'assets/doctor_default.png');

/**
 * 🔒 사설 IP 판별
 */
function isPrivateIp(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === '::1') return true;

  return (
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('169.254.') ||
    (ip.startsWith('172.') && (() => {
      const n = Number(ip.split('.')[1]);
      return n >= 16 && n <= 31;
    })())
  );
}

/**
 * 🔒 SSRF 방지
 */
async function isPrivateHost(hostname: string): Promise<boolean> {
  if (net.isIP(hostname)) {
    return isPrivateIp(hostname);
  }

  const records = await dns.lookup(hostname, { all: true });
  return records.some(r => isPrivateIp(r.address));
}

/**
 * 공통 캐시 헤더
 */
function setCacheHeaders(res: express.Response, etag: string) {
  res.setHeader('Content-Type', 'image/webp');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('ETag', etag);
}

app.get('/check', async(req,res) => {
  return res.status(200).send('image cache');
})
app.get('/health', async(req,res) => {
    return res.status(200).send('ok');
})

app.get('/', async (req, res) => {
  const { url, w, h } = req.query as any;

  if (!url) {
    return res.status(400).send('url query is required');
  }

  try {
    const targetUrl = new URL(url);

    // protocol 제한
    if (!['http:', 'https:'].includes(targetUrl.protocol)) {
      throw new Error('invalid protocol');
    }

    // 사설망 차단
    if (await isPrivateHost(targetUrl.hostname)) {
      throw new Error('private network access denied');
    }

    // 캐시 키
    const hash = crypto
      .createHash('md5')
      .update(`${url}_${w || ''}_${h || ''}`)
      .digest('hex');

    const cacheDir = path.join(CACHE_DIR, hash.substring(0, 2), hash.substring(2, 4));
    const filePath = path.join(cacheDir, `${hash}.webp`);

    // 📦 캐시 HIT
    if (fs.existsSync(filePath)) {
      setCacheHeaders(res, hash);
      return res.sendFile(filePath);
    }

    // 📥 외부 이미지 요청
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 5000,
      maxContentLength: 5 * 1024 * 1024,
      maxRedirects: 5, // ⭐ 핵심
      validateStatus: status => status >= 200 && status < 300,
    });

    const contentType = response.headers['content-type'];
    if (!contentType?.startsWith('image/')) {
      throw new Error('not an image');
    }

    // 🖼 이미지 처리
    const buffer = await sharp(response.data)
      .resize(
        w ? Number(w) : undefined,
        h ? Number(h) : undefined,
        { fit: 'cover' }
      )
      .webp({ quality: 80 })
      .toBuffer();

    // 💾 캐시 저장
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(filePath, buffer);

    setCacheHeaders(res, hash);
    res.send(buffer);
  } catch (err) {
    console.warn('[IMAGE FALLBACK]', url);

    // ❗ 실패 시 기본 이미지 반환 (캐싱 ❌)
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    return res.sendFile(FALLBACK_IMAGE);
  }
});


app.listen(PORT, () => {
  console.log(`✅ Image server running on port ${PORT}`);
});
