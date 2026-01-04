/**
 * Download all-MiniLM-L6-v2 model from Hugging Face
 * This script downloads the ONNX quantized version for optimal performance
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const MODEL_DIR = path.join(__dirname, '../resources/models/all-MiniLM-L6-v2');
const BASE_URL = 'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main';

const FILES_TO_DOWNLOAD = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
  'onnx/model_quantized.onnx'
];

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading: ${url}`);
    const file = fs.createWriteStream(dest);

    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloadedSize = 0;

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        const progress = ((downloadedSize / totalSize) * 100).toFixed(2);
        process.stdout.write(`\rProgress: ${progress}%`);
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log(`\n✓ Downloaded: ${path.basename(dest)}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function main() {
  console.log('Starting model download...\n');

  // Create onnx subdirectory
  const onnxDir = path.join(MODEL_DIR, 'onnx');
  if (!fs.existsSync(onnxDir)) {
    fs.mkdirSync(onnxDir, { recursive: true });
  }

  for (const file of FILES_TO_DOWNLOAD) {
    const url = `${BASE_URL}/${file}`;
    const dest = path.join(MODEL_DIR, file);

    try {
      await downloadFile(url, dest);
    } catch (error) {
      console.error(`\n✗ Failed to download ${file}:`, error.message);
      process.exit(1);
    }
  }

  console.log('\n✓ All files downloaded successfully!');
  console.log(`Model location: ${MODEL_DIR}`);
}

main();
