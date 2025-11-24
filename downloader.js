import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import axios from "axios";

// URL cần tải
const targetUrl = "https://thegio.vn/";
const saveFolder = `./site/${new Date().getTime()}`;

// Tạo folder lưu
if (!fs.existsSync(saveFolder)) fs.mkdirSync(saveFolder, { recursive: true });

// Hàm tải file từ URL
async function downloadFile(fileUrl, folder) {
  try {
    const urlObj = new URL(fileUrl);
    let filePath = path.join(folder, urlObj.hostname, urlObj.pathname);
    if (filePath.endsWith("/")) filePath += "index.html";

    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    const response = await axios.get(fileUrl, { responseType: "arraybuffer" });
    fs.writeFileSync(filePath, response.data);
    console.log("✔ Tải:", fileUrl);
    return filePath;
  } catch (err) {
    console.log("✖ Không tải được:", fileUrl);
    return null;
  }
}

async function run() {
  const browser = await puppeteer.launch({ headless: true, defaultViewport: null });
  const page = await browser.newPage();

  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");

  console.log("⏳ Mở trang...");
  await page.goto(targetUrl, { waitUntil: "networkidle2" });

  // Scroll toàn trang để render GSAP / lazy load
  console.log("⬇️ Scroll trang để render GSAP / Lazy Content...");
  await page.evaluate(async () => {
    const step = 500;
    const delay = ms => new Promise(r => setTimeout(r, ms));
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await delay(200);
    }
    window.scrollTo(0, 0); // quay về top
    await delay(500);
  });

  // Chờ thêm animation hoàn tất
  await new Promise(r => setTimeout(r, 1500));

  console.log("📄 Lấy HTML...");
  let html = await page.content();

  // Lấy asset (CSS, JS, IMG)
  const assets = await page.evaluate(() => {
    const urls = [];
    document.querySelectorAll("link[rel='stylesheet']").forEach(e => e.href && urls.push(e.href));
    document.querySelectorAll("script[src]").forEach(e => e.src && urls.push(e.src));
    document.querySelectorAll("img").forEach(e => e.src && urls.push(e.src));
    document.querySelectorAll("[style]").forEach(e => {
      const matches = e.style.cssText.match(/url\(["']?(.*?)["']?\)/g);
      if (matches) matches.forEach(m => urls.push(m.replace(/url\(["']?|["']?\)/g, "")));
    });
    return urls.filter(u => u.startsWith("http") || u.startsWith("//")).map(u => u.startsWith("//") ? "https:" + u : u);
  });

  const uniqueAssets = [...new Set(assets)];
  console.log(`🔗 Tổng cộng ${uniqueAssets.length} asset.`);

  for (const asset of uniqueAssets) {
    const localPath = await downloadFile(asset, saveFolder);
    if (localPath) {
      const relativePath = path.relative(saveFolder, localPath).replace(/\\/g, "/");
      html = html.split(asset).join(relativePath);
    }
  }

  fs.writeFileSync(path.join(saveFolder, "index.html"), html);

  await browser.close();

  console.log("\n🎉 Hoàn tất! Website đã lưu tại ./site/index.html");
}

run();
