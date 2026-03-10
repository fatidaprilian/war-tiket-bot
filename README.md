# 🎫 War Tiket Bot (currently only for Loket.com)

A high-performance headless browser automation tool to snipe Loket.com tickets out of the oven, using Playwright Extra, Stealth Plugin, and Geonode Residential Proxies.

## 🚀 Features
- **Platform Focus:** Currently strictly built and optimized **only for Loket.com** checkouts.
- **Single Target Execution:** Designed to secure **1 successful transaction** (1 Ticket/Order) per run. Once any of the concurrent browsers successfully snipes the ticket, all other browsers will automatically abort to prevent duplicate orders.
- **Concurrent Execution:** Run 10+ browser contexts simultaneously to secure a queue spot.
- **Stealth Mode:** Evades Cloudflare/Bot detection via `puppeteer-extra-plugin-stealth` & realistic fingerprints.
- **Proxy Rotation:** Uses residential proxies to avoid rate limiting and IP bans.
- **Telegram Notifications:** Get real-time text alerts + screenshots once successfully queued/invoiced.
- **Auto Form Fills:** Fast and robust injection of personal info and checkout forms.

## 📦 Setup & Installation
1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and fill in your details:
   ```bash
   cp .env.example .env
   ```
4. Setup Telegram:
   - Create a bot with [@BotFather](https://t.me/botfather) and get the `TELEGRAM_BOT_TOKEN`.
   - Message your bot and get your `TELEGRAM_CHAT_ID` (you can use @userinfobot).

## 🎮 Usage
To start the bot, simply run:
```bash
npm start
```
The bot will:
1. Constantly monitor the `LANDING_PAGE_URL` (Wait Page).
2. When the `TARGET_KEYWORD` (e.g. `loket.com`) link appears, it snipes the URL.
3. Automatically opens `BROWSER_CONCURRENCY` contexts, each with its own proxy and fingerprint.
4. Auto-selects ticket category, fills personal info, and chooses the payment method.
5. Sends an alert + screenshot to your Telegram once the VA/Invoice is reached.

## ⚠️ Disclaimer
This tool is for educational purposes only. Do not use this tool to abuse or overwhelm ticketing platforms. The author is not responsible for any direct or indirect consequences resulting from the use of this software.

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
