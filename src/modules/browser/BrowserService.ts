import { chromium } from 'playwright-extra';
// @ts-ignore
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
// @ts-ignore
import { FingerprintGenerator } from 'fingerprint-generator';
// @ts-ignore
import { FingerprintInjector } from 'fingerprint-injector';
import { Browser, BrowserContext } from 'playwright';

// Setup Stealth Plugin globally for Playwright Extra
chromium.use(stealthPlugin());

export class BrowserService {
    private browser: Browser | null = null;
    private readonly fingerprintGenerator: any;
    private readonly fingerprintInjector: any;

    constructor() {
        this.fingerprintGenerator = new FingerprintGenerator();
        this.fingerprintInjector = new FingerprintInjector();
    }

    async initBrowser() {
        if (!this.browser) {
            console.log('[BrowserService] Starting headless Chromium engine...');
            this.browser = await chromium.launch({
                headless: true, // Crucial: Run in background to consume less memory
                args: [
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox',
                    '--disable-setuid-sandbox'
                ]
            });
        }
        return this.browser;
    }

    async closeBrowser() {
        if (this.browser) {
            await this.browser.close();
        }
    }

    /**
     * Create isolated, stealthy browser context
     */
    async createStealthContext(proxyUrl?: string): Promise<BrowserContext> {
        if (!this.browser) await this.initBrowser();

        console.log(`[BrowserService] Creating new isolated context${proxyUrl ? ' with Proxy: ' + proxyUrl.split('@')[1] : ''}`);

        // 1. Generate realistic fingerprint
        const fingerprintConfig = {
            devices: ['desktop'],
            browsers: ['chrome', 'edge'],
            operatingSystems: ['windows', 'macos']
        };
        const fingerprintData = this.fingerprintGenerator.getFingerprint(fingerprintConfig);
        const { fingerprint } = fingerprintData;

        // 2. Setup Context options
        const contextOptions: any = {
            userAgent: fingerprint.navigator.userAgent,
            viewport: {
                width: fingerprint.screen.width,
                height: fingerprint.screen.height
            },
            locale: fingerprint.navigator.language,
            timezoneId: fingerprint.navigator.timezone || 'Asia/Jakarta',
            javaScriptEnabled: true,
        };

        if (proxyUrl) {
            contextOptions.proxy = { server: proxyUrl };
        }

        // 3. Spawning the Context
        const context = await this.browser!.newContext(contextOptions);

        // 4. Inject complex fingerprint signatures (Canvas, WebGL, etc)
        await this.fingerprintInjector.attachFingerprintToPlaywright(context, fingerprintData);

        return context;
    }
}
