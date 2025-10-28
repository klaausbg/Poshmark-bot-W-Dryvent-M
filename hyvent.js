require("dotenv").config();
const fs = require("fs");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");


const { ensureTable, isSeen, markAsSeen } = require("./db_hyvent");

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const POSHMARK_URL =
  "https://poshmark.com/search?query=the%20north%20face%20dryvent&sort_by=added_desc&brand%5B%5D=The%20North%20Face&department=Women&category=Jackets_%26_Coats&price%5B%5D=-35&size%5B%5D=M&size%5B%5D=S&size%5B%5D=L";

// ========== HELPERS ==========

async function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function logError(err) {
  const time = new Date().toISOString();
  fs.appendFileSync("errors.log", `[${time}] ${err.stack || err}\n`);
}

// ========== TELEGRAM ==========

async function sendTelegramMessage(message) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  console.log("📲 Sending message to Telegram:", message);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        parse_mode: "Markdown",
        disable_web_page_preview: false,
      }),
    });

    const data = await response.json();
    if (!data.ok) throw new Error(JSON.stringify(data));
    console.log("📬 Telegram OK:", data.result?.message_id || "no id");
  } catch (error) {
    console.error("❌ Failed to send Telegram message:", error.message);
    logError(error);
  }
}

// ========== POSHMARK SCRAPER ==========

async function checkPoshmark() {
  console.log("⏳ Launching Puppeteer...");

const browser = await puppeteer.launch({
  args: chromium.args,
  defaultViewport: chromium.defaultViewport,
  executablePath: await chromium.executablePath(),
  headless: chromium.headless,
  protocolTimeout: 60000,
});


  browser.on("disconnected", () => {
    console.error("❌ Chrome crashed or disconnected — restarting...");
    process.exit(1); // Railway will restart the process
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/114.0.0.0 Safari/537.36"
  );

  console.log("🌐 Navigating to Poshmark...");
  await page.goto(POSHMARK_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await delay(5000);

  // Scroll down to load all listings
  console.log("🔽 Scrolling listings...");
  let prevHeight = 0;
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await delay(1500);
    const newHeight = await page.evaluate(() => document.body.scrollHeight);
    if (newHeight === prevHeight) break;
    prevHeight = newHeight;
  }

  console.log("🧽 Scraping listing links...");
  const links = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll("a.tile__covershot"));
    return anchors.map((a) => "https://poshmark.com" + a.getAttribute("href"));
  });

  console.log(`🔗 Found ${links.length} links`);
  let matchCount = 0;
  const maxMatches = 10;
  let firstMatch = true;

  for (const url of links) {
    if (matchCount >= maxMatches) break;

    const seen = await isSeen(url);
    if (seen) {
      console.log("🔁 Already sent, skipping:", url);
      continue;
    }

    try {
      console.log(`🔍 Visiting ${url}`);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
      await delay(2500);

      const item = await page.evaluate(() => {
        const title = document.querySelector("h1.listing__title-container")?.innerText?.trim();
        const rawPrice = document.querySelector("p.h1")?.innerText?.trim();
        const price = rawPrice?.match(/\$\d+/)?.[0];
        const size = document.querySelector("button.size-selector__size-option")?.innerText?.trim();
        return { title, price, size };
      });

      if (!item.title || !item.price || !item.size) continue;
      item.link = url;

      const numericPrice = parseFloat(item.price.replace("$", ""));
      const flaws = ["flaw", "flaws", "flawed", "polartec", "vest", "stain", "damaged"];
      const hasFlaw = flaws.some((f) => item.title.toLowerCase().includes(f));

      if (!hasFlaw) {
        if (firstMatch) {
          await sendTelegramMessage("\u2063");
          await sendTelegramMessage("🔔 *You got new deals!*\n\nHere are the latest Women DryVent Jackets:");
          firstMatch = false;
        }

        const message = `🧥 *${item.title}*\n💰 ${numericPrice}\n📏 Size: ${item.size}\n🔗 ${item.link}`;
        await sendTelegramMessage(message);
        await markAsSeen(url);

        matchCount++;
        console.log(`✅ Sent to Telegram (${matchCount}/${maxMatches})`);
      }
    } catch (err) {
      console.error(`⚠️ Failed on ${url}:`, err.message);
      logError(err);
    }

    await delay(1200 + Math.random() * 800); // Delay between listings
  }

  console.log(`📦 Final matches sent: ${matchCount}`);
  await browser.close();
}

// ========== MAIN FUNCTION ==========

(async function main() {
  try {
    await ensureTable();
    await checkPoshmark();
  } catch (err) {
    console.error("💥 Fatal error:", err);
    logError(err);
  } finally {
    console.log("🔁 Restarting after completion...");
    setTimeout(() => process.exit(0), 2000);
  }
})();
