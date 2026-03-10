import { validateConfig, Config } from './config';
import { ObserverService } from './modules/observer/ObserverService';
import { BrowserService } from './modules/browser/BrowserService';
import { LoketSniperService } from './modules/sniper/LoketSniperService';
import { TelegramNotifier } from './modules/notification/TelegramNotifier';

async function bootstrap() {
    console.log("==========================================");
    console.log("   🎫 HEADLESS TICKET WAR BOT (LOKET)   ");
    console.log("==========================================\n");

    try {
        validateConfig();
    } catch (e: any) {
        console.error('❌ Configuration Error:', e.message);
        process.exit(1);
    }

    // 1. Initialize Services
    const observer = new ObserverService();
    const browserService = new BrowserService();
    const sniper = new LoketSniperService();
    const notifier = new TelegramNotifier();

    // 2. Start Monitoring Landing Page
    const targetUrl = await observer.startMonitoring();

    // 3. The Orchestration - Spawn Multiple Contexts simultaneously
    console.log(`\n[Orchestrator] Spawning ${Config.BROWSER_CONCURRENCY} Browser Contexts...`);

    // Ensure the main browser is initialized
    await browserService.initBrowser();


    console.log(`[Orchestrator] Ready to hit target: ${targetUrl}`);

    // 4. Fire the Snipers in Parallel
    const abortController = new AbortController();

    const sniperPromises = Array.from({ length: Config.BROWSER_CONCURRENCY }).map(async (_, index) => {
        const id = index + 1;
        console.log(`[Orchestrator] Spawning Sniper-${id}...`);

        try {
            // Distribute proxies evenly if USE_PROXY is true
            let proxyUrl = undefined;
            if (Config.USE_PROXY && Config.PROXIES.length > 0) {
                proxyUrl = Config.PROXIES[index % Config.PROXIES.length];
            }
            const context = await browserService.createStealthContext(proxyUrl);

            const loketSvc = new LoketSniperService();
            // Pass the abortSignal down so contexts can abort if another one wins
            const orderInfoResult = await loketSvc.execute(context, targetUrl, id, abortController.signal);

            if (orderInfoResult) {
                // We got a success! Abort all other snipers immediately.
                abortController.abort();
                console.log(`\n🎉 [Orchestrator] WINNER FOUND (Sniper-${id})! Aborting all other contexts... 🎉\n`);
                
                const pages = context.pages();
                // Use the LAST page (most recent tab) — Loket may have opened checkout in a new tab
                const successPage = pages[pages.length - 1];
                if (successPage) {
                    await notifier.sendSuccessNotification(successPage, orderInfoResult);
                }
            }
        } catch (e: any) {
            if (e.name === 'AbortError') {
                console.log(`[Orchestrator] Sniper-${id} aborted normally (Another context won).`);
            } else {
                console.error(`[Orchestrator] Sniper-${id} encountered error:`, e.message);
            }
        }
    });

    // We wait for all contexts to finish (or crash)
    await Promise.allSettled(sniperPromises);

    console.log('\n[Orchestrator] All sniper tasks completed.');
    console.log('[Orchestrator] Shutting down headless browser...');
    await browserService.closeBrowser();
    process.exit(0);
}

// Start bot
bootstrap().catch((err) => {
    console.error('❌ Fatal Bot Error:', err);
    process.exit(1);
});
