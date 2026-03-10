import { chromium } from 'playwright-extra';
// To maintain pure browser context without stealth overhead for simple polling
import { Config } from '../../config';

export class ObserverService {
    private isLive: boolean = false;
    private targetUrl: string | null = null;

    /**
     * Polls the landing page looking for a link that matches our target (e.g. Loket.com).
     * @returns The discovered target URL
     */
    async startMonitoring(): Promise<string> {
        console.log(`[Observer] Starting to monitor: ${Config.LANDING_PAGE_URL}`);

        // Use a lightweight chromium instance for monitoring
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();

        while (!this.isLive) {
            try {
                // Navigate and wait until network is mostly idle to ensure UI renders
                await page.goto(Config.LANDING_PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });

                // Strategy 1: Check all links on the page for the target keyword
                const links = await page.$$eval('a', (anchors) => anchors.map(a => a.href));

                for (const href of links) {
                    if (
                        href && 
                        href.includes(Config.TARGET_KEYWORD) && 
                        href.startsWith('http')
                    ) {
                        this.isLive = true;
                        this.targetUrl = href;
                        console.log(`\n======================================\n[Observer] 🚨 TICKETING OVEN LIVE! 🚨\nURL: ${this.targetUrl}\n======================================\n`);
                        break;
                    }
                }

                if (!this.isLive) {
                    process.stdout.write('.'); // simple visual indicator of polling
                    // Jittered interval to avoid aggressive static polling detection
                    const jitter = Math.floor(Math.random() * 2000);
                    await page.waitForTimeout(Config.POLLING_INTERVAL + jitter);
                }

            } catch (error: any) {
                console.warn(`\n[Observer] Polling error: ${error.message}, retrying...`);
                await page.waitForTimeout(2000);
            }
        }

        await browser.close();
        return this.targetUrl!;
    }
}
