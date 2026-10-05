/*
 * پل اعلان‌های نیتیو — روی وب/PWA کاری انجام نمی‌دهد (کد اصلی برنامه از Web Notification API
 * استفاده می‌کند)؛ فقط داخل اپ اندرویدی، اعلان‌ها را از طریق پلاگین @capacitor/local-notifications
 * (که برخلاف Web Notification API، در WebView اندروید واقعاً کار می‌کند) نشان می‌دهد.
 */
(function () {
    function isNative() {
        return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    }

    // این فایل با <script> ساده بارگذاری می‌شود (بدون باندلر)، پس import('@capacitor/local-notifications')
    // در WebView خطا می‌دهد. پلاگین از طریق پل Capacitor در دسترس است (همان روشی که index.html برای یادآورها استفاده می‌کند).
    async function getPlugin() {
        const p = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications;
        if (!p) throw new Error('پلاگین LocalNotifications در دسترس نیست (npx cap sync android را اجرا کنید)');
        return p;
    }

    async function checkPermission() {
        if (!isNative()) return 'unsupported';
        try {
            const res = await (await getPlugin()).checkPermissions();
            window.__nativeNotifGranted = res.display === 'granted';
            return res.display; // 'granted' | 'denied' | 'prompt'
        } catch (e) {
            console.warn('بررسی مجوز اعلان نیتیو ناموفق بود:', e);
            return 'denied';
        }
    }

    async function requestPermission() {
        if (!isNative()) return 'unsupported';
        try {
            const res = await (await getPlugin()).requestPermissions();
            window.__nativeNotifGranted = res.display === 'granted';
            return res.display;
        } catch (e) {
            console.warn('درخواست مجوز اعلان نیتیو ناموفق بود:', e);
            return 'denied';
        }
    }

    let nextId = 1000;
    async function notify(title, body, tag) {
        if (!isNative()) return false;
        try {
            const id = (nextId++ % 2000000000) + Math.floor(Math.random() * 1000);
            await (await getPlugin()).schedule({
                notifications: [{ id, title, body, schedule: { at: new Date(Date.now() + 200) } }]
            });
            return true;
        } catch (e) {
            console.warn('ارسال اعلان نیتیو ناموفق بود:', e);
            return false;
        }
    }

    window.NativeNotify = { isSupported: isNative, checkPermission, requestPermission, notify };

    // در باز شدن اپ (فقط نسخه نیتیو)، وضعیت مجوز فعلی را از قبل کش می‌کند
    if (isNative()) checkPermission();
})();
