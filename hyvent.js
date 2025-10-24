require("dotenv").config();
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
const puppeteer = require("puppeteer");

const { ensureTable, isSeen, markAsSeen } = require("./db_hyvent");

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const POSHMARK_URL =
  "https://poshmark.com/search?query=the%20north%20face%20dryvent&sort_by=added_desc&brand%5B%5D=The%20North%20Face&department=Women&category=Jackets_%26_Coats&price%5B%5D=-35&size%5B%5D=M&size%5B%5D=S&size%5B%5D=L";

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
    console.log("📬 Telegram API response:", data);
  } catch (error) {
    console.error("❌ Failed to send Telegram message:", error);
  }
}

async function checkPoshmark() {
  console.log("⏳ Launching Puppeteer...");
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    protocolTimeout: 60000,
  });
  const page = await browser.newPage();

  console.log("🌐 Navigating to Poshmark...");
  await page.goto(POSHMARK_URL, {
    waitUntil: "domcontentloaded",
    timeout: 20000,
  });
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Scroll to load listings
  let previousHeight = 0;
  const maxScrolls = 10;

  for (let i = 0; i < maxScrolls; i++) {
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight);
    });

    const newHeight = await page.evaluate(() => document.body.scrollHeight);

    if (newHeight === previousHeight) {
      console.log("🛑 No more content loaded. Stopping scroll.");
      break;
    }

    previousHeight = newHeight;
    console.log(`⬇️ Scrolled ${i + 1} times...`);
    console.log(`Previous: ${previousHeight}, New: ${newHeight}`);
  }

  console.log("🧽 Scraping listing links...");
  const links = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll("a.tile__covershot"));
    return anchors.map((a) => "https://poshmark.com" + a.getAttribute("href"));
  });

  console.log(`🔗 Found ${links.length} links`);
  console.log("🧾 Listing URLs:");
  console.log(links.slice(0, 2));

  let matchCount = 0;
  const maxMatches = 10;
  let firstMatch = true;

  for (let i = 0; i < links.length && matchCount < maxMatches; i++) {
    const url = links[i];

    if (await isSeen(url)) {
      console.log("🔁 Already sent, skipping:", url);
      continue;
    }

    const productPage = await browser.newPage(); // 🔄 NEW TAB for each item
    try {
      console.log(`🔍 Visiting ${url}`);
      await productPage.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 20000, // 🔄 20-second timeout
      });
      await new Promise((r) => setTimeout(r, 3000));

      const item = await productPage.evaluate(() => {
        const title = document
          .querySelector("h1.listing__title-container")
          ?.innerText?.trim();
        const rawPrice = document.querySelector("p.h1")?.innerText?.trim();
        const price = rawPrice?.match(/\$\d+/)?.[0];
        const size = document
          .querySelector("button.size-selector__size-option")
          ?.innerText?.trim();
        return { title, price, size };
      });

      item.link = url;

      if (item.title && item.price && item.size) {
        const numericPrice = parseFloat(item.price.replace("$", ""));

        console.log("📄 Produto encontrado:");
        console.log(`   🏷️ Título: ${item.title}`);
        console.log(`   💵 Preço: ${item.price}`);
        console.log(`   📐 Tamanho: ${item.size}`);

        const flaws = [
          "flaw",
          "flaws",
          "flawed",
          "polartec",
          "vest",
          "stain",
          "damaged",
        ];

        const titleLower = item.title.toLowerCase();
        const hasFlaw = flaws.some((word) => titleLower.includes(word));

        if (!hasFlaw) {
          if (firstMatch) {
            await sendTelegramMessage("\u2063");
            await sendTelegramMessage(
              "🔔 *You got new deals!*\n\nHere are the latest Women dryvent Jackets:"
            );
            firstMatch = false;
          }

          const message = `🧥 *${item.title}*\n💰 ${numericPrice}\n📏 Size: ${item.size}\n🔗 ${item.link}`;
          await sendTelegramMessage(message);
          matchCount++;
          await markAsSeen(item.link);

          console.log(
            `✅ Enviado ao Telegram! (${matchCount}/${maxMatches})\n`
          );
        }
      }
    } catch (err) {
      console.warn(`⚠️ Failed on ${url}:`, err.message);
    } finally {
      await productPage.close(); // ✅ Always close tab
    }
  }

  await browser.close();
  console.log(`📦 Final matches sent: ${matchCount}`);
}

// ✅ MAIN FUNCTION TO RUN THE APP
async function main() {
  await ensureTable(); // Only runs at runtime
  await checkPoshmark();
}

main();
