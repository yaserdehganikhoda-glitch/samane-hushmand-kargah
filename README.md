# سامانه‌ی کارگاه هوشمند

برنامه‌ی وب/اندروید (Capacitor) برای ثبت کارکرد، پنل کارفرما و مالی. کاملاً آفلاین.

## ساخت
1. `npm install`
2. `node fetch-vendor.mjs www`   (فونت و آیکون‌ها؛ یک‌بار)
3. `npm run build:css`           (ساخت style.css؛ بعد از هر تغییر کلاس‌ها)
4. فایل‌های وب را در پوشه‌ی `www` بگذارید:
   index.html, sw.js, ai-assistant.js, native-notify.js, motivations-db.js,
   manifest.json, offline.html, style.css, آیکون‌ها
5. `npx cap sync android`
6. Android Studio → Build → Generate Signed Bundle / APK

## نکته‌ها
- keystore را هرگز در گیت قرار ندهید و از آن نسخه‌ی پشتیبان بگیرید.
- با تغییر sw.js یا لیست فایل‌های کش، عدد VERSION در sw.js را بالا ببرید.
- با هر انتشار، versionCode را در android/app/build.gradle بالا ببرید.
