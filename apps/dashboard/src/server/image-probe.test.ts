import { describe, expect, it } from "vitest";

import { originalVariants, parseDimensions } from "./image-probe";

describe("originalVariants", () => {
  it("strips the Magento image_resizer cache segment", () => {
    expect(
      originalVariants(
        "https://www.arteriorshome.com/media/image_resizer/cache/35d4943b4983c7fe89a79ab64855558b/wysiwyg/homepage/Banner.jpg",
      )[0],
    ).toBe("https://www.arteriorshome.com/media/wysiwyg/homepage/Banner.jpg");
  });

  it("strips the Magento catalog product cache segment", () => {
    expect(
      originalVariants(
        "https://www.arteriorshome.com/media/catalog/product/cache/3f7ce34262a2f7f6f61820b329699049/f/r/fru19_2.jpg",
      )[0],
    ).toBe(
      "https://www.arteriorshome.com/media/catalog/product/f/r/fru19_2.jpg",
    );
  });

  it("strips a Shopify size suffix but keeps the version query", () => {
    expect(
      originalVariants(
        "https://www.artistictile.com/cdn/shop/files/Vignola_1920x.jpg?v=1783521858",
      )[0],
    ).toBe(
      "https://www.artistictile.com/cdn/shop/files/Vignola.jpg?v=1783521858",
    );
  });

  it("always keeps the input as the final fallback", () => {
    const url = "https://example.com/media/photo.jpg";
    expect(originalVariants(url)).toEqual([url]);
  });

  it("does not treat a short hex directory as a cache segment", () => {
    const url = "https://example.com/cache/abc123/photo.jpg";
    expect(originalVariants(url)).toEqual([url]);
  });
});

describe("parseDimensions", () => {
  it("reads PNG IHDR", () => {
    const buf = Buffer.alloc(32);
    buf.writeUInt32BE(0x89504e47, 0);
    buf.writeUInt32BE(1280, 16);
    buf.writeUInt32BE(720, 20);
    expect(parseDimensions(buf)).toEqual({ width: 1280, height: 720 });
  });

  it("reads GIF header", () => {
    const buf = Buffer.alloc(16);
    buf.write("GIF89a", 0, "ascii");
    buf.writeUInt16LE(640, 6);
    buf.writeUInt16LE(480, 8);
    expect(parseDimensions(buf)).toEqual({ width: 640, height: 480 });
  });

  it("walks JPEG segments past a padding block to reach SOF0", () => {
    // SOI, then an APP0 segment to skip, then SOF0 carrying the real size.
    const app0Payload = 40;
    const buf = Buffer.alloc(2 + 2 + app0Payload + 12);
    let i = 0;
    buf[i++] = 0xff;
    buf[i++] = 0xd8; // SOI
    buf[i++] = 0xff;
    buf[i++] = 0xe0; // APP0
    buf.writeUInt16BE(app0Payload, i);
    i += app0Payload; // length field counts itself
    buf[i++] = 0xff;
    buf[i++] = 0xc0; // SOF0
    buf.writeUInt16BE(11, i); // segment length
    buf.writeUInt16BE(1774, i + 3); // height
    buf.writeUInt16BE(3840, i + 5); // width
    expect(parseDimensions(buf)).toEqual({ width: 3840, height: 1774 });
  });

  it("returns null for a non-image payload", () => {
    expect(parseDimensions(Buffer.from("<!doctype html><html>"))).toBeNull();
  });
});
