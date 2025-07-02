const https = require('https');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

async function downloadAndExtractCCCEDICT() {
  const url = 'https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz';
  const dataDir = path.join(__dirname, '..', 'data');
  const gzPath = path.join(dataDir, 'cedict.txt.gz');
  const txtPath = path.join(dataDir, 'cedict.txt');

  // Create data directory
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  console.log('Downloading CC-CEDICT dictionary...');
  
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(gzPath);
    
    https.get(url, (response) => {
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log('Download completed. Extracting...');
        
        // Extract the gzipped file
        fs.createReadStream(gzPath)
          .pipe(zlib.createGunzip())
          .pipe(fs.createWriteStream(txtPath))
          .on('finish', () => {
            console.log(`Dictionary extracted to: ${txtPath}`);
            // Clean up compressed file
            fs.unlinkSync(gzPath);
            resolve(txtPath);
          });
      });
    }).on('error', (err) => {
      fs.unlink(gzPath, () => {});
      reject(err);
    });
  });
}

if (require.main === module) {
  downloadAndExtractCCCEDICT()
    .then(path => console.log(`Success! Dictionary saved to: ${path}`))
    .catch(err => console.error('Error:', err));
}

module.exports = { downloadAndExtractCCCEDICT };
