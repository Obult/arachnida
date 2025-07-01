const fs = require('fs');
const exifParser = require('exif-parser');
const path = require('path');

const args = process.argv.slice(2);

function loadFile(filePath) {
  try {
    const resolvedPath = path.resolve(filePath);
    const data = fs.readFileSync(resolvedPath);
    return data; // Returns a Buffer
  } catch (err) {
    console.error(`Error loading file: ${err.message}`);
    return null;
  }
}

for (const filename of args) {
    // console.log("filename: ", filename);
      const buffer = loadFile(filename);
    if (buffer === null) {
        continue;
    }

    if (filename.endsWith(".png")) {
        png_show_meta(buffer);
    } else if (filename.toLowerCase().endsWith(".jpg") || filename.toLowerCase().endsWith(".jpeg")) {
        jpg_show_meta(buffer);
    } else if (filename.endsWith(".bmp")) {
        bmp_show_meta(buffer);
    } else if (filename.endsWith(".gif")) {
        gif_show_meta(buffer);
    }

}

function png_show_meta(buffer) {
    let position = 8; // skip the PNG signature

    // iterate of the chuncks
    while (position < buffer.length) {
      const chunk_len = buffer.readUInt32BE(position);
      position += 4;

        const chunk_enc = buffer.toString(encoding = 'utf8', position, position + 4);
        position += 4;

        const chunk_data = buffer.slice(position, position + chunk_len);

        if (chunk_enc === "tEXt") {
          display_text(chunk_data);
        } else if (chunk_enc === "zTXt") {
          display_ztxt(chunk_data);
        } else if (chunk_enc === "iTXt") {
          display_itxt(chunk_data);
        } else if (chunk_enc === "eXIf") {
          display_exif(chunk_data);
        }

        position += chunk_len + 4; // 4 bytes for a small checksum
    }
}

// *********** tEXt

function display_text(text) {
    console.log("tEXt: ", text.toString());
    
}

// *********** zTXt

const zlib = require('zlib');

function parseZTXt(data) {
  const nullIndex = data.indexOf(0x00);
  if (nullIndex === -1) return null;

  const keyword = data.slice(0, nullIndex).toString('ascii');
  const compressionMethod = data[nullIndex + 1];

  if (compressionMethod !== 0) throw new Error('Unsupported compression method');

  const compressedText = data.slice(nullIndex + 2);
  const decompressedText = zlib.inflateSync(compressedText).toString('utf-8');

  return { keyword, text: decompressedText };
}

function display_ztxt(data) {
  const text = parseZTXt(data);
  console.log("zTXt: ", text);
}

// *********** iTXt

function parseITXt(data) {
  let offset = 0;

  const readNullTermString = () => {
    const end = data.indexOf(0x00, offset);
    const str = data.slice(offset, end).toString('utf-8');
    offset = end + 1;
    return str;
  };

  const keyword = readNullTermString();
  const compressionFlag = data[offset++];
  const compressionMethod = data[offset++];

  const languageTag = readNullTermString(); // optional
  const translatedKeyword = readNullTermString(); // optional

  const textData = data.slice(offset);

  let text = '';
  if (compressionFlag === 1) {
    if (compressionMethod !== 0) throw new Error('Unsupported compression method');
    text = zlib.inflateSync(textData).toString('utf-8');
  } else {
    text = textData.toString('utf-8');
  }

  return { keyword, text, languageTag, translatedKeyword };
}

function display_itxt(data) {
  const text = parseITXt(data);

  console.log("iTXt: ", text);
}

// *********** eXIf

function display_exif(data) {
  const parser = exifParser.create(data);
  const result = parser.parse();
  console.log("eXIf: ", result.tags); // displays parsed EXIF tags
}

// *********** Other file types than PNG

function parseJPEG(buffer) {
  try {
    const parser = exifParser.create(buffer);
    const result = parser.parse();

    let output = 'JPEG Metadata:\n';
    for (const [key, value] of Object.entries(result.tags)) {
      output += `  ${key}: ${value}\n`;
    }
    return output;
  } catch (err) {
    console.log(err);
    return 'JPEG Metadata: Failed to parse EXIF data.\n';
  }
}

function jpg_show_meta(buffer) {
  const metadata = parseJPEG(buffer);
  console.log("jpg metadata: ", metadata);
}

function parseGIF(buffer) {
  if (buffer.slice(0, 6).toString() !== 'GIF89a' && buffer.slice(0, 6).toString() !== 'GIF87a') {
    return 'GIF Metadata: Not a valid GIF.\n';
  }

  const width = buffer.readUInt16LE(6);
  const height = buffer.readUInt16LE(8);
  const hasGlobalColorTable = (buffer[10] & 0x80) !== 0;

  return `GIF Metadata:\n  Width: ${width}\n  Height: ${height}\n  Global Color Table: ${hasGlobalColorTable}\n`;
}

function gif_show_meta(buffer) {
  const metadata = parseGIF(buffer);
  console.log("gif metadata: ", metadata);
}

function parseBMP(buffer) {
  if (buffer.slice(0, 2).toString() !== 'BM') {
    return 'BMP Metadata: Not a valid BMP.\n';
  }

  const size = buffer.readUInt32LE(2);
  const width = buffer.readInt32LE(18);
  const height = buffer.readInt32LE(22);
  const bitsPerPixel = buffer.readUInt16LE(28);

  return `BMP Metadata:\n  File Size: ${size} bytes\n  Width: ${width}\n  Height: ${height}\n  Bits Per Pixel: ${bitsPerPixel}\n`;
}

function bmp_show_meta(buffer) {
  const metadata = parseBMP(buffer);
  console.log("bmp metadata: ", metadata);
}

